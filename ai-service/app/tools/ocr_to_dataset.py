"""
ocr_to_dataset.py
-----------------
OCR-assisted dataset preparation tool for IntellBank.

Now reads papers automatically from the past_year_papers table in Supabase.
No need to manually enter PDF_URL, SUBJECT, YEAR, or PYP_ID.

Workflow (runs for every paper where status = status_to_process):
  1. Query Supabase DB -> get papers where status = "Uploaded" (configurable).
  2. For each paper:
     a. Build the public PDF URL from supabase_project_url + storage_url.
     b. Download the PDF temporarily.
     c. Split PDF into 3-page chunks (OCR.space free tier page limit).
     d. Send each chunk to OCR.space -> collect text.
     e. Combine OCR text and save to data/raw/<pyp_id>_ocr.txt.
     f. Delete temporary PDF and chunks.
     g. Clean text -> split into question blocks -> extract marks, topic.
     h. Append generated rows to output_csv.
     i. Optionally update past_year_papers.status to "Processed".

Settings come from:
  - ai-service/.env          (DB credentials, OCR key)
  - app/config/dataset_config.json  (subject, bucket, status filter, etc.)

Usage:
  python app/tools/ocr_to_dataset.py
"""

import os
import re
import csv
import json
import tempfile
import requests
import psycopg2
from datetime import datetime
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

# === ML & PDF Imports =========================================================
try:
    from pypdf import PdfReader, PdfWriter
except ImportError:
    pass

# === Load .env ================================================================
load_dotenv()

# === Path constants ===========================================================
BASE_DIR    = os.path.dirname(__file__)
DATA_DIR    = os.path.join(BASE_DIR, "..", "data")
RAW_DIR     = os.path.join(DATA_DIR, "raw")
CHUNK_DIR   = os.path.join(DATA_DIR, "temp_pdf_chunks")
TOPIC_JSON  = os.path.join(DATA_DIR, "topic_keywords.json")
CONFIG_PATH = os.path.join(BASE_DIR, "..", "config", "dataset_config.json")

CSV_COLUMNS = ["subject", "topic", "difficulty", "marks",
               "year", "input_text", "target_text", "source_file", "pyp_id"]

OCR_SPACE_URL  = "https://api.ocr.space/parse/image"
PAGES_PER_CHUNK = 3   # OCR.space free tier: max 3 pages per request


# =============================================================================
# Config – Load dataset_config.json and .env variables
# =============================================================================

def load_config() -> dict:
    """Load settings from dataset_config.json."""
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_env_vars() -> dict:
    """Read all required environment variables. Raise if any are missing."""
    required = [
        "SUPABASE_DB_HOST", "SUPABASE_DB_PORT",
        "SUPABASE_DB_NAME", "SUPABASE_DB_USER", "SUPABASE_DB_PASSWORD",
    ]
    env = {}
    missing = []
    for key in required:
        val = os.getenv(key)
        if not val:
            missing.append(key)
        env[key] = val

    # OCR key — accept either name for backward compatibility
    env["OCR_SPACE_API_KEY"] = os.getenv("OCR_SPACE_API_KEY") or os.getenv("OCR_API_KEY")
    if not env["OCR_SPACE_API_KEY"]:
        missing.append("OCR_SPACE_API_KEY")

    if missing:
        raise ValueError(
            f"Missing required environment variables in .env:\n  " +
            "\n  ".join(missing)
        )
    return env


# =============================================================================
# Database – Query past_year_papers
# =============================================================================

def get_db_connection(env: dict):
    """Open a psycopg2 connection to the Supabase PostgreSQL database."""
    return psycopg2.connect(
        host=env["SUPABASE_DB_HOST"],
        port=int(env["SUPABASE_DB_PORT"]),
        dbname=env["SUPABASE_DB_NAME"],
        user=env["SUPABASE_DB_USER"],
        password=env["SUPABASE_DB_PASSWORD"],
        sslmode="require",   # Supabase always requires SSL
    )


