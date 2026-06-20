"""
paper_processing_service.py
============================
DB-facing helpers (upsert subject/topic/difficulty, insert questions, link
topics, update paper status) plus the per-paper OCR → parse → classify →
store pipeline. Shared by both the CLI seeding script
(app/tools/seed_db_from_ocr.py) and the FastAPI route
(POST /ai/ocr/process-paper) so there's exactly one implementation of
"process a past year paper."
"""

import os
import uuid

from app.services import ocr_service, classification_service


# =============================================================================
# Database helpers
# =============================================================================

def fetch_papers(conn, status: str) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT pyp_id, title, storage_url, upload_date
            FROM past_year_papers
            WHERE status = %s
            ORDER BY upload_date ASC
            """,
            (status,),
        )
        return [
            {'pyp_id': str(r[0]), 'title': r[1],
             'storage_url': r[2], 'upload_date': r[3]}
            for r in cur.fetchall()
        ]


def fetch_paper_by_id(conn, pyp_id: str) -> dict | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT pyp_id, title, storage_url, upload_date
            FROM past_year_papers
            WHERE pyp_id = %s
            """,
            (pyp_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {'pyp_id': str(row[0]), 'title': row[1],
                'storage_url': row[2], 'upload_date': row[3]}


def upsert_subject(conn, name: str) -> str:
    """
    Case-insensitive lookup — without this, an auto-detected header like
    "SOFTWARE MAINTENANCE" creates a duplicate subject alongside an existing
    "Software Maintenance" instead of matching it (matches the
    case-insensitive convention already used by
    db_service.fetch_subject_id_by_name for the same reason).
    """
    with conn.cursor() as cur:
        cur.execute('SELECT subject_id, name FROM subjects WHERE LOWER(name) = LOWER(%s)', (name,))
        row = cur.fetchone()
        if row:
            return str(row[0])
        new_id = str(uuid.uuid4())
        cur.execute('INSERT INTO subjects (subject_id, name) VALUES (%s, %s)', (new_id, name))
        return new_id


def upsert_topic(conn, subject_id: str, name: str) -> str:
    """Case-insensitive lookup — same reasoning as upsert_subject above."""
    with conn.cursor() as cur:
        cur.execute(
            'SELECT topic_id FROM topics WHERE subject_id = %s AND LOWER(name) = LOWER(%s)',
            (subject_id, name)
        )
        row = cur.fetchone()
        if row:
            return str(row[0])
        new_id = str(uuid.uuid4())
        cur.execute(
            'INSERT INTO topics (topic_id, subject_id, name) VALUES (%s, %s, %s)',
            (new_id, subject_id, name)
        )
        return new_id


def upsert_difficulty(conn, name: str) -> str:
    with conn.cursor() as cur:
        cur.execute('SELECT difficulty_id FROM difficulties WHERE name = %s', (name,))
        row = cur.fetchone()
        if row:
            return str(row[0])
        new_id = str(uuid.uuid4())
        cur.execute(
            'INSERT INTO difficulties (difficulty_id, name) VALUES (%s, %s)',
            (new_id, name)
        )
        return new_id


def delete_existing_questions(conn, pyp_id: str) -> int:
    """
    Removes any questions already stored for this paper before a (re)process
    run inserts fresh ones — otherwise clicking "Reprocess" just piles
    duplicates on top of the previous run's results instead of replacing
    them.

    schema.sql declares ON DELETE CASCADE for question_topics/
    document_questions/solutions (and solution_history off solutions), but
    the live database's actual FK constraints are all `NO ACTION` — verified
    directly against information_schema.referential_constraints, the two
    have drifted apart. So this deletes child rows explicitly, in dependency
    order, rather than trusting a cascade that doesn't actually exist.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            DELETE FROM solution_history
            WHERE solution_id IN (
                SELECT solution_id FROM solutions
                WHERE question_id IN (SELECT question_id FROM questions WHERE pyp_id = %s)
            )
            """,
            (pyp_id,)
        )
        cur.execute(
            """
            DELETE FROM solutions
            WHERE question_id IN (SELECT question_id FROM questions WHERE pyp_id = %s)
            """,
            (pyp_id,)
        )
        cur.execute(
            """
            DELETE FROM document_questions
            WHERE question_id IN (SELECT question_id FROM questions WHERE pyp_id = %s)
            """,
            (pyp_id,)
        )
        cur.execute(
            """
            DELETE FROM question_topics
            WHERE question_id IN (SELECT question_id FROM questions WHERE pyp_id = %s)
            """,
            (pyp_id,)
        )
        cur.execute('DELETE FROM questions WHERE pyp_id = %s', (pyp_id,))
        return cur.rowcount


def insert_question(conn, pyp_id: str, content: str, marks) -> str:
    new_id = str(uuid.uuid4())
    safe_marks = marks if isinstance(marks, int) else 1
    with conn.cursor() as cur:
        cur.execute(
            'INSERT INTO questions (question_id, pyp_id, content, marks) VALUES (%s, %s, %s, %s)',
            (new_id, pyp_id, content, safe_marks)
        )
    return new_id


def link_question_topic(conn, question_id: str, topic_id: str, difficulty_id: str):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO question_topics (question_id, topic_id, difficulty_id)
            VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (question_id, topic_id, difficulty_id)
        )


