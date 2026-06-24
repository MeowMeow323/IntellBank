import os
import psycopg2
from psycopg2.extras import DictCursor
from dotenv import load_dotenv

# Try to load from root directory if running from ai-service
dotenv_path = os.path.join(os.path.dirname(__file__), "../../../.env")
load_dotenv(dotenv_path)

def get_db_connection():
    host = os.getenv("SUPABASE_DB_HOST")
    port = os.getenv("SUPABASE_DB_PORT", "5432")
    dbname = os.getenv("SUPABASE_DB_NAME", "postgres")
    user = os.getenv("SUPABASE_DB_USER")
    password = os.getenv("SUPABASE_DB_PASSWORD")
    
    if not host or not user or not password:
        raise ValueError("Database credentials missing. Check .env file.")
        
    return psycopg2.connect(
        host=host,
        port=port,
        dbname=dbname,
        user=user,
        password=password
    )

def fetch_subject_id_by_name(conn, subject: str) -> str | None:
    """Looks up a subject_id by name (exact match, case-insensitive)."""
    with conn.cursor() as cur:
        cur.execute("SELECT subject_id FROM subjects WHERE LOWER(name) = LOWER(%s)", (subject,))
        row = cur.fetchone()
        return str(row[0]) if row else None


def fetch_topic_names_for_subject(conn, subject_id: str) -> list[str]:
    """Returns all topic names already defined for a subject — these are the
    candidate labels handed to the zero-shot classifier (see classification_service)."""
    with conn.cursor() as cur:
        cur.execute("SELECT name FROM topics WHERE subject_id = %s ORDER BY name", (subject_id,))
        return [row[0] for row in cur.fetchall()]


def fetch_questions_for_topics(subject: str, topics: list, limit: int = 10, conn=None) -> list:
    """
    Fetch up to `limit` random questions matching the subject and ANY of the given topics.
    Falls back to any question for that subject when no topic matches are found.
    Returns: [{'text': str, 'topics': [str]}]

    Pass an existing `conn` to reuse one connection across several calls — Supabase's
    session-mode pooler caps total clients (15), so opening a fresh connection per call
    can trip "max clients reached in session mode".
    """
    own_conn = conn is None
    try:
        if own_conn:
            conn = get_db_connection()
        with conn.cursor(cursor_factory=DictCursor) as cur:
            # 1. Find subject — try exact match first, then partial (ILIKE) for cross-subject use
            cur.execute("SELECT subject_id FROM subjects WHERE LOWER(name) = LOWER(%s)", (subject,))
            subject_row = cur.fetchone()
            if not subject_row:
                cur.execute("SELECT subject_id FROM subjects WHERE name ILIKE %s", (f'%{subject}%',))
                subject_row = cur.fetchone()
            if not subject_row:
                return []

            subject_id = subject_row['subject_id']

            # 2. Find topic IDs — exact match, then partial fallback
            topic_ids = []
            if topics:
                topic_placeholders = ','.join(['%s'] * len(topics))
                cur.execute(
                    f"SELECT topic_id FROM topics WHERE subject_id = %s AND LOWER(name) IN ({topic_placeholders})",
                    [subject_id] + [t.lower() for t in topics]
                )
                topic_ids = [row['topic_id'] for row in cur.fetchall()]

                # Partial match fallback — "Risk" matches "Risk Management"
                if not topic_ids:
                    like_clauses = ' OR '.join(['name ILIKE %s'] * len(topics))
                    cur.execute(
                        f"SELECT topic_id FROM topics WHERE subject_id = %s AND ({like_clauses})",
                        [subject_id] + [f'%{t}%' for t in topics]
                    )
                    topic_ids = [row['topic_id'] for row in cur.fetchall()]

            # 3. Fetch questions — by topic if found, otherwise any for this subject
            if topic_ids:
                t_ids_placeholders = ','.join(['%s'] * len(topic_ids))
                q_query = f"""
                    SELECT q.question_id, q.content,
                           array_agg(DISTINCT t.name) AS topic_names
                    FROM questions q
                    JOIN question_topics qt ON q.question_id = qt.question_id
                    JOIN topics t ON qt.topic_id = t.topic_id
                    WHERE qt.topic_id IN ({t_ids_placeholders})
                    GROUP BY q.question_id, q.content
                    ORDER BY RANDOM()
                    LIMIT %s
                """
                cur.execute(q_query, topic_ids + [limit])
            else:
                # No topic match at all — return any questions for this subject
                q_query = """
                    SELECT q.question_id, q.content,
                           array_agg(DISTINCT t.name) AS topic_names
                    FROM questions q
                    JOIN question_topics qt ON q.question_id = qt.question_id
                    JOIN topics t ON qt.topic_id = t.topic_id
                    WHERE t.subject_id = %s
                    GROUP BY q.question_id, q.content
                    ORDER BY RANDOM()
                    LIMIT %s
                """
                cur.execute(q_query, [subject_id, limit])

            results = []
            for row in cur.fetchall():
                results.append({
                    "text":   row['content'],
                    "topics": list(row['topic_names']),
                })
            print(f"[db] fetch_questions_for_topics(subject={subject!r}, topics={topics}) -> {len(results)} rows")
            return results
    except Exception as e:
        # Do NOT swallow DB errors as an empty result — that masks connection/auth
        # failures as a misleading "no questions found". Surface the real cause.
        import traceback
        print(f"[db] Database error in fetch_questions_for_topics: {e}")
        traceback.print_exc()
        raise RuntimeError(f"Database error: {e}") from e
    finally:
        # Only close connections we opened — a caller-supplied conn is theirs to close.
        if own_conn and conn:
            conn.close()