def fetch_papers_to_process(conn, status_to_process: str) -> list[dict]:
    """
    Query past_year_papers where status = status_to_process.
    Returns a list of paper dicts with keys: pyp_id, title, storage_url, upload_date.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT pyp_id, title, storage_url, upload_date
            FROM past_year_papers
            WHERE status = %s
            ORDER BY upload_date ASC
            """,
            (status_to_process,),
        )
        rows = cur.fetchall()

    papers = []
    for row in rows:
        papers.append({
            "pyp_id":      str(row[0]),
            "title":       row[1],
            "storage_url": row[2],
            "upload_date": row[3],
        })
    return papers


def update_paper_status(conn, pyp_id: str, new_status: str) -> None:
    """Update a paper's status in past_year_papers after processing."""
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE past_year_papers SET status = %s WHERE pyp_id = %s",
            (new_status, pyp_id),
        )
    conn.commit()
    print(f"  Updated status -> '{new_status}' for pyp_id: {pyp_id}")


# =============================================================================
# Helpers – Derive year and build public URL
# =============================================================================

def extract_year_from_title(title: str, upload_date) -> int:
    """
    Try to extract a 4-digit year (e.g. 2024) from the paper title.
    Falls back to the year from upload_date if no year is found in the title.
    """
    match = re.search(r"\b(20\d{2})\b", title)
    if match:
        return int(match.group(1))
    # Fall back to upload_date year
    if upload_date:
        if hasattr(upload_date, "year"):
            return upload_date.year           # datetime object
        try:
            return int(str(upload_date)[:4])  # string like "2025-01-01"
        except (ValueError, TypeError):
            pass
    return datetime.now().year  # Last resort: current year


def build_public_url(supabase_project_url: str, bucket: str, storage_url: str) -> str:
    """
    Build the Supabase public file URL.
    If the storage_url is already a full URL, return it directly.
    Format: {project_url}/storage/v1/object/public/{bucket}/{storage_url}
    """
    if storage_url.startswith("http://") or storage_url.startswith("https://"):
        return storage_url

    base = supabase_project_url.rstrip("/")
    path = storage_url.lstrip("/")
    return f"{base}/storage/v1/object/public/{bucket}/{path}"


# =============================================================================
# PDF – Download and split into chunks
# =============================================================================

def download_pdf(url: str) -> str:
    """Download PDF from URL into a temporary file. Returns the temp file path."""
    print(f"  Downloading: {url}")
    response = requests.get(url, timeout=60)
    response.raise_for_status()

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    tmp.write(response.content)
    tmp.close()
    return tmp.name


