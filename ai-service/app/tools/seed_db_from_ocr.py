import os
import re
import sys
import uuid
import json
import tempfile
import requests
import psycopg2
import numpy as np
import cv2
from PIL import Image
from pdf2image import convert_from_path
import pytesseract
from dotenv import load_dotenv

# Windows' default cp1252 console crashes when printing → ✓ ✗ — force UTF-8 output.
try:
    sys.stdout.reconfigure(encoding='utf-8')   # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding='utf-8')   # type: ignore[union-attr]
except Exception:
    pass

# Explicit paths — work even if binaries are not on PATH in the current terminal
_tess = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
if os.path.exists(_tess):
    pytesseract.pytesseract.tesseract_cmd = _tess

_poppler_candidates = [
    r'C:\poppler\poppler-26.02.0\Library\bin',
    r'C:\poppler\Library\bin',
    r'C:\Program Files\poppler\Library\bin',
]
POPPLER_PATH: str | None = next((p for p in _poppler_candidates if os.path.exists(p)), None)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

try:
    from pypdf import PdfReader, PdfWriter
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False
    print("[WARN] pypdf not installed. Run: pip install pypdf")

load_dotenv()

BASE_DIR    = os.path.dirname(__file__)
DATA_DIR    = os.path.join(BASE_DIR, '..', 'data')
CHUNK_DIR   = os.path.join(DATA_DIR, 'temp_pdf_chunks')
TOPIC_JSON  = os.path.join(DATA_DIR, 'topic_keywords.json')
CONFIG_PATH = os.path.join(BASE_DIR, '..', 'config', 'dataset_config.json')

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

    # Optional — only needed for delete_pdf_after_ocr
    env['SUPABASE_SERVICE_KEY'] = os.getenv('SUPABASE_SERVICE_KEY', '')

    if missing:
        raise ValueError("Missing .env variables:\n  " + "\n  ".join(missing))
    return env


# =============================================================================
# Database helpers
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
    with conn.cursor() as cur:
        cur.execute('SELECT subject_id FROM subjects WHERE name = %s', (name,))
        row = cur.fetchone()
        if row:
            return str(row[0])
        new_id = str(uuid.uuid4())
        cur.execute('INSERT INTO subjects (subject_id, name) VALUES (%s, %s)', (new_id, name))
        return new_id


def upsert_topic(conn, subject_id: str, name: str) -> str:
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
# PDF helpers
# =============================================================================

def build_url(project_url: str, bucket: str, storage_url: str) -> str:
    if storage_url.startswith('http'):
        return storage_url
    return f"{project_url.rstrip('/')}/storage/v1/object/public/{bucket}/{storage_url.lstrip('/')}"


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


def delete_pdf_from_storage(storage_url: str, config: dict, env: dict):
    """
    Delete the original PDF from Supabase Storage after successful OCR.
    The PDF is no longer needed — the workspace serves formatted HTML, not the raw file.
    Requires SUPABASE_SERVICE_KEY in .env. Skips silently if key is missing or URL is external.
    """
    service_key = env.get('SUPABASE_SERVICE_KEY', '')
    if not service_key:
        print("  [SKIP] delete_pdf_after_ocr: SUPABASE_SERVICE_KEY not set in .env")
        return
    if storage_url.startswith('http'):
        print("  [SKIP] delete_pdf_after_ocr: external URL, cannot delete")
        return

    project_url = config['supabase_project_url'].rstrip('/')
    bucket      = config['supabase_bucket']
    path        = storage_url.lstrip('/')
    url         = f"{project_url}/storage/v1/object/{bucket}/{path}"
    headers     = {'Authorization': f'Bearer {service_key}', 'apikey': service_key}
    try:
        r = requests.delete(url, headers=headers, timeout=30)
        if r.status_code in (200, 204):
            print(f"  ✓ PDF deleted from Storage ({path})")
        else:
            print(f"  [WARN] Storage delete {r.status_code}: {r.text[:120]}")
    except Exception as e:
        print(f"  [WARN] Storage delete failed: {e}")


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
# OCR — Tesseract + OpenCV
# =============================================================================

