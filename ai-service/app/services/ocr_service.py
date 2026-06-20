"""
ocr_service.py
===============
PDF download helpers + question-block text parsing. OCR itself is done by
MinerU (see mineru_ocr_service.py) — this module owns everything downstream
of "produce one OCR'd text string with inline markers"
([[PAGE_BREAK]], [TABLE]...[/TABLE], [DIAGRAM: path], $...$/$$...$$):
splitting into question blocks, marks/difficulty extraction, and the
regex-based text cleanup that's independent of which OCR engine ran.

Extracted from app/tools/seed_db_from_ocr.py so the logic is reusable from
both the CLI seeding script and the FastAPI routes — behavior is unchanged.
"""

import os
import re
import sys
import json
import tempfile
import requests

# Windows' default cp1252 console crashes when printing → ✓ ✗ — force UTF-8 output.
try:
    sys.stdout.reconfigure(encoding='utf-8')   # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding='utf-8')   # type: ignore[union-attr]
except Exception:
    pass

BASE_DIR    = os.path.dirname(__file__)
DATA_DIR    = os.path.join(BASE_DIR, '..', 'data')
CONFIG_PATH = os.path.join(BASE_DIR, '..', 'config', 'dataset_config.json')


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


def cleanup(pdf_path: str):
    try:
        if pdf_path and os.path.exists(pdf_path):
            os.remove(pdf_path)
    except Exception as e:
        print(f"  [WARN] cleanup: {e}")


# Inserted between pages in the OCR'd text so callers can tell where page 1
# (cover info only) ends and where a trailing appendix (formula sheets,
# statistical tables) begins — see split_off_cover_page()/
# strip_trailing_appendix(). Produced by mineru_ocr_service.content_list_to_text().
PAGE_BREAK = '[[PAGE_BREAK]]'


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
