import os
import re
import sys
import uuid
import json
import tempfile
import requests
import psycopg2
from datetime import datetime
from dotenv import load_dotenv

# ── Add project root to path so app.* imports work ────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

try:
    from pypdf import PdfReader, PdfWriter
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False
    print("[WARN] pypdf not installed. Run: pip install pypdf")

load_dotenv()

# ── Path constants ─────────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(__file__)
DATA_DIR    = os.path.join(BASE_DIR, '..', 'data')
CHUNK_DIR   = os.path.join(DATA_DIR, 'temp_pdf_chunks')
TOPIC_JSON  = os.path.join(DATA_DIR, 'topic_keywords.json')
CONFIG_PATH = os.path.join(BASE_DIR, '..', 'config', 'dataset_config.json')

OCR_SPACE_URL   = 'https://api.ocr.space/parse/image'
PAGES_PER_CHUNK = 3


# =============================================================================
# Config & Env
# =============================================================================

def load_config() -> dict:
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_env() -> dict:
    required = [
        'SUPABASE_DB_HOST', 'SUPABASE_DB_PORT',
        'SUPABASE_DB_NAME', 'SUPABASE_DB_USER', 'SUPABASE_DB_PASSWORD',
    ]
    env = {k: os.getenv(k) for k in required}
    missing = [k for k, v in env.items() if not v]

    env['OCR_SPACE_API_KEY'] = os.getenv('OCR_SPACE_API_KEY') or os.getenv('OCR_API_KEY')
    if not env['OCR_SPACE_API_KEY']:
        missing.append('OCR_SPACE_API_KEY')

    if missing:
        raise ValueError(f"Missing .env variables:\n  " + "\n  ".join(missing))
    return env


# =============================================================================
# Database
# =============================================================================

def get_conn(env: dict):
    return psycopg2.connect(
        host=env['SUPABASE_DB_HOST'],
        port=int(env['SUPABASE_DB_PORT']),
        dbname=env['SUPABASE_DB_NAME'],
        user=env['SUPABASE_DB_USER'],
        password=env['SUPABASE_DB_PASSWORD'],
        sslmode='require',
    )


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


def upsert_subject(conn, name: str) -> str:
    """Get or create subject row, return subject_id."""
    with conn.cursor() as cur:
        cur.execute('SELECT subject_id FROM subjects WHERE name = %s', (name,))
        row = cur.fetchone()
        if row:
            return str(row[0])
        new_id = str(uuid.uuid4())
        cur.execute(
            'INSERT INTO subjects (subject_id, name) VALUES (%s, %s)',
            (new_id, name)
        )
        return new_id


