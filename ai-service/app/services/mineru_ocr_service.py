"""
mineru_ocr_service.py
======================
OCR via MinerU's `pipeline` backend (PP-OCRv6 + dedicated layout/table/
Math-Formula-Recognition sub-models), run as a subprocess in its own
isolated venv (ai-service/mineru_venv/).

Isolation is required, not a style choice: MinerU's dependency chain
(paddleocr -> paddlex -> modelscope -> torch) collides with this project's
own GPU-enabled PyTorch when both are loaded in the same process — both
bundle differently-versioned, same-named cuDNN DLLs. Keeping MinerU in its
own venv (no PyTorch installed there at all) avoids the collision entirely;
verified directly against the real Algebra/Statistics papers this session.

Replaces docTR + Tesseract table/diagram detection + pix2tex: MinerU's
pipeline backend already produces correct LaTeX for equations, real table
structure, and figure crops in one pass, at speed comparable to the old
docTR pipeline (~18-22s/page) with dramatically better math accuracy
(confirmed against real Algebra/Statistics paper content — docTR lost
exponents and inequality symbols that MinerU preserved correctly).
"""

import os
import re
import json
import glob
import shutil
import html
import tempfile
import subprocess

from app.services import ocr_service

BASE_DIR = os.path.dirname(__file__)
DATA_DIR = ocr_service.DATA_DIR

MINERU_VENV_DIR = os.path.join(BASE_DIR, '..', '..', 'mineru_venv')
MINERU_EXE = os.path.join(MINERU_VENV_DIR, 'Scripts', 'mineru.exe')

# pip-installed nvidia-* packages don't register themselves on Windows PATH,
# and Windows' DLL loader can't resolve cuDNN's own dependencies without it
# (verified directly — paddle raises WinError 127 otherwise).
_NVIDIA_PKGS = ['cudnn', 'cublas', 'cuda_runtime', 'cufft', 'curand', 'cusolver', 'cusparse', 'nvjitlink']


def _mineru_env() -> dict:
    site_nvidia = os.path.join(MINERU_VENV_DIR, 'Lib', 'site-packages', 'nvidia')
    bin_dirs = [os.path.join(site_nvidia, pkg, 'bin') for pkg in _NVIDIA_PKGS]
    env = os.environ.copy()
    env['PATH'] = os.pathsep.join(bin_dirs) + os.pathsep + env.get('PATH', '')
    return env


def run_mineru(pdf_path: str, output_dir: str) -> tuple[list[dict], str]:
    """
    Runs MinerU's pipeline backend on the whole PDF in one subprocess call
    (benchmarked faster than per-page invocation — model load/server
    startup is paid once per document, not once per page).
    Returns (content_blocks, auto_dir) — auto_dir is where MinerU also put
    the figure/table crop images referenced by each block's `img_path`.
    """
    if not os.path.exists(MINERU_EXE):
        raise RuntimeError(
            f"MinerU is not installed in mineru_venv (missing {MINERU_EXE}). "
            "Past-year-paper OCR is unavailable until MinerU is set up in that venv "
            "(needs Python 3.10-3.12 + `pip install \"mineru[core]\"`). "
            "Papers already in PROCESSED status still work without OCR."
        )
    print(f"  Running MinerU (pipeline backend) on {os.path.basename(pdf_path)}...")
    # Inherit stdio so MinerU's live progress (first-run model download + per-page OCR)
    # and any error stream straight to the AI-service console — essential for telling a
    # slow first run apart from a hang.
    proc = subprocess.run(
        [MINERU_EXE, '-p', pdf_path, '-o', output_dir, '-b', 'pipeline'],
        env=_mineru_env(), timeout=1800,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"MinerU exited with status {proc.returncode}. See the MinerU output above "
            "in the AI-service console for the reason."
        )
    matches = [
        m for m in glob.glob(os.path.join(output_dir, '*', 'auto', '*_content_list.json'))
        if not m.endswith('_content_list_v2.json')
    ]
    if not matches:
        raise RuntimeError(f"MinerU produced no content_list.json under {output_dir}")
    with open(matches[0], 'r', encoding='utf-8') as f:
        blocks = json.load(f)
    return blocks, os.path.dirname(matches[0])


_TR_RE = re.compile(r'<tr[^>]*>(.*?)</tr>', re.DOTALL | re.IGNORECASE)
_TD_RE = re.compile(r'<t[dh][^>]*>(.*?)</t[dh]>', re.DOTALL | re.IGNORECASE)
_TAG_RE = re.compile(r'<[^>]+>')


