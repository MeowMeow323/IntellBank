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
    print(f"  Running MinerU (pipeline backend) on {os.path.basename(pdf_path)}...")
    subprocess.run(
        [MINERU_EXE, '-p', pdf_path, '-o', output_dir, '-b', 'pipeline'],
        env=_mineru_env(), check=True, timeout=1800,
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
        cells = [_TAG_RE.sub('', td).strip() for td in _TD_RE.findall(tr_match.group(1))]
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


def content_list_to_text(blocks: list[dict], auto_dir: str, pyp_id: str) -> str:
    """
    Converts MinerU's content_list.json (one entry per layout block, in
    reading order, each tagged with a 0-based page_idx) into the same
    marker-laden text shape ocr_service.run_ocr() used to produce — so every
    downstream step (clean_text, split_off_cover_page, split_blocks,
    extract_marks, classification, ...) keeps working unchanged regardless
    of which OCR engine produced the text.
    """
    pages: dict[int, list[str]] = {}
    visual_counters: dict[int, int] = {}

    for block in blocks:
        page_idx = block.get('page_idx', 0)
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
            pages.setdefault(page_idx, []).append(piece)

    ordered_page_idxs = sorted(pages.keys())
    page_texts = ['\n\n'.join(pages[p]) for p in ordered_page_idxs]
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
