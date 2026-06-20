"""
ocr_service.py
===============
Local Tesseract + OpenCV OCR pipeline: PDF download/splitting, page OCR with
table-grid reconstruction, and question-block text parsing.

Extracted from app/tools/seed_db_from_ocr.py so the logic is reusable from
both the CLI seeding script and the FastAPI routes — behavior is unchanged.
"""

import os
import re
import sys
import json
import tempfile
import requests
import numpy as np
import cv2
from PIL import Image
from pdf2image import convert_from_path
import pytesseract

from app.services import math_ocr_service, doctr_ocr_service

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

try:
    from pypdf import PdfReader, PdfWriter
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False
    print("[WARN] pypdf not installed. Run: pip install pypdf")

BASE_DIR    = os.path.dirname(__file__)
DATA_DIR    = os.path.join(BASE_DIR, '..', 'data')
CHUNK_DIR   = os.path.join(DATA_DIR, 'temp_pdf_chunks')
CONFIG_PATH = os.path.join(BASE_DIR, '..', 'config', 'dataset_config.json')
TESSDATA_DIR = os.path.join(BASE_DIR, '..', 'tessdata')

PAGES_PER_CHUNK = 3
OCR_DPI = 400

# Use the higher-accuracy tessdata_best English model instead of whatever
# the system Tesseract install bundles by default — checked on this machine,
# the installer's bundled eng.traineddata is only 4.1MB (the lightweight
# "fast" variant); tessdata_best is a real accuracy upgrade over that.
# Pointing TESSDATA_PREFIX here instead of overwriting the system install
# avoids touching anything outside this project.
if os.path.exists(os.path.join(TESSDATA_DIR, 'eng.traineddata')):
    os.environ['TESSDATA_PREFIX'] = TESSDATA_DIR


# =============================================================================
# Config
# =============================================================================