def split_pdf_into_chunks(pdf_path: str, chunk_dir: str, pages_per_chunk: int = 3) -> list[str]:
    """
    Split PDF into smaller PDFs of `pages_per_chunk` pages each.
    Saves chunks into chunk_dir. Returns ordered list of chunk file paths.
    """
    # Check if imports succeeded
    try:
        _ = PdfReader
        _ = PdfWriter
    except NameError:
        raise ImportError("pypdf not installed. Run: pip install pypdf")

    os.makedirs(chunk_dir, exist_ok=True)

    reader      = PdfReader(pdf_path)
    total_pages = len(reader.pages)
    chunk_paths = []

    print(f"  PDF has {total_pages} pages -> splitting into {pages_per_chunk}-page chunks")

    for start in range(0, total_pages, pages_per_chunk):
        end       = min(start + pages_per_chunk, total_pages)
        chunk_num = (start // pages_per_chunk) + 1
        out_path  = os.path.join(chunk_dir, f"chunk_{chunk_num:03d}.pdf")

        writer = PdfWriter()
        for page_num in range(start, end):
            writer.add_page(reader.pages[page_num])
        with open(out_path, "wb") as f:
            writer.write(f)

        chunk_paths.append(out_path)
        print(f"    Chunk {chunk_num}: pages {start+1}-{end}")

    return chunk_paths


def delete_temp_files(downloaded_pdf: str, chunk_paths: list[str]) -> None:
    """Delete the downloaded PDF and all chunk files. Always called in a finally block."""
    if os.path.exists(downloaded_pdf):
        try:
            os.remove(downloaded_pdf)
        except Exception as e:
            print(f"  [WARN] Failed to delete temporary PDF {downloaded_pdf}: {e}")

    for path in chunk_paths:
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception as e:
                print(f"  [WARN] Failed to delete chunk {path}: {e}")

    # Remove the chunk directory if it is now empty
    if os.path.exists(CHUNK_DIR):
        try:
            if not os.listdir(CHUNK_DIR):
                os.rmdir(CHUNK_DIR)
        except Exception as e:
            print(f"  [WARN] Failed to delete chunk directory: {e}")

    print("  Temporary files deleted.")


# =============================================================================
# OCR – Send chunks to OCR.space
# =============================================================================

def ocr_chunk(chunk_path: str, api_key: str) -> str:
    """Send one PDF chunk to OCR.space and return extracted text."""
    print(f"  OCR -> {os.path.basename(chunk_path)}")
    with open(chunk_path, "rb") as f:
        file_bytes = f.read()

    response = requests.post(
        OCR_SPACE_URL,
        files={"file": (os.path.basename(chunk_path), file_bytes, "application/pdf")},
        data={
            "apikey": api_key,
            "language": "eng",
            "isOverlayRequired": False,
            "filetype": "PDF",
            "detectOrientation": True,
            "isCreateSearchablePdf": False,
            "isSearchablePdfHideTextLayer": False,
            "scale": True,
            "isTable": False,
            "OCREngine": 2,   # Engine 2 is more accurate for structured text
        },
        timeout=120,
    )
    response.raise_for_status()
    result = response.json()

    if result.get("IsErroredOnProcessing"):
        err = result.get("ErrorMessage", ["Unknown OCR error"])
        print(f"  [ERROR] OCR.space error: {err}")
        return ""

    parsed = result.get("ParsedResults", [])
    return "\n".join(r.get("ParsedText", "") for r in parsed)


def run_ocr_on_all_chunks(chunk_paths: list[str], api_key: str) -> str:
    """Run OCR on every chunk in order. Returns combined text."""
    all_text = []
    for i, path in enumerate(chunk_paths, 1):
        print(f"  OCR chunk {i}/{len(chunk_paths)}")
        all_text.append(ocr_chunk(path, api_key))
    return "\n\n".join(all_text)


def save_raw_ocr(text: str, pyp_id: str) -> str:
    """Save raw OCR output to data/raw/<pyp_id>_ocr.txt. Returns the saved path."""
    os.makedirs(RAW_DIR, exist_ok=True)
    out_path = os.path.join(RAW_DIR, f"{pyp_id}_ocr.txt")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"  Raw OCR saved -> {out_path}")
    return out_path


# =============================================================================
# Text processing – Clean, split, extract
# =============================================================================

def clean_text(raw: str) -> str:
    """Normalize whitespace and line breaks from OCR output."""
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r" {2,}", " ", line).strip() for line in text.split("\n")]

    cleaned = []
    prev_blank = False
    for line in lines:
        if line == "":
            if not prev_blank:
                cleaned.append(line)
            prev_blank = True
        else:
            cleaned.append(line)
            prev_blank = False

    return "\n".join(cleaned).strip()


# Patterns that indicate the start of a new question block
QUESTION_START_PATTERNS = [
    r"^(Question|QUESTION)\s*\d+",   # Question 1, QUESTION 2
    r"^Q\s*\d+[\.\):]",              # Q1. Q1) Q1:
    r"^\d+[\.\)]\s+[A-Z]",           # 1. Text  or  1) Text
    r"^\([a-zA-Z0-9]{1,5}\)\s",      # (a) (ii) (iii) (1)
    r"^[a-zA-Z0-9]{1,5}\)\s",        # a) ii) iii) 1)
]
QUESTION_BREAK_RE = re.compile("|".join(QUESTION_START_PATTERNS), re.MULTILINE)


def split_into_blocks(text: str) -> list[str]:
    """Split cleaned text into question blocks based on question-start patterns."""
    positions = [m.start() for m in QUESTION_BREAK_RE.finditer(text)]

    if not positions:
        return [text.strip()] if text.strip() else []

    blocks = []
    for i, start in enumerate(positions):
        end   = positions[i + 1] if i + 1 < len(positions) else len(text)
        block = text[start:end].strip()
        if len(block) > 20:
            blocks.append(block)
    return blocks