def upsert_topic(conn, subject_id: str, name: str) -> str:
    """Get or create topic row under a subject, return topic_id."""
    with conn.cursor() as cur:
        cur.execute(
            'SELECT topic_id FROM topics WHERE subject_id = %s AND name = %s',
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
    """Get or create difficulty row, return difficulty_id."""
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


def insert_question(conn, pyp_id: str, content: str, marks) -> str:
    """Insert a question row, return question_id."""
    new_id = str(uuid.uuid4())
    safe_marks = marks if isinstance(marks, int) else 1
    with conn.cursor() as cur:
        cur.execute(
            'INSERT INTO questions (question_id, pyp_id, content, marks) VALUES (%s, %s, %s, %s)',
            (new_id, pyp_id, content, safe_marks)
        )
    return new_id


def link_question_topic(conn, question_id: str, topic_id: str, difficulty_id: str):
    """Insert into question_topics, ignore duplicates."""
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
# PDF helpers
# =============================================================================

def build_url(project_url: str, bucket: str, storage_url: str) -> str:
    if storage_url.startswith('http'):
        return storage_url
    base = project_url.rstrip('/')
    path = storage_url.lstrip('/')
    return f"{base}/storage/v1/object/public/{bucket}/{path}"


def download_pdf(url: str) -> str:
    print(f"  Downloading: {url}")
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
    tmp.write(r.content)
    tmp.close()
    return tmp.name


def split_pdf(pdf_path: str, pages_per_chunk: int = 3) -> list[str]:
    if not HAS_PYPDF:
        raise ImportError('pypdf not installed')
    os.makedirs(CHUNK_DIR, exist_ok=True)
    reader = PdfReader(pdf_path)
    total  = len(reader.pages)
    paths  = []
    print(f"  PDF pages: {total} → splitting into {pages_per_chunk}-page chunks")
    for start in range(0, total, pages_per_chunk):
        end    = min(start + pages_per_chunk, total)
        n      = (start // pages_per_chunk) + 1
        out    = os.path.join(CHUNK_DIR, f'chunk_{n:03d}.pdf')
        writer = PdfWriter()
        for p in range(start, end):
            writer.add_page(reader.pages[p])
        with open(out, 'wb') as f:
            writer.write(f)
        paths.append(out)
        print(f"    Chunk {n}: pages {start+1}–{end}")
    return paths


def cleanup(pdf_path: str, chunks: list[str]):
    for p in [pdf_path] + chunks:
        try:
            if p and os.path.exists(p):
                os.remove(p)
        except Exception as e:
            print(f"  [WARN] cleanup: {e}")
    try:
        if os.path.exists(CHUNK_DIR) and not os.listdir(CHUNK_DIR):
            os.rmdir(CHUNK_DIR)
    except Exception:
        pass


# =============================================================================
# OCR
# =============================================================================

def ocr_chunk(chunk_path: str, api_key: str) -> str:
    print(f"  OCR → {os.path.basename(chunk_path)}")
    with open(chunk_path, 'rb') as f:
        content = f.read()
    r = requests.post(
        OCR_SPACE_URL,
        files={'file': (os.path.basename(chunk_path), content, 'application/pdf')},
        data={
            'apikey': api_key, 'language': 'eng',
            'isOverlayRequired': False, 'filetype': 'PDF',
            'detectOrientation': True, 'OCREngine': 2,
        },
        timeout=120,
    )
    r.raise_for_status()
    result = r.json()
    if result.get('IsErroredOnProcessing'):
        print(f"  [ERROR] OCR error: {result.get('ErrorMessage')}")
        return ''
    return '\n'.join(p.get('ParsedText', '') for p in result.get('ParsedResults', []))


def run_ocr(chunks: list[str], api_key: str) -> str:
    texts = []
    for i, c in enumerate(chunks, 1):
        print(f"  OCR chunk {i}/{len(chunks)}")
        texts.append(ocr_chunk(c, api_key))
    return '\n\n'.join(texts)


# =============================================================================
# Text processing
# =============================================================================

QUESTION_RE = re.compile(
    r'(?:^|\n)Question\s+\d+',
    re.MULTILINE | re.IGNORECASE
)

MARKS_RE = [
    r'\[\s*(\d+)\s*marks?\s*\]',
    r'\(\s*(\d+)\s*marks?\s*\)',
    r'marks?\s*:\s*(\d+)',
    r'(\d+)\s*marks?',
]


def split_blocks(text: str) -> list[str]:
    positions = [m.start() for m in QUESTION_RE.finditer(text)]
    if not positions:
        print("  [WARN] No 'Question N' markers found in OCR text.")
        return []

    blocks = []
    for i, start in enumerate(positions):
        end   = positions[i + 1] if i + 1 < len(positions) else len(text)
        block = text[start:end].strip()
        if len(block) > 50:
            blocks.append(block)
    return blocks

def deduplicate_blocks(blocks: list[str]) -> list[str]:
    """Remove blocks that are too similar to already-seen ones."""
    seen = []
    unique = []
    for block in blocks:
        # Normalize for comparison
        normalized = re.sub(r'\s+', ' ', block.lower().strip())[:100]
        # Check if this block is too similar to any seen block
        is_dup = any(
            normalized[:60] == seen_block[:60]  # same opening = duplicate
            for seen_block in seen
        )
        if not is_dup:
            seen.append(normalized)
            unique.append(block)
    return unique

def clean_text(raw: str) -> str:
    text  = raw.replace('\r\n', '\n').replace('\r', '\n')
    lines = [re.sub(r' {2,}', ' ', l).strip() for l in text.split('\n')]
    out, prev_blank = [], False
    for l in lines:
        if l == '':
            if not prev_blank:
                out.append(l)
            prev_blank = True
        else:
            out.append(l)
            prev_blank = False
    return '\n'.join(out).strip()

def extract_marks(block: str):
    m = re.search(r'\[Total[:\s]+(\d+)\s*marks?\]', block, re.IGNORECASE)
    if m:
        return int(m.group(1))
    m = re.search(r'\((\d+(?:\s*\+\s*\d+)+)\s*marks?\)', block, re.IGNORECASE)
    if m:
        return sum(int(x) for x in re.findall(r'\d+', m.group(1)))
    m = re.search(r'\((\d+)\s*marks?\)', block, re.IGNORECASE)
    if m:
        return int(m.group(1))
    return None


def assign_difficulty(marks) -> str:
    if marks is None: return 'Medium'
    if marks <= 3:    return 'Easy'
    if marks <= 6:    return 'Medium'
    return 'Hard'


def load_topic_keywords() -> dict:
    if not os.path.exists(TOPIC_JSON):
        print(f"[WARN] topic_keywords.json not found at {TOPIC_JSON}. Using empty map.")
        return {}
    with open(TOPIC_JSON, 'r', encoding='utf-8') as f:
        return json.load(f)


def classify_topic(block: str, keywords: dict) -> str:
    lower = block.lower()
    for topic, kws in keywords.items():
        for kw in kws:
            if kw.lower() in lower:
                return topic
    if 'risk' in lower:             return 'Risk Management'
    if 'resource' in lower:         return 'Resource Management'
    if 'quality' in lower:          return 'Software Quality'
    if 'process model' in lower:    return 'Software Process Model'
    if 'stakeholder' in lower:      return 'Stakeholders'
    if 'cost' in lower:             return 'Cost Estimation'
    if 'schedule' in lower:         return 'Project Scheduling'
    return 'General'


def clean_question_text(block: str) -> str:
    cleaned = re.sub(r'^Question\s+\d+\s*\n?', '', block, count=1, flags=re.IGNORECASE)
    cleaned = re.sub(r'\[Total[:\s]+\d+\s*marks?\]', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'^BAIT\d+.*?\n', '', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'This question paper consists of.*?\n', '', cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def extract_year(title: str, upload_date) -> int:
    m = re.search(r'\b(20\d{2})\b', title)
    if m:
        return int(m.group(1))
    if upload_date:
        if hasattr(upload_date, 'year'):
            return upload_date.year
        try:
            return int(str(upload_date)[:4])
        except (ValueError, TypeError):
            pass
    return datetime.now().year


# =============================================================================
# Per-paper pipeline
# =============================================================================

def save_raw_ocr(text: str, pyp_id: str) -> str:
    raw_dir = os.path.join(DATA_DIR, 'raw')
    os.makedirs(raw_dir, exist_ok=True)
    out_path = os.path.join(raw_dir, f'{pyp_id}_ocr.txt')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(text)
    print(f"  Raw OCR saved → {out_path}")
    return out_path

def process_paper(conn, paper: dict, config: dict, env: dict, keywords: dict) -> bool:
    pyp_id      = paper['pyp_id']
    title       = paper['title']
    storage_url = paper['storage_url']
    upload_date = paper['upload_date']
    subject     = config['default_subject']

    pdf_url = build_url(
        config['supabase_project_url'],
        config['supabase_bucket'],
        storage_url,
    )

    print(f"\n{'='*60}")
    print(f"  Paper : {title}")
    print(f"  pyp_id: {pyp_id}")
    print(f"  URL   : {pdf_url}")
    print(f"{'='*60}")

    pdf_path = None
    chunks   = []
    try:
        pdf_path = download_pdf(pdf_url)
        chunks   = split_pdf(pdf_path, PAGES_PER_CHUNK)
        raw_text = run_ocr(chunks, env['OCR_SPACE_API_KEY'])
        save_raw_ocr(raw_text, pyp_id)
    finally:
        cleanup(pdf_path, chunks)

    cleaned = clean_text(raw_text)
    blocks  = split_blocks(cleaned)
    blocks  = deduplicate_blocks(blocks)
    print(f"\n  Blocks found: {len(blocks)}")

    if not blocks:
        print(f"  [WARN] No question blocks detected for {title}")
        return False

    # Ensure subject exists
    subject_id = upsert_subject(conn, subject)

    inserted = 0
    for block in blocks:
        q_text = clean_question_text(block)
        if not q_text or len(q_text) < 10:
            continue

        marks        = extract_marks(block)
        difficulty   = assign_difficulty(marks)
        topic_name   = classify_topic(block, keywords)

        topic_id      = upsert_topic(conn, subject_id, topic_name)
        difficulty_id = upsert_difficulty(conn, difficulty)
        question_id   = insert_question(conn, pyp_id, q_text, marks)
        link_question_topic(conn, question_id, topic_id, difficulty_id)
        inserted += 1

    conn.commit()
    print(f"  ✅ Inserted {inserted} questions for '{title}'")
    return inserted > 0


# =============================================================================
# Main
# =============================================================================

def main():
    print('=' * 60)
    print('  IntellBank — Seed DB from OCR Pipeline')
    print('=' * 60)

    config   = load_config()
    env      = load_env()
    keywords = load_topic_keywords()

    print(f"\n  Subject  : {config['default_subject']}")
    print(f"  Status filter: {config['status_to_process']}")

    conn = get_conn(env)
    print('\n  Connected to Supabase PostgreSQL.')

    papers = fetch_papers(conn, config['status_to_process'])
    print(f"  Papers to process: {len(papers)}")

    if not papers:
        print(f"\n  [INFO] No papers with status='{config['status_to_process']}' found.")
        print("  Upload PDFs via the app and set their status to process them.")
        conn.close()
        return

    ok_count = 0
    failed   = []

    for paper in papers:
        try:
            success = process_paper(conn, paper, config, env, keywords)
            if success:
                ok_count += 1
                if config.get('update_status_after_processing', True):
                    update_status(conn, paper['pyp_id'], 'Processed')
            else:
                failed.append(paper['title'])
        except Exception as e:
            print(f"\n  [ERROR] Failed: {paper['title']}\n  {e}")
            failed.append(paper['title'])

    conn.close()

    print('\n' + '=' * 60)
    print(f"  Done: {ok_count}/{len(papers)} papers processed.")
    if failed:
        print(f"\n  Failed ({len(failed)}):")
        for t in failed:
            print(f"    - {t}")
    print('\n  Next: hit GET /api/metadata/subject-topics to verify.')
    print('=' * 60)


if __name__ == '__main__':
    main()