def load_config() -> dict:
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


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
    line morphology, validated by actually finding a real row/column grid in
    the candidate region (detect_grid_lines — the same check
    ocr_table_to_markdown relies on) rather than a raw contour-area
    threshold.

    The area-threshold approach was fundamentally unreliable: cv2.contourArea
    on a grid mask is dominated by the LINE pixels themselves (thin strokes),
    not the area they enclose, so it has no real relationship to how big or
    legitimate the table is. Verified directly against a real small 2-row
    data table: its largest line-contour was 0.03% of the page — roughly
    1000x below the old 3% cutoff — despite being a perfectly well-formed
    bordered table that ocr_table_to_markdown can parse fine once it's
    actually handed the right crop.
    """
    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # v_kernel was (1, 40) — requires a 40px-tall unbroken vertical run to
    # survive opening. Verified directly against a real small 2-row table:
    # its column-divider lines are only ~37px tall (one row's height), so
    # they never survived at all — v_lines came back completely empty across
    # the whole page. 15px catches short single-row dividers too while still
    # easily matching taller multi-row tables (a real line of any height
    # above this is unaffected — opening only removes lines *shorter* than
    # the kernel).
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 15))
    h_lines  = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel, iterations=2)
    v_lines  = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel, iterations=2)
    grid     = cv2.add(h_lines, v_lines)

    # Merge line segments belonging to the same table (touching/near-touching
    # at their intersections) into one connected component per table.
    merge_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
    merged = cv2.morphologyEx(grid, cv2.MORPH_CLOSE, merge_kernel, iterations=2)

    contours, _ = cv2.findContours(merged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    candidates = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if w < 100 or h < 30:
            continue  # too small to plausibly be a table — stray line/noise
        # N row_ys boundary positions delimit N-1 actual rows (e.g. top,
        # middle, bottom = 2 rows) — >=2 boundaries alone just means "a single
        # bordered rectangle", which matched a lone empty box inside a tree
        # diagram in testing. Requiring >=3 boundaries each way (>=2 real
        # rows AND >=2 real columns) is what actually distinguishes a table
        # from a single box.
        row_ys, col_xs = detect_grid_lines(img_array[y:y + h, x:x + w])
        if len(row_ys) >= 3 and len(col_xs) >= 3:
            candidates.append((w * h, (x, y, w, h)))

    if not candidates:
        return None

    return max(candidates, key=lambda item: item[0])[1]


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


# =============================================================================
# Diagram detection — large non-text image regions (figures/charts)
# =============================================================================

def detect_diagram_bboxes(img_array: np.ndarray, exclude_bbox=None) -> list[tuple[int, int, int, int, float, float]]:
    """
    Detects diagram/figure regions as vertical bands of consecutive
    low-confidence text lines, sandwiched between clearly-confident prose.
    Returns (x, y, w, h, text_top, text_bottom) — the bbox is padded for a
    visually-complete crop; text_top/text_bottom are the unpadded detected
    bounds, used by callers to exclude exactly the diagram's own lines from
    the regular text stream without also swallowing the next real line.

    An earlier version used ink-blob contour detection (close nearby pixels,
    keep blobs over an area threshold) — it failed on sparse diagrams (tree
    diagrams: a few short labels and thin branch lines spread across a tall,
    mostly-empty region). The closing kernel needed to bridge those big gaps
    also merges in all the surrounding page text into one blob, and since
    most of that blob really is prose, it reads as "text-dense" overall and
    gets rejected — masking the actual diagram nested inside it. Verified
    against a real tree-diagram page: every line inside it has at most one
    confidently-read "word" (OCR noise on stray strokes/labels), cleanly
    bounded above and below by lines with 10+ confident words of real prose.
    """
    lines = sorted(doctr_ocr_service.extract_lines(Image.fromarray(img_array)), key=lambda l: l['top'])
    if not lines:
        return []

    # Page-wide content margins (not the band's own word extent, which would
    # be too narrow — a diagram's lines/shapes mostly have no associated
    # "word" at all) so a crop isn't clipped to just the stray OCR noise.
    content_left  = min(l['left'] for l in lines)
    content_right = max(l['right'] for l in lines)

    heights = [l['bottom'] - l['top'] for l in lines]
    typical_height = sorted(heights)[len(heights) // 2]
    min_band_height = typical_height * 3  # scales with DPI/font size, not a fixed pixel count

    boxes = []
    run: list[dict] = []

    def flush_run():
        if not run:
            return
        top, bottom = run[0]['top'], run[-1]['bottom']
        if bottom - top >= min_band_height:
            # Generous padding on the saved CROP — empty shapes (rectangle
            # outlines, branch lines) commonly extend past wherever the OCR
            # found a text fragment to anchor the band on, so a tight crop
            # clips them. The text-EXCLUSION range deliberately stays
            # unpadded (top/bottom as detected) — padding that range too
            # previously ate into the next real prose line right after the
            # diagram.
            pad = int(typical_height * 1.5)
            x = max(0, content_left - pad)
            y = max(0, top - pad)
            w = min(img_array.shape[1] - x, (content_right - content_left) + 2 * pad)
            h = min(img_array.shape[0] - y, (bottom - top) + 2 * pad)
            # docTR's geometry is float (normalized coords * pixel size) —
            # cast to plain int for array slicing (img_array[y:y+h, x:x+w])
            # downstream, which raises on float indices.
            boxes.append((int(x), int(y), int(w), int(h), top, bottom))
        run.clear()

    for line in lines:
        if line['confident'] <= 1:
            run.append(line)
        else:
            flush_run()
    flush_run()

    if exclude_bbox:
        ex, ey, ew, eh = exclude_bbox
        filtered = []
        for x, y, w, h, text_top, text_bottom in boxes:
            overlap_x = max(0, min(x + w, ex + ew) - max(x, ex))
            overlap_y = max(0, min(y + h, ey + eh) - max(y, ey))
            if overlap_x * overlap_y <= 0.5 * w * h:
                filtered.append((x, y, w, h, text_top, text_bottom))
        boxes = filtered

    return boxes


def save_diagram_crop(img_array: np.ndarray, bbox: tuple[int, int, int, int],
                       pyp_id: str, page_idx: int, n: int) -> str:
    x, y, w, h = bbox
    crop = img_array[y:y + h, x:x + w]
    diagrams_dir = os.path.join(DATA_DIR, 'diagrams')
    os.makedirs(diagrams_dir, exist_ok=True)
    filename = f'{pyp_id}_{page_idx}_{n}.png'
    Image.fromarray(crop).save(os.path.join(diagrams_dir, filename))
    return f'diagrams/{filename}'


# =============================================================================
# Line-level text OCR — selective pix2tex pass for equation-like lines
# =============================================================================

def ocr_text_region(
    pil_img: Image.Image,
    extra_markers: list[tuple[int, str]] | None = None,
    exclude_y_ranges: list[tuple[float, float]] | None = None,
) -> str:
    """
    OCRs a text region line-by-line (via docTR's word-level bounding boxes —
    see doctr_ocr_service) so individual equation-like lines can be re-OCR'd
    with pix2tex instead of plain text recognition, which mangles dense math
    glyphs. Also splices in `extra_markers` (e.g. diagram placeholders) at
    the page position they came from, and drops any line whose vertical
    span falls inside `exclude_y_ranges` — a detected diagram's own short
    text fragments (labels, numbers) would otherwise leak into the regular
    text stream right alongside its [DIAGRAM:] marker, since a strong OCR
    engine can read those fragments confidently even though they're not
    actually prose. Falls back to the plain OCR'd line text when nothing is
    flagged or pix2tex fails. Reassembles with blank-line paragraph breaks so
    downstream parsing (clean_text/split_blocks) sees the same shape a plain
    full-page OCR pass would have produced.
    """
    img_array = np.array(pil_img.convert('RGB'))
    doctr_lines = doctr_ocr_service.extract_lines(pil_img)

    # entries: [top, bottom, text, is_equation]
    entries: list[list] = []
    for L in doctr_lines:
        if exclude_y_ranges and any(L['top'] < y2 and L['bottom'] > y1 for y1, y2 in exclude_y_ranges):
            continue
        raw_text = L['text']
        latex = None
        if math_ocr_service.is_equation_candidate(raw_text):
            pad = 4
            y1, y2 = max(0, int(L['top']) - pad), min(img_array.shape[0], int(L['bottom']) + pad)
            x1, x2 = max(0, int(L['left']) - pad), min(img_array.shape[1], int(L['right']) + pad)
            latex = math_ocr_service.ocr_equation_region(img_array[y1:y2, x1:x2]) or None
        entries.append([L['top'], L['bottom'], latex if latex else raw_text, latex is not None])

    for y, marker_text in (extra_markers or []):
        entries.append([y, y, marker_text, False])

    entries.sort(key=lambda e: e[0])
    if not entries:
        return ""

    content_heights = [e[1] - e[0] for e in entries if e[1] > e[0]]
    typical_height = sorted(content_heights)[len(content_heights) // 2] if content_heights else 20

    out_lines = []
    prev_bottom = None
    for idx, (top, bottom, text, is_equation) in enumerate(entries):
        if prev_bottom is not None and (top - prev_bottom) > typical_height * 1.3:
            out_lines.append('')

        if is_equation:
            gap_before = (top - entries[idx - 1][1]) if idx > 0 else None
            gap_after  = (entries[idx + 1][0] - bottom) if idx < len(entries) - 1 else None
            is_lone = (gap_before is None or gap_before > typical_height * 1.3) and \
                      (gap_after is None or gap_after > typical_height * 1.3)
            text = f"$${text}$$" if is_lone else f"${text}$"

        out_lines.append(text)
        prev_bottom = bottom

    return '\n'.join(out_lines)


# =============================================================================
# Page / chunk / document OCR orchestration
# =============================================================================

def ocr_page(pil_img: Image.Image, pyp_id: str = '', page_idx: int = 0) -> str:
    """
    OCRs a single page image.
    - Detects tables with OpenCV → cell-by-cell OCR to preserve column structure.
    - Detects diagrams/figures → crops them to disk, inlines a [DIAGRAM: path] marker.
    - Non-table, non-diagram content → line-level OCR with selective pix2tex for equations.
    """
    img_array        = np.array(pil_img.convert('RGB'))
    height, width, _ = img_array.shape

    table_bbox     = detect_table_bbox(img_array)
    diagram_bboxes = detect_diagram_bboxes(img_array, exclude_bbox=table_bbox)

    # Each entry: (center_y on page, marker text, y1 on page, y2 on page).
    # The y1/y2 range is used to exclude that diagram's own short text
    # fragments (labels, numbers) from the regular text stream — without
    # this, a stronger OCR engine that can confidently read those isolated
    # fragments (unlike Tesseract, which mostly produced noise there) leaks
    # them into the question text right alongside the [DIAGRAM:] marker.
    diagrams = []
    for n, bbox in enumerate(diagram_bboxes, 1):
        x, y, w, h, text_top, text_bottom = bbox
        path = save_diagram_crop(img_array, (x, y, w, h), pyp_id or 'unknown', page_idx, n)
        diagrams.append(((text_top + text_bottom) / 2, f"[DIAGRAM: {path}]", text_top, text_bottom))

    if table_bbox:
        tx, ty, tw, th = table_bbox
        parts = []

        if ty > 40:
            above = [d for d in diagrams if d[0] < ty]
            parts.append(ocr_text_region(
                Image.fromarray(img_array[0:ty, 0:width]),
                extra_markers=[(y, txt) for y, txt, _, _ in above],
                exclude_y_ranges=[(y1, y2) for _, _, y1, y2 in above],
            ))

        parts.append(ocr_table(img_array[ty:ty+th, tx:tx+tw]))

        if (ty + th) < (height - 40):
            below  = [d for d in diagrams if d[0] >= ty + th]
            offset = ty + th
            parts.append(ocr_text_region(
                Image.fromarray(img_array[offset:height, 0:width]),
                extra_markers=[(y - offset, txt) for y, txt, _, _ in below],
                exclude_y_ranges=[(y1 - offset, y2 - offset) for _, _, y1, y2 in below],
            ))

        return '\n\n'.join(p.strip() for p in parts if p.strip())

    # No table — full-page line-level OCR with math/diagram handling
    return ocr_text_region(
        pil_img,
        extra_markers=[(y, txt) for y, txt, _, _ in diagrams],
        exclude_y_ranges=[(y1, y2) for _, _, y1, y2 in diagrams],
    )


# Inserted between every OCR'd page so callers can tell where page 1 (cover
# info only) ends and where a trailing appendix (formula sheets, statistical
# tables) begins — see split_off_cover_page()/strip_trailing_appendix().
PAGE_BREAK = '[[PAGE_BREAK]]'


def ocr_chunk(chunk_path: str, pyp_id: str = '', page_offset: int = 0) -> str:
    """Convert each page of a PDF chunk to a high-DPI image and OCR via Tesseract."""
    print(f"    OCR (Tesseract) → {os.path.basename(chunk_path)}")
    images = (
        convert_from_path(chunk_path, dpi=OCR_DPI, poppler_path=POPPLER_PATH)
        if POPPLER_PATH else
        convert_from_path(chunk_path, dpi=OCR_DPI)
    )
    texts  = []
    for idx, img in enumerate(images, 1):
        print(f"      page {idx}/{len(images)}")
        texts.append(ocr_page(img, pyp_id=pyp_id, page_idx=page_offset + idx))
    return f'\n\n{PAGE_BREAK}\n\n'.join(texts)


def run_ocr(chunks: list[str], pyp_id: str = '') -> str:
    texts = []
    page_offset = 0
    for i, c in enumerate(chunks, 1):
        print(f"  OCR chunk {i}/{len(chunks)}")
        texts.append(ocr_chunk(c, pyp_id, page_offset))
        page_offset += PAGES_PER_CHUNK  # approximate — only needs to keep diagram filenames unique
    return f'\n\n{PAGE_BREAK}\n\n'.join(texts)


def split_off_cover_page(text: str) -> tuple[str, str]:
    """
    Splits OCR'd text into (page1_text, rest_text) using the PAGE_BREAK
    markers inserted during OCR. Page 1 is cover info only (course code,
    subject, instructions) — never real question content — so callers should
    scan page1_text for metadata and rest_text for everything else. Falls
    back to (text, text) if no page break was found (e.g. a single-page scan)
    so callers degrade gracefully instead of losing content.
    """
    if PAGE_BREAK not in text:
        return text, text
    page1, _, rest = text.partition(PAGE_BREAK)
    return page1, rest.replace(PAGE_BREAK, '\n\n')


# Trailing reference material (formula sheets, statistical tables) printed
# after the last real question — has no question marker after it, so it
# would otherwise get glued onto whatever the last detected question is.
APPENDIX_START_RE = re.compile(
    r'(?im)^\s*(list of formulae|the normal distribution function|'
    r'statistical tables|table of formulae|appendix)\b'
)


def strip_trailing_appendix(text: str) -> str:
    m = APPENDIX_START_RE.search(text)
    return text[:m.start()] if m else text


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


# Per-question footer, e.g. "[Total: 25 marks]" — used as a secondary split
# signal for cases where the "Question N" header itself gets OCR-garbled
# badly enough that QUESTION_RE can't match it at all (e.g. "Question 2"
# misread as "Yuestion Z" — different first letter, not just a digit
# lookalike), but the marks footer right after each question is still
# readable. Bracket chars are themselves sometimes misread (saw "(...]" in
# real output), so both sides are matched independently and optionally.
TOTAL_MARKS_RE = re.compile(r'[\[\(]?\s*Total[:\s]+\d+\s*marks?\s*[\]\)]?', re.IGNORECASE)


def _resplit_on_total_marks(block: str) -> list[str]:
    """
    If a block contains more than one "[Total: N marks]" footer, it likely
    swallowed a whole extra question whose own header failed to match
    QUESTION_RE. Re-split right after each footer so each piece keeps just
    one question's content instead of silently merging two questions.
    """
    matches = list(TOTAL_MARKS_RE.finditer(block))
    if len(matches) <= 1:
        return [block]

    print(f"  [INFO] Block has {len(matches)} '[Total: marks]' footers — "
          f"re-splitting (a 'Question N' header was likely OCR-garbled)")

    pieces, start = [], 0
    for m in matches:
        pieces.append(block[start:m.end()].strip())
        start = m.end()
    trailing = block[start:].strip()
    if trailing:
        pieces[-1] = pieces[-1] + '\n' + trailing
    return [p for p in pieces if len(p) > 50]


def split_blocks(text: str) -> list[str]:
    matches = list(QUESTION_RE.finditer(text))
    if not matches:
        print("  [WARN] No question markers found in OCR text.")
        print("  [DEBUG] First 600 chars of OCR output:")
        print("  " + text[:600].replace('\n', '\n  '))
        return []

    # "Question N (continued)" — printed when a question spans a page break —
    # matches QUESTION_RE just like a real header, but it's NOT a new question;
    # treating it as a split boundary corrupts the original question into two
    # separate (wrongly-titled, wrongly-marked) blocks. Drop these matches so
    # the continuation's content stays merged with the question it belongs to.
    matches = [
        m for m in matches
        if not re.match(r'\s*\(\s*continued\s*\)', text[m.end():m.end() + 25], re.IGNORECASE)
    ]
    if not matches:
        return []

    print(f"  Detected {len(matches)} question markers: "
          + ", ".join(repr(m.group().strip()) for m in matches[:8]))

    positions = [m.start() for m in matches]
    blocks = []
    for i, start in enumerate(positions):
        end   = positions[i + 1] if i + 1 < len(positions) else len(text)
        block = text[start:end].strip()
        if len(block) > 50:
            blocks.extend(_resplit_on_total_marks(block))
    return blocks


# Cover-page header line: a course code followed by the subject name on the
# same line, e.g. "BMIT3273 Cloud Computing" or "BAIT3153 Software Engineering".
COURSE_CODE_RE = re.compile(
    r'(?m)^\s*([A-Z]{2,6}\d{3,4}[A-Z]?)\s+([A-Z][A-Za-z ,&/\-]{2,80})\s*$'
)


def detect_subject_from_text(text: str) -> tuple[str, str] | None:
    """
    Scans the first few lines of OCR text for a "<course code> <subject name>"
    header (always on the cover page, well before any question marker).
    Returns (course_code, subject_name), or None if no such line is found —
    callers should fall back to a configured default subject in that case.
    """
    head = '\n'.join(text.split('\n')[:15])
    m = COURSE_CODE_RE.search(head)
    if not m:
        return None
    return m.group(1).strip(), m.group(2).strip()


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
            'date:', 'instructions', 'faculty of', 'bachelor of',
        ]):
            continue
        # Skip short lines with no lowercase letters (likely short headers/labels)
        if len(stripped) < 40 and not re.search(r'[a-z]', stripped):
            continue
        # Skip short standalone labels like "Instructions to Candidates:" —
        # mixed-case (so the ALL-CAPS check above misses them) but still just
        # a heading, not actual scenario prose. A real scenario sentence this
        # short ending in ':' would be unusual.
        if len(stripped) < 40 and stripped.endswith(':'):
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


# Statistical distribution notation: "X ~ B(n, p)" / "X ~ N(mu, sigma)" —
# OCR consistently misreads "~" (distributed as) as a hyphen here. This
# exact shape (single capital letter, space, hyphen, space, a known
# distribution-name prefix, open paren) doesn't occur in ordinary prose, so
# it's safe to correct deterministically rather than leaving it to
# spellcheck (which only touches dictionary words, not symbols).
DISTRIBUTION_TILDE_RE = re.compile(r'\b([A-Z])\s-\s(B|N|Po|Geo|Exp|U)\(')


def fix_common_ocr_substitutions(text: str) -> str:
    return DISTRIBUTION_TILDE_RE.sub(r'\1 ~ \2(', text)


def clean_question_text(block: str) -> str:
    # Strip question marker (Question N / Q1. / 1.)
    cleaned = re.sub(r'^(?:Question\s+[\dlI|]{1,3}|Q\.?\s*\d+\.?|\d{1,2}\.\s+)\s*\n?', '', block, count=1, flags=re.IGNORECASE)
    # Strip any "Question N (continued)" line that's now merged into the
    # middle of this block (split_blocks() drops it as a split boundary, but
    # the literal text is still sitting in the original OCR output).
    cleaned = re.sub(r'(?im)^\s*Question\s+[\dlI|]{1,3}\s*\(\s*continued\s*\)\s*$', '', cleaned)
    # Strip the per-question [Total: N marks] footer — already captured in
    # the `marks` DB column, so it's redundant inline.
    cleaned = re.sub(r'\[Total[:\s]+\d+\s*marks?\]', '', cleaned, flags=re.IGNORECASE)
    # Strip course code lines generically: optional page number + code like
    # BAIT3153, CS101, CIS4001 — code is sometimes immediately followed by a
    # colon before the subject name ("FPMA1014: STATISTICS") rather than a
    # plain space, so the separator needs to allow both.
    cleaned = re.sub(r'(?m)^\d*\s*[A-Z]{2,6}\d{3,4}\w*[:\s]+.*$', '', cleaned)
    # Strip lone page numbers on their own line (e.g. "  5  " or "12")
    cleaned = re.sub(r'(?m)^\s*\d{1,3}\s*$', '', cleaned)
    cleaned = re.sub(r'This question paper consists of.*?\n', '', cleaned, flags=re.IGNORECASE)
    # NOTE: a rule used to live here stripping any standalone "(N marks)"
    # line entirely — removed. It was deleting real per-sub-question marks
    # annotations, not noise: when a "(2 marks)" annotation happens to wrap
    # onto its own line (common after OCR), the rule deleted it outright.
    # Verified against real output: almost every sub-question's marks had
    # vanished this way; the one that survived only did because it was
    # *also* garbled ("(2" misread as "-"), which incidentally dodged the
    # pattern. The actual redundant marks line ([Total: N marks]) is already
    # handled above and doesn't need this second, overly broad rule.
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