def fetch_subject_questions(subject: str, conn=None) -> list:
    """
    Return EVERY question row for a subject with its pyp_id, marks, content and topics.

    Questions are stored as individual sub-part fragments (content prefixed with a
    "[QPART:<question-no>:<part>]" marker), so the generator needs the pyp_id and the
    marker to regroup fragments back into full multi-part exam questions.
    Returns: [{'question_id', 'pyp_id', 'marks', 'content', 'topics': [str]}]
    """
    own_conn = conn is None
    try:
        if own_conn:
            conn = get_db_connection()
        with conn.cursor(cursor_factory=DictCursor) as cur:
            cur.execute("SELECT subject_id FROM subjects WHERE LOWER(name) = LOWER(%s)", (subject,))
            row = cur.fetchone()
            if not row:
                cur.execute("SELECT subject_id FROM subjects WHERE name ILIKE %s", (f'%{subject}%',))
                row = cur.fetchone()
            if not row:
                return []
            subject_id = row['subject_id']

            cur.execute(
                """
                SELECT q.question_id, q.pyp_id, q.marks, q.content,
                       array_agg(DISTINCT t.name) AS topic_names
                FROM questions q
                JOIN question_topics qt ON q.question_id = qt.question_id
                JOIN topics t ON qt.topic_id = t.topic_id
                WHERE t.subject_id = %s
                GROUP BY q.question_id, q.pyp_id, q.marks, q.content
                """,
                (subject_id,),
            )
            results = [{
                "question_id": str(r['question_id']),
                "pyp_id":      str(r['pyp_id']) if r['pyp_id'] else None,
                "marks":       r['marks'] or 0,
                "content":     r['content'] or "",
                "topics":      list(r['topic_names']),
            } for r in cur.fetchall()]
            print(f"[db] fetch_subject_questions(subject={subject!r}) -> {len(results)} rows")
            return results
    except Exception as e:
        import traceback
        print(f"[db] Database error in fetch_subject_questions: {e}")
        traceback.print_exc()
        raise RuntimeError(f"Database error: {e}") from e
    finally:
        if own_conn and conn:
            conn.close()