def _table_html_to_marker(table_body: str) -> str:
    """
    Converts MinerU's `table_body` (an HTML <table>...</table> string) into
    the existing [TABLE]...[/TABLE] pipe-delimited format Java's
    QuestionHtmlFormatter already renders. Doesn't special-case
    rowspan/colspan merges — the old Tesseract-based table OCR didn't
    handle merged cells either, and none of the real papers seen so far use
    them.
    """
    rows = []
    for tr_match in _TR_RE.finditer(table_body):
        cells = [html.unescape(_TAG_RE.sub('', td)).strip() for td in _TD_RE.findall(tr_match.group(1))]
        if any(cells):
            rows.append(' | '.join(cells))
    if not rows:
        return ''
    return '[TABLE]\n' + '\n'.join(rows) + '\n[/TABLE]'


def _save_visual_block(block: dict, auto_dir: str, pyp_id: str, page_idx: int, n: int) -> str:
    """Copies a table/image/chart crop into app/data/diagrams/, matching the
    naming convention the old save_diagram_crop() used, so nothing
    downstream (Java's marker rendering) needs to change."""
    img_path = block.get('img_path')
    if not img_path:
        return ''
    src = os.path.join(auto_dir, img_path)
    if not os.path.exists(src):
        return ''
    diagrams_dir = os.path.join(DATA_DIR, 'diagrams')
    os.makedirs(diagrams_dir, exist_ok=True)
    ext = os.path.splitext(src)[1] or '.jpg'
    filename = f'{pyp_id}_{page_idx}_{n}{ext}'
    shutil.copyfile(src, os.path.join(diagrams_dir, filename))
    return f'diagrams/{filename}'


# A floating sub-question marker (e.g. "d)") sitting in the left margin can
# land at nearly the same vertical position as its own paragraph's first
# line, but MinerU's own block-array order isn't reliably "marker, then
# paragraph" for these — verified directly against a real paper where a
# trailing "d)" sub-question's marker and body were swapped, leaving the
# marker isolated right next to the page footer with its real content
# floating above, unattached. Re-sorting by position (row-band, then
# left-to-right within a row) fixes this without needing to special-case
# aside_text at all — it's just "read the page like a person would".
_ROW_BAND_PX = 20


def _reading_order(blocks_on_page: list[dict]) -> list[dict]:
    items = sorted(
        ((b.get('bbox') or [0, 0, 0, 0])[1], (b.get('bbox') or [0, 0, 0, 0])[0], b)
        for b in blocks_on_page
    )
    rows: list[tuple[float, list[tuple[float, dict]]]] = []
    for top, left, b in items:
        if rows and top - rows[-1][0] <= _ROW_BAND_PX:
            rows[-1][1].append((left, b))
        else:
            rows.append((top, [(left, b)]))
    ordered = []
    for _, row_items in rows:
        row_items.sort(key=lambda x: x[0])
        ordered.extend(b for _, b in row_items)
    return ordered


def content_list_to_text(blocks: list[dict], auto_dir: str, pyp_id: str) -> str:
    """
    Converts MinerU's content_list.json (one entry per layout block, each
    tagged with a 0-based page_idx) into the same marker-laden text shape
    ocr_service.run_ocr() used to produce — so every downstream step
    (clean_text, split_off_cover_page, split_blocks, extract_marks,
    classification, ...) keeps working unchanged regardless of which OCR
    engine produced the text. Blocks are re-ordered per page by position
    (see _reading_order) rather than trusting MinerU's own array order.
    """
    by_page: dict[int, list[dict]] = {}
    for block in blocks:
        by_page.setdefault(block.get('page_idx', 0), []).append(block)

    visual_counters: dict[int, int] = {}
    page_texts = []
    for page_idx in sorted(by_page.keys()):
        pieces = []
        for block in _reading_order(by_page[page_idx]):
            btype = block.get('type')
            piece = None

            if btype in ('text', 'header', 'footer', 'page_number', 'aside_text', 'equation'):
                piece = block.get('text', '').strip()
            elif btype == 'table':
                piece = _table_html_to_marker(block.get('table_body', ''))
            elif btype in ('image', 'chart'):
                visual_counters[page_idx] = visual_counters.get(page_idx, 0) + 1
                path = _save_visual_block(block, auto_dir, pyp_id, page_idx, visual_counters[page_idx])
                piece = f'[DIAGRAM: {path}]' if path else None

            if piece:
                pieces.append(piece)
        page_texts.append('\n\n'.join(pieces))

    return f'\n\n{ocr_service.PAGE_BREAK}\n\n'.join(page_texts)


def run_ocr_via_mineru(pdf_path: str, pyp_id: str) -> str:
    """Entry point used by paper_processing_service — replaces the old
    split_pdf()+run_ocr() call. Runs MinerU once over the whole PDF and
    returns one PAGE_BREAK-joined, marker-laden text string."""
    output_dir = tempfile.mkdtemp(prefix=f'mineru_{pyp_id}_')
    try:
        blocks, auto_dir = run_mineru(pdf_path, output_dir)
        return content_list_to_text(blocks, auto_dir, pyp_id)
    finally:
        shutil.rmtree(output_dir, ignore_errors=True)
