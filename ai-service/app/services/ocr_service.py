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

# Sub-question markers, split into two distinct levels (letter: a) b) c),
# roman: (i) (ii) (iii)) rather than one flat list. A bare "i"/"ii" matches
# both `[a-z]{1,3}` and `[ivx]{1,5}`, so without a structural distinction
# (i)/(ii) under a lettered part get misread as new top-level letter
# matches — verified against real papers, roman numerals are always fully
# parenthesized and letters never are, so requiring that disambiguates
# cleanly. `\s*` (not `\s+`) tolerates OCR output with no space after the
# marker at all (seen as "a)Explain..." in real output) — `\s+` silently
# swallowed that whole sub-part into the previous stem instead of matching it.
LETTER_SUB_Q_RE = re.compile(r'(?m)^[ \t]*([a-z]{1,3}[).)])\s*')
ROMAN_SUB_Q_RE  = re.compile(r'(?m)^[ \t]*(\([ivx]{1,5}\))\s*')


# Per-question footer, e.g. "[Total: 25 marks]" — used as a secondary split
# signal for cases where the "Question N" header itself gets OCR-garbled
# badly enough that QUESTION_RE can't match it at all (e.g. "Question 2"
# misread as "Yuestion Z" — different first letter, not just a digit
# lookalike), but the marks footer right after each question is still
# readable. Bracket chars are themselves sometimes misread (saw "(...]" in
# real output), so both sides are matched independently and optionally.
TOTAL_MARKS_RE = re.compile(r'[\[\(]?\s*Total[:\s]+\d+\s*marks?\s*[\]\)]?', re.IGNORECASE)

# Some papers print the question-level total with no brackets and no
# "Total" keyword at all — just "25 marks" alone on its own line. Checked
# separately (not merged into TOTAL_MARKS_RE) so a real per-part "(N marks)"
# annotation — which is never alone on a line without parens — can't get
# caught by this looser pattern.
BARE_TOTAL_RE = re.compile(r'(?m)^\s*\d+\s*marks?\s*$', re.IGNORECASE)


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


# A real scenario/stem is worth prepending; a bare "Question 3" header (or a
# bare "c)" with nothing before its own roman numerals) isn't — this
# threshold is what tells the two apart. Same value `split_subquestions`
# used before it was replaced.
_MIN_STEM_LEN = 20


