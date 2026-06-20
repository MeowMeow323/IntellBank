"""
spellcheck_service.py
======================
Lightweight, non-LLM spell correction for OCR'd question text — dictionary
lookups only (pyspellchecker), no model inference. Deliberately conservative:
only corrects words that are (a) outside structured/code content, (b) not
all-caps (acronyms like ITSM/CIS/AIS), and (c) long enough that a 1-2
edit-distance "fix" is unlikely to be a coincidence.

This trades correction power for safety — it won't catch grammar-level
issues, but it also won't hallucinate a "fix" the way a generative model
could. Even so, a first real-data test against this caught it doing genuine
harm: "refactoring" -> "factoring" (a real word, wrong one — pyspellchecker's
default dictionary doesn't know CS jargon) and mangling identifiers inside a
code sample ("println" -> "print", "num1" -> "numb"). Hence the code-paragraph
skip and domain/British-spelling allowlist below — both added after that
failure, not preemptively.
"""

import re

_checker = None

# Tables/diagrams/math aren't prose — never spellcheck inside them.
SKIP_SPAN_RE = re.compile(
    r'\[TABLE\][\s\S]*?\[/TABLE\]'
    r'|\[DIAGRAM:[^\]]*\]'
    r'|\$\$[\s\S]*?\$\$'
    r'|\$[^$\n]*\$'
)

WORD_RE = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")

MIN_WORD_LEN = 4

# Same heuristic used on the frontend (QuestionContent.jsx) to spot code
# listings — applied here too so code identifiers never get "corrected".
_CODE_LINE_RE = re.compile(
    r'[{};]|^\s*(if|else|for|while|int|float|double|class|public|private|function|def|return)\b|Scanner|System\.(out|in)',
    re.IGNORECASE
)

# Words a general English dictionary doesn't know but are correct here —
# mainly CS/software-engineering jargon (these papers are from a Malaysian/
# UK-style university, so British spelling is also common — handled
# separately below via suffix patterns rather than enumerated here, since a
# word list will always miss the next one). Extend as new false positives
# show up; this isn't meant to be exhaustive on day one.
_KNOWN_EXTRA_WORDS = [
    'refactoring', 'refactored', 'reengineering', 'scalability', 'maintainability',
    'traceability', 'deployable', 'microservices', 'serverless', 'containerization',
    'virtualization', 'middleware', 'polymorphism', 'encapsulation', 'instantiate',
    'instantiation', 'asynchronous', 'multithreading', 'idempotent', 'deprecated',
    'namespace', 'boolean', 'runtime', 'backend', 'frontend', 'fullstack', 'codebase',
    'repository', 'changelog', 'rollback', 'throughput', 'latency', 'bytecode',
    'stakeholders', 'prototyping',
]

# British -> American suffix patterns. A first pass only allowlisted specific
# words ('analyse', 'colour', ...) and still missed real ones on the very
# next paper ('neighbouring', 'categorised', 'utilising'). Checking the
# *pattern* instead: if swapping a word's suffix to the American form yields
# a word the dictionary knows, the original British spelling is treated as
# known too, so it's never "corrected" to American in the first place.
_BRITISH_SUFFIX_SUBS = [
    # "-ising" drops the silent "e" before "-ing" (utilise -> utilising),
    # so it needs its own pattern rather than ise(d|s|ing)? — that would
    # require the impossible "utiliseing" and silently fail to match.
    (re.compile(r'ised$'), lambda m: 'ized'),
    (re.compile(r'ises$'), lambda m: 'izes'),
    (re.compile(r'ising$'), lambda m: 'izing'),
    (re.compile(r'ise$'), lambda m: 'ize'),
    # "-yse" (analyse, paralyse, catalyse) -> "-yze" — a "y" not "i" before
    # "se", so it's a distinct pattern from the -ise/-ize group above.
    (re.compile(r'ysed$'), lambda m: 'yzed'),
    (re.compile(r'yses$'), lambda m: 'yzes'),
    (re.compile(r'ysing$'), lambda m: 'yzing'),
    (re.compile(r'yse$'), lambda m: 'yze'),
    (re.compile(r'isation(s)?$'), lambda m: 'ization' + (m.group(1) or '')),
    (re.compile(r'our(ing|ed|s)?$'), lambda m: 'or' + (m.group(1) or '')),
    (re.compile(r're$'), lambda m: 'er'),
    (re.compile(r'ogue$'), lambda m: 'og'),
    (re.compile(r'ence$'), lambda m: 'ense'),
    (re.compile(r'lling$'), lambda m: 'ling'),
    (re.compile(r'lled$'), lambda m: 'led'),
]


def _has_known_spelling_variant(lower: str, checker) -> bool:
    for pattern, repl in _BRITISH_SUFFIX_SUBS:
        variant = pattern.sub(repl, lower)
        if variant != lower and not checker.unknown([variant]):
            return True
    return False


def _looks_like_code(paragraph: str) -> bool:
    lines = [l for l in paragraph.split('\n') if l.strip()]
    if len(lines) < 2:
        return False
    hits = sum(1 for l in lines if _CODE_LINE_RE.search(l))
    return hits / len(lines) >= 0.4


def _get_checker():
    global _checker
    if _checker is None:
        from spellchecker import SpellChecker
        _checker = SpellChecker()
        _checker.word_frequency.load_words(_KNOWN_EXTRA_WORDS)
    return _checker


def _correct_word(word: str) -> str:
    if len(word) < MIN_WORD_LEN or word.isupper():
        return word

    checker = _get_checker()
    lower = word.lower()
    if not checker.unknown([lower]):
        return word

    if _has_known_spelling_variant(lower, checker):
        return word  # likely valid British spelling — leave it alone

    correction = checker.correction(lower)
    if not correction or correction == lower:
        return word

    return correction.capitalize() if word[0].isupper() else correction


def _correct_segment(segment: str) -> str:
    paragraphs = segment.split('\n\n')
    corrected = [
        p if _looks_like_code(p) else WORD_RE.sub(lambda m: _correct_word(m.group()), p)
        for p in paragraphs
    ]
    return '\n\n'.join(corrected)


def spellcheck_text(text: str) -> str:
    """
    Corrects obviously-misspelled prose words while leaving tables, math,
    diagram markers, code listings, acronyms, and short/ambiguous tokens
    untouched.
    """
    result = []
    last = 0
    for m in SKIP_SPAN_RE.finditer(text):
        result.append(_correct_segment(text[last:m.start()]))
        result.append(m.group())
        last = m.end()
    result.append(_correct_segment(text[last:]))
    return ''.join(result)