# Marks extraction patterns: [6 marks], (6 marks), marks: 6, 6 marks
MARKS_PATTERNS = [
    r"\[\s*(\d+)\s*marks?\s*\]",
    r"\(\s*(\d+)\s*marks?\s*\)",
    r"marks?\s*:\s*(\d+)",
    r"(\d+)\s*marks?",
]


def extract_marks(block: str) -> int | None:
    """Return integer mark value found in the block, or None if not found."""
    for pattern in MARKS_PATTERNS:
        m = re.search(pattern, block, re.IGNORECASE)
        if m:
            return int(m.group(1))
    return None


def assign_difficulty(marks: int | None) -> str:
    """Map marks to Easy / Medium / Hard."""
    if marks is None:
        return "Medium"
    if marks <= 3:
        return "Easy"
    if marks <= 6:
        return "Medium"
    return "Hard"


def load_topic_keywords(json_path: str) -> dict[str, list[str]]:
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)


def classify_topic(block: str, topic_keywords: dict[str, list[str]]) -> str:
    """Match block text against topic keywords. Returns 'Unknown' if no match."""
    block_lower = block.lower()
    for topic, keywords in topic_keywords.items():
        for kw in keywords:
            if kw.lower() in block_lower:
                return topic
    return "Unknown"


def generate_input_text(difficulty: str, marks: int | None, subject: str, topic: str) -> str:
    """Build the standard input_text prompt format used in training."""
    marks_str = f"{marks}-mark" if marks else ""
    return f"Generate a {difficulty} {marks_str} {subject} question about {topic}.".strip()


def clean_target_text(block: str) -> str:
    """Strip question numbers, marks, and boilerplate from the final question text."""
    cleaned = block
    # Remove question prefix (like "a)", "(i)", "Question 1") at the start
    cleaned = QUESTION_BREAK_RE.sub("", cleaned, count=1)
    
    # Remove all mark notations
    for pattern in MARKS_PATTERNS:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
    
    # Remove common paper footers and boilerplate
    cleaned = re.sub(r"\[Total.*?\]", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"This question paper consists of.*", "", cleaned, flags=re.IGNORECASE)
    
    return cleaned.strip()


def blocks_to_rows(
    blocks: list[str],
    subject: str,
    year: int,
    source_file: str,
    pyp_id: str,
    topic_keywords: dict,
) -> list[dict]:
    """Convert question blocks into CSV row dictionaries."""
    rows = []
    for block in blocks:
        if not block.strip():
            continue
        marks      = extract_marks(block)
        difficulty = assign_difficulty(marks)
        topic      = classify_topic(block, topic_keywords)
        input_text = generate_input_text(difficulty, marks, subject, topic)
        
        target_text = clean_target_text(block)
        if not target_text:
            continue
        
        rows.append({
            "subject":     subject,
            "topic":       topic,
            "difficulty":  difficulty,
            "marks":       marks if marks is not None else "",
            "year":        year,
            "input_text":  input_text,
            "target_text": target_text,
            "source_file": source_file,
            "pyp_id":      pyp_id,
        })
    return rows


