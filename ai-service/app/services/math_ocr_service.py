"""
math_ocr_service.py
====================
Local math-equation OCR via pix2tex (LaTeX-OCR). Equation-region detection is
a heuristic over plain Tesseract output for a line — there's no trained
layout model here, so this will both miss some equations and occasionally
flag prose as math. Treat it as best-effort; calibrate against real past
papers with known equations before relying on it.
"""

import re
import numpy as np

_latex_model = None

# NOTE: "°" was here and caused real harm — temperature/angle word problems
# ("...maximum daily temperatures (in °C) over a 21-day period...") contain
# it constantly in plain prose, and one symbol was enough to send the whole
# sentence through pix2tex, which hallucinated nonsense LaTeX trying to
# parse English as math. Removed; see the length cap below for the same
# class of problem with any remaining symbol here.
_MATH_SYMBOLS = set("∫Σ√±≤≥÷×πθΔ∞∂≈≠²³½¼¾∝∑∏√∫")

# A generic math symbol appearing in an otherwise-long line is more likely
# incidental (a unit, a stray OCR artifact) than "this whole line is an
# equation" — real equations are short notation, not full sentences. The
# pattern-based checks below stay at the looser 120-char cap since they're
# more structurally specific and less likely to misfire on prose.
_SYMBOL_TRIGGER_MAX_LEN = 60

_MATH_PATTERNS = [
    re.compile(r'd\s*[a-zA-Z]\s*/\s*d\s*[a-zA-Z]'),     # dy/dx, d2y/dx2
    re.compile(r'[a-zA-Z0-9]\s*\^\s*[a-zA-Z0-9]'),       # x^2
    re.compile(r'[a-zA-Z]\s*_\s*[a-zA-Z0-9]'),           # subscript: a_1
    re.compile(r'\\[a-zA-Z]+'),                          # stray LaTeX-ish commands Tesseract preserved
    re.compile(r'[a-zA-Z]\([a-zA-Z]\)\s*='),             # f(x) =
    # Statistics function notation: P(...), E(...), Var(...) — this exact
    # shape (capital letter immediately followed by an open paren and a
    # variable/number) doesn't occur in ordinary prose. Added because lines
    # like "P(X=x) = c(x^2+1)" and "E[(2A+3)]^2" were going through plain
    # text OCR instead of pix2tex, silently losing exponents/superscripts
    # pix2tex (a math-specific model) would have a better shot at keeping.
    re.compile(r'\b(P|E|Var)\([A-Za-z0-9]'),
]


def is_equation_candidate(line_text: str) -> bool:
    """
    Heuristic flag for "this line is probably a math equation, not prose."
    Only the specific signals below — known math unicode symbols and
    recognisable equation patterns (dy/dx, x^2, f(x)=, etc.).

    A third signal used to live here too: "high ratio of symbol/junk
    characters to letters" as a proxy for "Tesseract is garbling dense math
    glyphs". Removed after a real paper showed it backfiring badly — garbled
    OCR on ordinary prose and numeric data tables *also* produces a lot of
    stray punctuation relative to clean letters, so it was sending whole
    sentences and data rows through pix2tex (a math-OCR model), which then
    hallucinates nonsense LaTeX for non-math text. Under-detecting a few
    real equations is a smaller problem than corrupting prose.
    """
    text = line_text.strip()
    if not text or len(text) > 120:
        return False  # equations on exam pages are short; long lines are prose

    if len(text) <= _SYMBOL_TRIGGER_MAX_LEN and any(ch in _MATH_SYMBOLS for ch in text):
        return True

    if any(p.search(text) for p in _MATH_PATTERNS):
        return True

    return False


def _load_latex_model():
    global _latex_model
    if _latex_model is not None:
        return _latex_model

    from pix2tex.cli import LatexOCR
    print("Loading pix2tex LaTeX-OCR model...")
    _latex_model = LatexOCR()
    return _latex_model


def ocr_equation_region(line_img: np.ndarray) -> str:
    """Runs pix2tex on a cropped line image, returns a LaTeX string (no $ wrapping)."""
    if line_img is None or line_img.size == 0:
        return ""
    from PIL import Image

    try:
        model = _load_latex_model()
        latex = model(Image.fromarray(line_img))
        return latex.strip() if latex else ""
    except Exception as e:
        print(f"  [WARN] pix2tex failed on equation region: {e}")
        return ""