def update_status(conn, pyp_id: str, status: str):
    with conn.cursor() as cur:
        cur.execute(
            'UPDATE past_year_papers SET status = %s WHERE pyp_id = %s',
            (status, pyp_id)
        )
    conn.commit()
    print(f"  Status updated → '{status}' for {pyp_id}")


# =============================================================================
# Per-paper pipeline
# =============================================================================

def process_paper(conn, paper: dict, config: dict, env: dict) -> int:
    """
    Runs the full OCR → parse → classify → store pipeline for one
    past_year_papers row. Returns the number of questions inserted (0 means
    "no questions detected" — caller decides whether that's a failure).
    Raises on hard errors (download/OCR failure) — caller is responsible for
    catching and marking the paper FAILED.
    """
    pyp_id      = paper['pyp_id']
    title       = paper['title']
    storage_url = paper['storage_url']
    subject     = config['default_subject']

    pdf_url = ocr_service.build_url(
        config['supabase_project_url'],
        config['supabase_bucket'],
        storage_url,
    )

    print(f"\n{'='*60}")
    print(f"  Paper  : {title}")
    print(f"  pyp_id : {pyp_id}")
    print(f"  URL    : {pdf_url}")
    print(f"{'='*60}")

    # ── Step 1: Download ─────────────────────────────────────────────────────
    pdf_path, chunks, raw_text = None, [], ''
    try:
        print("  [1/4] Downloading PDF...")
        pdf_path = ocr_service.download_pdf(pdf_url)
        print("  [1/4] ✓ Downloaded")

        # ── Step 2: Split → OCR ───────────────────────────────────────────────
        print("  [2/4] Splitting and OCR-ing PDF...")
        chunks   = ocr_service.split_pdf(pdf_path, ocr_service.PAGES_PER_CHUNK)
        raw_text = ocr_service.run_ocr(chunks, pyp_id)
        ocr_service.save_raw_ocr(raw_text, pyp_id)
        print(f"  [2/4] ✓ OCR complete — {len(raw_text)} chars extracted")
    except Exception as step_err:
        print(f"  [ERROR] OCR step failed: {step_err}")
        raise
    finally:
        ocr_service.cleanup(pdf_path, chunks)

    if not raw_text.strip():
        print("  [ERROR] OCR returned empty text. Check the PDF URL and OCR API key.")
        return 0

    # ── Step 3: Parse question blocks ────────────────────────────────────────
    print("  [3/4] Parsing question blocks...")
    cleaned_ocr = ocr_service.clean_text(raw_text)

    detected = ocr_service.detect_subject_from_text(cleaned_ocr)
    if detected:
        course_code, subject = detected
        print(f"  [3/4] Detected subject from header: {course_code} {subject}")
    else:
        print(f"  [3/4] No course-code header detected — falling back to default_subject='{subject}'")

    preamble    = ocr_service.clean_preamble(ocr_service.extract_preamble(cleaned_ocr))
    blocks      = ocr_service.deduplicate_blocks(ocr_service.split_blocks(cleaned_ocr))
    print(f"  [3/4] ✓ {len(blocks)} unique question block(s) found")
    if preamble:
        print(f"  [3/4] Preamble detected ({len(preamble)} chars) — will prepend to Q1")

    if not blocks:
        print(f"  [WARN] No question blocks detected. The paper may use a format the regex doesn't match.")
        return 0

    # ── Step 4: Store in Supabase ────────────────────────────────────────────
    print("  [4/4] Storing in Supabase...")

    # Only clear the previous run's questions once we know this run actually
    # found something to replace them with — a failed reprocess attempt
    # should never wipe out a previously-successful extraction.
    removed = delete_existing_questions(conn, pyp_id)
    if removed:
        print(f"  [4/4] Removed {removed} question(s) from a previous run before reprocessing")

    subject_id = upsert_subject(conn, subject)

    inserted = 0
    for block_idx, block in enumerate(blocks, 1):
        q_text = ocr_service.clean_question_text(block)
        if not q_text or len(q_text) < 10:
            continue

        # Prepend scenario/preamble to Q1 using a safe marker the Java formatter understands
        if block_idx == 1 and preamble:
            q_text = "[SCENARIO]\n" + preamble + "\n[/SCENARIO]\n" + q_text

        marks      = ocr_service.extract_marks(block)
        difficulty = ocr_service.assign_difficulty(marks)
        all_topics = classification_service.classify_topics_for_block(conn, subject_id, block)

        question_id = insert_question(conn, pyp_id, q_text, marks)

        for topic_name in all_topics:
            topic_id      = upsert_topic(conn, subject_id, topic_name)
            difficulty_id = upsert_difficulty(conn, difficulty)
            link_question_topic(conn, question_id, topic_id, difficulty_id)

        print(f"    → Q{block_idx}: topics={all_topics} | difficulty={difficulty} | marks={marks}")
        inserted += 1

    conn.commit()
    print(f"  [4/4] ✓ Committed — {inserted} questions stored in Supabase")

    if inserted > 0 and config.get('delete_pdf_after_ocr', False):
        ocr_service.delete_pdf_from_storage(storage_url, config, env)

    return inserted
