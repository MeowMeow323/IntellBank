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

_MATH_SYMBOLS = set("∫Σ√±≤≥÷×πθΔ∞∂≈≠°²³½¼¾∝∑∏√∫")

_MATH_PATTERNS = [
    re.compile(r'd\s*[a-zA-Z]\s*/\s*d\s*[a-zA-Z]'),     # dy/dx, d2y/dx2
    re.compile(r'[a-zA-Z0-9]\s*\^\s*[a-zA-Z0-9]'),       # x^2
    re.compile(r'[a-zA-Z]\s*_\s*[a-zA-Z0-9]'),           # subscript: a_1
    re.compile(r'\\[a-zA-Z]+'),                          # stray LaTeX-ish commands Tesseract preserved
    re.compile(r'[a-zA-Z]\([a-zA-Z]\)\s*='),             # f(x) =
]


def is_equation_candidate(line_text: str) -> bool:
    """
    Heuristic flag for "this line is probably a math equation, not prose."
    Combines: known math unicode symbols, common equation patterns, and a
    high ratio of symbol/junk characters to letters (a signal that Tesseract
    is garbling dense math glyphs into punctuation soup).
    """
    text = line_text.strip()
    if not text or len(text) > 120:
        return False  # equations on exam pages are short; long lines are prose

    if any(ch in _MATH_SYMBOLS for ch in text):
        return True

    if any(p.search(text) for p in _MATH_PATTERNS):
        return True

    letters = sum(1 for ch in text if ch.isalpha())
    symbols = sum(1 for ch in text if not ch.isalnum() and not ch.isspace())
    if len(text) >= 4 and symbols >= 3 and symbols > letters:
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