def split_subquestions_deep(block: str) -> tuple[list[tuple[str, str]], int | None]:
    """
    Splits a main "Question N" block down to its deepest available
    sub-question level: roman numerals (i)/(ii)/(iii) where a lettered part
    has them, otherwise the letter level a)/b)/c)/d). Any scenario text
    above a)/b)/c) (applies to the whole question) and any scenario text
    inside one lettered part above its own (i)/(ii) (applies to just that
    part) both get copied into every deepest piece that needs them, so each
    stored row reads standalone.

    Returns (pieces, overall_total) — pieces is [(content, label), ...]
    (label like "a", "c-i", for logging only, not stored), overall_total is
    the question's [Total: N marks] (or bare "N marks") value if present,
    for process_paper() to fall back on when a piece has no marks
    annotation of its own.

    If no lettered markers are found at all, returns ([(block, '')], total)
    so the whole block is stored as one record — works for any paper format.
    """
    overall_total = None
    m = TOTAL_MARKS_RE.search(block)
    if not m:
        m = BARE_TOTAL_RE.search(block)
    if m:
        digits = re.search(r'\d+', m.group())
        overall_total = int(digits.group()) if digits else None
        block = block[:m.start()]

    letters = list(LETTER_SUB_Q_RE.finditer(block))
    if not letters:
        return [(block.strip(), '')], overall_total

    outer_stem = block[:letters[0].start()].strip()
    keep_outer = len(outer_stem) > _MIN_STEM_LEN

    pieces = []
    for i, lm in enumerate(letters):
        l_start = lm.start()
        l_end   = letters[i + 1].start() if i + 1 < len(letters) else len(block)
        letter_text  = block[l_start:l_end].strip()
        letter_label = lm.group(1).strip('().')

        romans = list(ROMAN_SUB_Q_RE.finditer(letter_text))
        if not romans:
            content = (outer_stem + '\n\n' + letter_text) if keep_outer else letter_text
            pieces.append((content, letter_label))
            continue

        # A single lettered part can contain *multiple independent*
        # (i)/(ii) pairs, each introduced by its own fresh scenario, each
        # restarting its own roman count from "i" — verified against a real
        # Statistics paper (Question 4's "a)" has three separate (i)/(ii)
        # pairs about three unrelated scenarios). A bare single inner_stem
        # (text before the *first* roman match, reused for every piece) is
        # wrong here on two counts: every later group loses its own real
        # scenario, and naively spanning "this roman to the next roman"
        # makes the last piece of one group swallow the next group's
        # scenario text (it has nowhere else to go otherwise).
        #
        # Fix: bound each roman piece by its *own* marks annotation if it
        # has one, rather than by the next roman match. That leaves
        # whatever sits between one piece's real end and the next roman
        # match available as that next piece's stem — which is exactly the
        # in-between scenario text. Falls back to "next roman match" (the
        # old behavior) when a piece has no marks annotation of its own.
        tight_ends = []
        for j, rm in enumerate(romans):
            window_end = romans[j + 1].start() if j + 1 < len(romans) else len(letter_text)
            mm = re.search(r'\(\s*\d+(?:\s*\+\s*\d+)*\s*marks?\s*\)', letter_text[rm.start():window_end], re.IGNORECASE)
            tight_ends.append(rm.start() + mm.end() if mm else window_end)

        run_starts = [0]
        for ri in range(1, len(romans)):
            if romans[ri].group(1).strip('()').lower() == 'i':
                run_starts.append(ri)

        for run_idx, start_idx in enumerate(run_starts):
            end_idx = run_starts[run_idx + 1] if run_idx + 1 < len(run_starts) else len(romans)
            stem_search_start = tight_ends[start_idx - 1] if start_idx > 0 else 0
            run_stem = letter_text[stem_search_start:romans[start_idx].start()].strip()
            keep_run_stem = len(run_stem) > _MIN_STEM_LEN
            group_prefix = f'{run_idx + 1}-' if len(run_starts) > 1 else ''

            for ri in range(start_idx, end_idx):
                rm = romans[ri]
                roman_text  = letter_text[rm.start():tight_ends[ri]].strip()
                roman_label = rm.group(1).strip('()')

                content = roman_text
                if keep_run_stem:
                    content = run_stem + '\n\n' + content
                if keep_outer:
                    content = outer_stem + '\n\n' + content
                pieces.append((content, f'{letter_label}-{group_prefix}{roman_label}'))

    return pieces, overall_total


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
    # `\n` after `.*?` requires a line after this one — fails to match when
    # it's literally the last line of the document (the last question has
    # nothing trailing it), letting the footer leak into the stored content.
    # `\n|$` covers both cases.
    cleaned = re.sub(r'This question paper consists of.*?(?:\n|$)', '', cleaned, flags=re.IGNORECASE)
    # NOTE: a rule used to live here stripping any standalone "(N marks)"
    # line entirely — removed. It was deleting real per-sub-question marks
    # annotations, not noise: when a "(2 marks)" annotation happens to wrap
    # onto its own line (common after OCR), the rule deleted it outright.
    # Verified against real output: almost every sub-question's marks had
    # vanished this way; the one that survived only did because it was
    # *also* garbled ("(2" misread as "-"), which incidentally dodged the
    # pattern. The actual redundant marks line ([Total: N marks]) is already
    # handled above and doesn't need this second, overly broad rule.
    #
    # This one IS safe, unlike the rule above: split_subquestions_deep()
    # now structurally guarantees each stored piece's own "(N marks)" (or
    # "(N + M marks)") annotation sits right at the end of its content (its
    # tight_end cuts right after that annotation) — so anchoring this strip
    # to end-of-string specifically (not "any line, anywhere") can't repeat
    # the old bug of eating an annotation that happens to be mid-content.
    # Added because the marks value is now also shown in its own UI card —
    # leaving it duplicated inline as well as in the card read as cluttered.
    cleaned = re.sub(r'\(\s*\d+(?:\s*\+\s*\d+)*\s*marks?\s*\)\.?\s*$', '', cleaned, flags=re.IGNORECASE)
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