def preprocess_image(pil_img: Image.Image) -> Image.Image:
    """Grayscale → denoise → Otsu threshold. Improves Tesseract accuracy on academic PDFs."""
    img      = np.array(pil_img.convert('RGB'))
    gray     = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    _, binary = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return Image.fromarray(binary)


def detect_table_bbox(img_array: np.ndarray):
    """
    Detects the bounding box of a table on the page using horizontal/vertical
    line morphology. Returns (x, y, w, h) of the largest detected table, or None.
    """
    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))
    h_lines  = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel, iterations=2)
    v_lines  = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel, iterations=2)
    grid     = cv2.add(h_lines, v_lines)

    contours, _ = cv2.findContours(grid, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    largest   = max(contours, key=cv2.contourArea)
    page_area = img_array.shape[0] * img_array.shape[1]
    if cv2.contourArea(largest) < page_area * 0.03:   # < 3% of page → noise, not a real table
        return None

    return cv2.boundingRect(largest)


def _line_positions(projection: np.ndarray, min_run: float) -> list[int]:
    """
    Given a 1-D projection of a line mask, return the centre position of each
    contiguous run that stays above `min_run`. Used to locate grid lines.
    Nearby positions (< 12 px apart) are merged so double-borders count once.
    """
    positions, in_run, start = [], False, 0
    for i, v in enumerate(projection):
        if v >= min_run and not in_run:
            in_run, start = True, i
        elif v < min_run and in_run:
            in_run = False
            positions.append((start + i) // 2)
    if in_run:
        positions.append((start + len(projection)) // 2)

    merged = []
    for p in positions:
        if merged and p - merged[-1] < 12:
            merged[-1] = (merged[-1] + p) // 2
        else:
            merged.append(p)
    return merged


def detect_grid_lines(table_img: np.ndarray):
    """
    Detects the row (y) and column (x) grid-line positions of a bordered table.
    Returns (row_ys, col_xs) — sorted boundary coordinates. Either may be short
    if the table lacks full borders in that direction.
    """
    gray = cv2.cvtColor(table_img, cv2.COLOR_RGB2GRAY)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    H, W = binary.shape

    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(15, W // 8), 1))
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(12, H // 8)))
    h_lines  = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel, iterations=1)
    v_lines  = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel, iterations=1)

    row_ys = _line_positions(h_lines.sum(axis=1), min_run=0.5 * W * 255)
    col_xs = _line_positions(v_lines.sum(axis=0), min_run=0.5 * H * 255)
    return row_ys, col_xs


# Glyphs Tesseract commonly mistakes a small "1" (or other digit) for.
_AMBIGUOUS_DIGIT_MISREADS = {'l', 'I', '|', '!', ']', '[', 'i', '/', '\\', 'j', 'L', ')'}


def _ocr_binary(binary: np.ndarray, psm: int, whitelist: str = "") -> str:
    cfg = f'--psm {psm} --oem 3'
    if whitelist:
        cfg += f' -c tessedit_char_whitelist={whitelist}'
    return str(pytesseract.image_to_string(
        Image.fromarray(binary), config=cfg, output_type=pytesseract.Output.STRING,
    )).strip()


def _rescue_digit(cell_img: np.ndarray) -> str:
    """
    Last-resort OCR for a cell that should hold a small number but read blank or
    as a digit-look-alike glyph. Upscales 8×, thickens thin strokes, and tries
    several page-segmentation modes constrained to digits. Returns '' on failure.
    """
    if cell_img is None or cell_img.size == 0 or cell_img.shape[0] < 6 or cell_img.shape[1] < 6:
        return ""
    scaled    = cv2.resize(cell_img, None, fx=8, fy=8, interpolation=cv2.INTER_CUBIC)
    gray      = cv2.cvtColor(scaled, cv2.COLOR_RGB2GRAY) if scaled.ndim == 3 else scaled
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    binary    = cv2.dilate(binary, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1)
    binary    = cv2.bitwise_not(binary)   # back to black-on-white
    binary    = cv2.copyMakeBorder(binary, 24, 24, 24, 24, cv2.BORDER_CONSTANT, value=255)

    for psm in (10, 8, 13, 7):
        out = _ocr_binary(binary, psm, whitelist='0123456789')
        digits = ''.join(ch for ch in out if ch.isdigit())
        if digits:
            return digits[:2]   # durations are 1-2 digits
    return ""


def ocr_cell(cell_img: np.ndarray) -> str:
    """
    OCRs a single table cell. Upscales 4× and pads so small glyphs (single
    letters / digits) become large enough for Tesseract to recognise.
    Falls back to single-character mode, then a digit-only rescue pass for the
    1-2 digit cells Tesseract otherwise reads as 'l', '!', ']' or blank.
    """
    if cell_img is None or cell_img.size == 0 or cell_img.shape[0] < 6 or cell_img.shape[1] < 6:
        return ""
    scaled    = cv2.resize(cell_img, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
    gray      = cv2.cvtColor(scaled, cv2.COLOR_RGB2GRAY) if scaled.ndim == 3 else scaled
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    binary    = cv2.copyMakeBorder(binary, 16, 16, 16, 16, cv2.BORDER_CONSTANT, value=255)

    text = _ocr_binary(binary, 7)
    if not text:
        text = _ocr_binary(binary, 10)
    text = ' '.join(text.replace('|', ' ').split())   # strip border artefacts

    # Rescue single-digit cells: blank, or a single glyph that's a classic digit misread
    if text == "" or (len(text) == 1 and text in _AMBIGUOUS_DIGIT_MISREADS):
        digit = _rescue_digit(cell_img)
        if digit:
            text = digit
    return text


# Header keywords that mark a column as numeric (its cells should contain only numbers).
_NUMERIC_HEADER_KW = (
    'duration', 'week', 'cost', 'rm', 'status', '%', 'percent', 'probability',
    'impact', 'score', 'value', 'loc', 'lines of code', 'pages', 'number', 'count',
)
# Glyphs Tesseract emits for digits it can't read cleanly → their most likely digit.
_LOOKALIKE_DIGIT = {
    'l': '1', 'I': '1', '|': '1', '!': '1', ']': '1', '[': '1', 'i': '1', '/': '1',
    'L': '1', ')': '1', '(': '1', 'O': '0', 'o': '0', 'Q': '0', 'D': '0',
    'S': '5', 'Z': '2', 'B': '8', 'g': '9', 'G': '6', 'T': '7',
}


def _coerce_numeric_cell(cell: str) -> str:
    """Maps a cell known to live in a numeric column toward digits, dropping stray letters."""
    out = []
    for ch in cell:
        if ch.isdigit() or ch in ',.%':
            out.append(ch)
        elif ch in _LOOKALIKE_DIGIT:
            out.append(_LOOKALIKE_DIGIT[ch])
        elif ch.isspace():
            out.append(ch)
        # any other stray letter is OCR noise in a numeric column → drop it
    return ' '.join(''.join(out).split())


def _clean_id_cell(cell: str) -> str:
    """
    Cleans an ID-column cell (Task ID / Risk No.). OCR sometimes prepends a noise
    glyph to a single-letter ID ('OA'→'A', 'iB'→'B'). Multi-word labels like
    'Total' are left untouched.
    """
    m = re.fullmatch(r'[Oo0iIl1|!\]\[]([A-Z])', cell.strip())
    return m.group(1) if m else cell


def ocr_table_to_markdown(table_img: np.ndarray):
    """
    Reconstructs a bordered table by detecting its grid lines, OCR-ing each cell,
    and emitting a pipe-delimited block wrapped in [TABLE]…[/TABLE].
    The Java formatter renders this directly, so column alignment is preserved
    even when a cell reads blank. Returns None if no usable grid is found.
    """
    row_ys, col_xs = detect_grid_lines(table_img)
    if len(row_ys) < 2 or len(col_xs) < 2:
        return None   # not enough borders to map a grid → caller falls back to flat OCR

    matrix, filled, total = [], 0, 0
    for r in range(len(row_ys) - 1):
        y1, y2 = row_ys[r], row_ys[r + 1]
        if y2 - y1 < 14:            # too thin → likely a double border line
            continue
        row_cells = []
        for c in range(len(col_xs) - 1):
            x1, x2 = col_xs[c], col_xs[c + 1]
            if x2 - x1 < 14:
                continue
            inset = 3                # crop inside the borders so lines aren't OCR'd
            cell  = table_img[y1 + inset:y2 - inset, x1 + inset:x2 - inset]
            value = ocr_cell(cell)
            row_cells.append(value)
            total += 1
            if value:
                filled += 1
        if any(row_cells):
            matrix.append(row_cells)

    # Reject sparse grids (e.g. Gantt charts / figures) — they aren't real data tables
    if len(matrix) < 2 or total == 0 or (filled / total) < 0.3:
        return None

    # Column-aware cleanup using the header row to know each column's type.
    header = [h.lower() for h in matrix[0]]
    numeric_cols = {
        c for c, h in enumerate(header)
        if any(kw in h for kw in _NUMERIC_HEADER_KW)
    }
    id_cols = {c for c, h in enumerate(header) if h.strip() in ('task id', 'id', 'no', 'no.', 'risk no', 'risk no.')}
    for row in matrix[1:]:
        for c in numeric_cols:
            if c < len(row) and row[c]:
                row[c] = _coerce_numeric_cell(row[c])
        for c in id_cols:
            if c < len(row) and row[c]:
                row[c] = _clean_id_cell(row[c])

    lines = [' | '.join(row) for row in matrix]
    return "[TABLE]\n" + "\n".join(lines) + "\n[/TABLE]"


def ocr_table(table_img: np.ndarray) -> str:
    """
    Reconstructs a bordered table into a [TABLE]…[/TABLE] grid (structure-preserving).
    Falls back to full-region flat OCR when the table has no usable grid lines.
    """
    grid = ocr_table_to_markdown(table_img)
    if grid is not None:
        return grid
    return str(pytesseract.image_to_string(
        Image.fromarray(table_img),
        config='--psm 6 --oem 3',
        output_type=pytesseract.Output.STRING,
    ))


# # ── Complex content (TODO: implement in a later phase) ────────────────────
# def ocr_math_region(img_array: np.ndarray) -> str:
#     """Use pix2tex / LaTeX-OCR for mathematical equation regions."""
#     # from pix2tex.cli import LatexOCR
#     # model = LatexOCR()
#     # return model(Image.fromarray(img_array))
#     raise NotImplementedError

def ocr_page(pil_img: Image.Image) -> str:
    """
    OCRs a single page image.
    - Detects tables with OpenCV → cell-by-cell OCR to preserve column structure.
    - Non-table content → standard preprocessed Tesseract OCR.
    """
    img_array        = np.array(pil_img.convert('RGB'))
    height, width, _ = img_array.shape

    table_bbox = detect_table_bbox(img_array)

    if table_bbox:
        tx, ty, tw, th = table_bbox
        parts = []

        if ty > 40:
            above_pre = preprocess_image(Image.fromarray(img_array[0:ty, 0:width]))
            parts.append(str(pytesseract.image_to_string(
                above_pre, lang='eng', config='--psm 6 --oem 3',
                output_type=pytesseract.Output.STRING,
            )))

        parts.append(ocr_table(img_array[ty:ty+th, tx:tx+tw]))

        if (ty + th) < (height - 40):
            below_pre = preprocess_image(Image.fromarray(img_array[ty+th:height, 0:width]))
            parts.append(str(pytesseract.image_to_string(
                below_pre, lang='eng', config='--psm 6 --oem 3',
                output_type=pytesseract.Output.STRING,
            )))

        return '\n\n'.join(p.strip() for p in parts if p.strip())

    # No table — full-page OCR with preprocessing
    return str(pytesseract.image_to_string(
        preprocess_image(pil_img), lang='eng', config='--psm 6 --oem 3',
        output_type=pytesseract.Output.STRING,
    ))


def ocr_chunk(chunk_path: str) -> str:
    """Convert each page of a PDF chunk to a 300-DPI image and OCR via Tesseract."""
    print(f"    OCR (Tesseract) → {os.path.basename(chunk_path)}")
    images = (
        convert_from_path(chunk_path, dpi=300, poppler_path=POPPLER_PATH)
        if POPPLER_PATH else
        convert_from_path(chunk_path, dpi=300)
    )
    texts  = []
    for idx, img in enumerate(images, 1):
        print(f"      page {idx}/{len(images)}")
        texts.append(ocr_page(img))
    return '\n\n'.join(texts)


def run_ocr(chunks: list[str]) -> str:
    texts = []
    for i, c in enumerate(chunks, 1):
        print(f"  OCR chunk {i}/{len(chunks)}")
        texts.append(ocr_chunk(c))
    return '\n\n'.join(texts)


# =============================================================================
# Text processing
# =============================================================================

# Note: OCR frequently mangles the heading number — "Question 1" → "Question |",
# "Question l", "Question I". We accept those digit-like glyphs at a line start so
# no question is silently dropped (which would corrupt the question count / marks).
QUESTION_RE = re.compile(
    r'(?:^|\n)(?:'
    r'Question\s+[\dlI|]{1,3}(?=[\s.):]|$)'   # Question 1 / mangled Question | / Question I
    r'|Q\.?\s*\d+\.?'
    r'|\d{1,2}\.\s+(?=[A-Z\(])'
    r')',
    re.MULTILINE | re.IGNORECASE
)

# Matches sub-question markers: a), b), (i), (ii), a., b. etc. at line start
SUB_Q_RE = re.compile(
    r'(?m)^[ \t]*(\(?[a-z]{1,3}[).)]|\(?[ivx]{1,5}[).)])\s+',
)


def split_blocks(text: str) -> list[str]:
    matches = list(QUESTION_RE.finditer(text))
    if not matches:
        print("  [WARN] No question markers found in OCR text.")
        print("  [DEBUG] First 600 chars of OCR output:")
        print("  " + text[:600].replace('\n', '\n  '))
        return []

    print(f"  Detected {len(matches)} question markers: "
          + ", ".join(repr(m.group().strip()) for m in matches[:8]))

    positions = [m.start() for m in matches]
    blocks = []
    for i, start in enumerate(positions):
        end   = positions[i + 1] if i + 1 < len(positions) else len(text)
        block = text[start:end].strip()
        if len(block) > 50:
            blocks.append(block)
    return blocks


def extract_preamble(text: str) -> str:
    """Returns scenario/intro text before the first question marker, or '' if too short."""
    matches = list(QUESTION_RE.finditer(text))
    if not matches:
        return ''
    preamble = text[:matches[0].start()].strip()
    return preamble if len(preamble) >= 80 else ''


def clean_preamble(preamble: str) -> str:
    """
    Strip university boilerplate from the preamble, keeping only the actual
    scenario/context text (the part that starts with real sentences in mixed case).
    """
    lines = preamble.split('\n')
    result = []
    in_scenario = False

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if in_scenario:
                result.append('')
            continue

        # Skip ALL-CAPS lines (university/faculty headers)
        if stripped.isupper() and len(stripped) > 5:
            continue
        # Skip course code lines (e.g. BAIT3153, CS101)
        if re.match(r'^[A-Z]{2,6}\s?\d{3,4}', stripped):
            continue
        # Skip standard boilerplate phrases
        lc = stripped.lower()
        if any(lc.startswith(p) for p in [
            'this question paper', 'answer all', 'duration:', 'time allowed',
            'semester ', 'academic year', 'final examination', 'mid-term',
            'date:', 'instructions:', 'faculty of', 'bachelor of',
        ]):
            continue
        # Skip short lines with no lowercase letters (likely short headers/labels)
        if len(stripped) < 40 and not re.search(r'[a-z]', stripped):
            continue

        # Once we encounter text with actual lowercase, we're in the scenario
        if re.search(r'[a-z]', stripped):
            in_scenario = True

        if in_scenario:
            result.append(line)

    return '\n'.join(result).strip()


def split_subquestions(block: str) -> list[tuple[str, str]]:
    """
    Splits a main question block into individual sub-questions.
    The question stem (text before the first sub-question marker) is prepended to
    each sub-question so it retains context when stored and retrieved independently.
    Returns [(full_content, marker), ...].
    If no sub-question markers are found, returns [(block, '')] so the whole block
    is stored as one record — works for any paper format.
    """
    matches = list(SUB_Q_RE.finditer(block))
    if not matches:
        return [(block, '')]

    stem = block[:matches[0].start()].strip()
    result = []
    for i, m in enumerate(matches):
        start = m.start()
        end   = matches[i + 1].start() if i + 1 < len(matches) else len(block)
        subq  = block[start:end].strip()
        full  = (stem + '\n\n' + subq) if (stem and len(stem) > 20) else subq
        result.append((full, m.group(1)))
    return result



def classify_all_topics(block: str, keywords: dict, top_n: int = 2) -> list[str]:
    """
    Returns the top N topics ranked by keyword hit count.
    Requires at least 2 keyword hits to qualify — avoids tagging a question with a
    topic it only mentions incidentally (e.g. one word in passing).
    Falls back to the single best match if nothing reaches the threshold.
    """
    lower = block.lower()
    scores = {}
    for topic, kws in keywords.items():
        hits = sum(1 for kw in kws if kw.lower() in lower)
        if hits >= 2:
            scores[topic] = hits

    if not scores:
        # Threshold not met — fall back to the topic with the most hits (even if just 1)
        best, best_hits = None, 0
        for topic, kws in keywords.items():
            hits = sum(1 for kw in kws if kw.lower() in lower)
            if hits > best_hits:
                best, best_hits = topic, hits
        return [best] if best else ['General']

    sorted_topics = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [t for t, _ in sorted_topics[:top_n]]


def deduplicate_blocks(blocks: list[str]) -> list[str]:
    seen, unique = [], []
    for block in blocks:
        normalized = re.sub(r'\s+', ' ', block.lower().strip())[:100]
        if not any(normalized[:60] == s[:60] for s in seen):
            seen.append(normalized)
            unique.append(block)
    return unique


def clean_text(raw: str) -> str:
    text  = raw.replace('\r\n', '\n').replace('\r', '\n')
    lines = [re.sub(r' {2,}', ' ', l).strip() for l in text.split('\n')]
    out   = []
    for i, l in enumerate(lines):
        if l == '':
            if i == 0 or lines[i - 1] != '':   # collapse consecutive blank lines
                out.append(l)
        else:
            out.append(l)
    return '\n'.join(out).strip()


def extract_marks(block: str):
    # [Total: 25 marks]
    m = re.search(r'\[Total[:\s]+(\d+)\s*marks?\]', block, re.IGNORECASE)
    if m:
        return int(m.group(1))
    # (4 + 2 marks) — sum the parts
    m = re.search(r'\((\d+(?:\s*\+\s*\d+)+)\s*marks?\)', block, re.IGNORECASE)
    if m:
        return sum(int(x) for x in re.findall(r'\d+', m.group(1)))
    # (12 marks)
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



def clean_question_text(block: str) -> str:
    # Strip question marker (Question N / Q1. / 1.)
    cleaned = re.sub(r'^(?:Question\s+[\dlI|]{1,3}|Q\.?\s*\d+\.?|\d{1,2}\.\s+)\s*\n?', '', block, count=1, flags=re.IGNORECASE)
    # Strip marks annotations and boilerplate header lines
    cleaned = re.sub(r'\[Total[:\s]+\d+\s*marks?\]', '', cleaned, flags=re.IGNORECASE)
    # Strip course code lines generically: optional page number + code like BAIT3153, CS101, CIS4001
    cleaned = re.sub(r'(?m)^\d*\s*[A-Z]{2,6}\d{3,4}\w*\s+.*$', '', cleaned)
    # Strip lone page numbers on their own line (e.g. "  5  " or "12")
    cleaned = re.sub(r'(?m)^\s*\d{1,3}\s*$', '', cleaned)
    cleaned = re.sub(r'This question paper consists of.*?\n', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'^\s*\(?\d+\s*marks?\)?\s*$', '', cleaned, flags=re.MULTILINE)
    return cleaned.strip()


def save_raw_ocr(text: str, pyp_id: str) -> str:
    """Save raw OCR text to data/raw/ for debugging."""
    raw_dir = os.path.join(DATA_DIR, 'raw')
    os.makedirs(raw_dir, exist_ok=True)
    out_path = os.path.join(raw_dir, f'{pyp_id}_ocr.txt')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(text)
    print(f"  Raw OCR saved → {out_path}")
    return out_path


# =============================================================================
# Per-paper pipeline
# =============================================================================

def process_paper(conn, paper: dict, config: dict, env: dict, keywords: dict) -> bool:
    pyp_id      = paper['pyp_id']
    title       = paper['title']
    storage_url = paper['storage_url']
    subject     = config['default_subject']

    pdf_url = build_url(
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
        pdf_path = download_pdf(pdf_url)
        print("  [1/4] ✓ Downloaded")

        # ── Step 2: Split → OCR ───────────────────────────────────────────────
        print("  [2/4] Splitting and OCR-ing PDF...")
        chunks   = split_pdf(pdf_path, PAGES_PER_CHUNK)
        raw_text = run_ocr(chunks)
        save_raw_ocr(raw_text, pyp_id)
        print(f"  [2/4] ✓ OCR complete — {len(raw_text)} chars extracted")
    except Exception as step_err:
        print(f"  [ERROR] OCR step failed: {step_err}")
        raise
    finally:
        cleanup(pdf_path, chunks)

    if not raw_text.strip():
        print("  [ERROR] OCR returned empty text. Check the PDF URL and OCR API key.")
        return False

    # ── Step 3: Parse question blocks ────────────────────────────────────────
    print("  [3/4] Parsing question blocks...")
    cleaned_ocr = clean_text(raw_text)
    preamble    = clean_preamble(extract_preamble(cleaned_ocr))
    blocks      = deduplicate_blocks(split_blocks(cleaned_ocr))
    print(f"  [3/4] ✓ {len(blocks)} unique question block(s) found")
    if preamble:
        print(f"  [3/4] Preamble detected ({len(preamble)} chars) — will prepend to Q1")

    if not blocks:
        print(f"  [WARN] No question blocks detected. The paper may use a format the regex doesn't match.")
        return False

    # ── Step 4: Store in Supabase ────────────────────────────────────────────
    print("  [4/4] Storing in Supabase...")
    subject_id = upsert_subject(conn, subject)

    inserted = 0
    for block_idx, block in enumerate(blocks, 1):
        q_text = clean_question_text(block)
        if not q_text or len(q_text) < 10:
            continue

        # Prepend scenario/preamble to Q1 using a safe marker the Java formatter understands
        if block_idx == 1 and preamble:
            q_text = "[SCENARIO]\n" + preamble + "\n[/SCENARIO]\n" + q_text

        marks      = extract_marks(block)
        difficulty = assign_difficulty(marks)
        all_topics = classify_all_topics(block, keywords)

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
        delete_pdf_from_storage(storage_url, config, env)

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

    required_keys = ['default_subject', 'supabase_project_url',
                     'supabase_bucket', 'status_to_process']
    missing = [k for k in required_keys if not config.get(k)]
    if missing:
        print(f"\n[ERROR] Missing fields in dataset_config.json: {missing}")
        return

    print(f"\n  Subject      : {config['default_subject']}")
    print(f"  Status filter: {config['status_to_process']}")

    conn = get_conn(env)
    print('\n  Connected to Supabase PostgreSQL.')

    papers = fetch_papers(conn, config['status_to_process'])
    print(f"  Papers to process: {len(papers)}")

    if not papers:
        print(f"\n  [INFO] No papers with status='{config['status_to_process']}' found.")
        conn.close()
        return

    ok_count, failed = 0, []

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
            import traceback; traceback.print_exc()
            failed.append(paper['title'])
            try:
                conn.rollback()  # reset aborted transaction so next paper can proceed
            except Exception:
                pass

    conn.close()

    print('\n' + '=' * 60)
    print(f"  Done: {ok_count}/{len(papers)} papers processed.")
    if failed:
        print(f"\n  Failed ({len(failed)}):")
        for t in failed:
            print(f"    - {t}")
    print('\n  Verify:')
    print('    SELECT COUNT(*) FROM questions;')
    print('    SELECT COUNT(*) FROM document_questions;')
    print('    GET /api/metadata/subject-topics')
    print('=' * 60)


if __name__ == '__main__':
    main()