def append_to_csv(rows: list[dict], csv_path: str) -> None:
    """Append rows to the output CSV. Creates it with headers if it does not exist."""
    os.makedirs(os.path.dirname(csv_path), exist_ok=True)
    file_exists = os.path.isfile(csv_path) and os.path.getsize(csv_path) > 0

    with open(csv_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        if not file_exists:
            writer.writeheader()
        writer.writerows(rows)

    print(f"  [OK] {len(rows)} rows saved -> {csv_path}")


# =============================================================================
# Per-paper processing
# =============================================================================

def process_paper(paper: dict, config: dict, env: dict, topic_keywords: dict) -> bool:
    """
    Full pipeline for a single past_year_papers record.
    Returns True if successful, False if it failed.
    """
    pyp_id      = paper["pyp_id"]
    title       = paper["title"]
    storage_url = paper["storage_url"]
    upload_date = paper["upload_date"]

    subject     = config["default_subject"]
    year        = extract_year_from_title(title, upload_date)
    pdf_url     = build_public_url(
        config["supabase_project_url"],
        config["supabase_bucket"],
        storage_url,
    )
    output_csv  = os.path.join(DATA_DIR, config["output_csv"])

    print(f"\n{'='*60}")
    print(f"  Processing: {title}")
    print(f"  pyp_id    : {pyp_id}")
    print(f"  year      : {year}")
    print(f"  PDF URL   : {pdf_url}")
    print(f"{'='*60}")

    downloaded_pdf = None
    chunk_paths    = []

    try:
        # Download
        print("\n-- Download PDF ------------------------------------------")
        downloaded_pdf = download_pdf(pdf_url)

        # Split
        print("\n-- Split into chunks -------------------------------------")
        chunk_paths = split_pdf_into_chunks(downloaded_pdf, CHUNK_DIR, PAGES_PER_CHUNK)

        # OCR
        print("\n-- Run OCR -----------------------------------------------")
        combined_text = run_ocr_on_all_chunks(chunk_paths, env["OCR_SPACE_API_KEY"])

        # Save raw
        # print("\n-- Save raw OCR output -----------------------------------")
        # save_raw_ocr(combined_text, pyp_id)

    finally:
        # Always clean up temp files
        print("\n-- Clean up temp files -----------------------------------")
        if downloaded_pdf:
            delete_temp_files(downloaded_pdf, chunk_paths)

    # Text processing
    print("\n-- Process OCR text --------------------------------------")
    cleaned = clean_text(combined_text)
    print(f"  Cleaned text: {len(cleaned)} characters")

    blocks = split_into_blocks(cleaned)
    print(f"  Question blocks found: {len(blocks)}")

    if not blocks:
        print(f"  [WARN] No blocks found. Check data/raw/{pyp_id}_ocr.txt manually.")
        return False

    # Generate rows
    rows = blocks_to_rows(blocks, subject, year, title, pyp_id, topic_keywords)
    print(f"  Rows generated: {len(rows)}")

    # Preview first 2 rows
    for i, row in enumerate(rows[:2], 1):
        print(f"\n  Preview row {i}:")
        print(f"    topic      : {row['topic']}")
        print(f"    difficulty : {row['difficulty']}  marks: {row['marks']}")
        print(f"    input_text : {row['input_text']}")
        print(f"    target_text: {row['target_text'][:80]}...")

    # Save
    print("\n-- Append to CSV -----------------------------------------")
    append_to_csv(rows, output_csv)

    return True


# =============================================================================
# MAIN
# =============================================================================

def main():
    print("=" * 60)
    print("  IntellBank - OCR to Dataset (Auto Mode)")
    print("=" * 60)

    # Load config and env
    print(f"\nLoading config: {CONFIG_PATH}")
    config = load_config()

    print("Loading environment variables...")
    env = load_env_vars()

    print(f"Loading topic keywords: {TOPIC_JSON}")
    topic_keywords = load_topic_keywords(TOPIC_JSON)
    print(f"  {len(topic_keywords)} topics loaded.")

    # Connect to Supabase DB
    print("\nConnecting to Supabase PostgreSQL...")
    conn = get_db_connection(env)
    print("  Connected.")

    # Query papers to process
    status_filter = config["status_to_process"]
    print(f"\nQuerying papers with status = '{status_filter}'...")
    papers = fetch_papers_to_process(conn, status_filter)
    print(f"  {len(papers)} paper(s) found.")

    if not papers:
        print("\n[WARN] No papers to process. Upload PDFs and set their status to "
              f"'{status_filter}' in Supabase.")
        conn.close()
        return

    # Process each paper
    succeeded = 0
    failed    = []

    for paper in papers:
        ok = process_paper(paper, config, env, topic_keywords)
        if ok:
            succeeded += 1
            # Optionally update status to "Processed" after success
            if config.get("update_status_after_processing", False):
                update_paper_status(conn, paper["pyp_id"], "Processed")
        else:
            failed.append(paper["title"])

    conn.close()

    # Summary
    print("\n" + "=" * 60)
    print(f"  Done. {succeeded}/{len(papers)} papers processed successfully.")
    if failed:
        print(f"\n  [WARN] Failed papers ({len(failed)}):")
        for title in failed:
            print(f"    - {title}")
    print("\n  TIP: Review generated_training_dataset.csv manually before")
    print("  merging rows into training_dataset.csv and retraining.")
    print("=" * 60)


if __name__ == "__main__":
    main()
