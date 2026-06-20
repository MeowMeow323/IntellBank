"""
doctr_ocr_service.py
=====================
Local docTR OCR (PyTorch backend — already a dependency via transformers/
pix2tex, no new framework) used in place of Tesseract for the plain-text
recognition pass. Verified directly against real exam-paper content that
Tesseract (even tessdata_best) struggled with: docTR read a piecewise
equation as "c(x +1)" where Tesseract produced pure noise, and got several
single-letter variable names right (M/N) where Tesseract substituted a
different letter. Real but acceptable speed cost — ~3-4s/page once the
model is loaded (model load itself is a one-time ~15s cost, same lazy-load
pattern as the other local models in this service).

Table-cell OCR (ocr_cell/ocr_table_to_markdown in ocr_service.py) stays on
Tesseract — it's already specifically tuned for tiny isolated digit/text
crops via whitelist + rescue passes, a different problem from whole-page
text recognition, and not what was actually broken.
"""

import numpy as np

_model = None

CONFIDENCE_THRESHOLD = 0.6  # same bar as the old Tesseract conf>=60 check, on docTR's 0-1 scale


def _load_model():
    global _model
    if _model is not None:
        return _model
    from doctr.models import ocr_predictor
    print("Loading docTR OCR model...")
    _model = ocr_predictor(pretrained=True)
    return _model


def extract_lines(pil_img) -> list[dict]:
    """
    Runs docTR on a page/region image and returns per-line dicts shaped like
    {top, bottom, left, right, text, confident} in pixel coordinates —
    confident is the count of high-confidence words in the line. This is the
    same shape the old Tesseract-based line grouping produced, so the
    diagram-band detection and math-line substitution built on top of it
    didn't need to be rewritten, just pointed at a different data source.
    """
    model = _load_model()
    width, height = pil_img.size
    img_array = np.array(pil_img.convert('RGB'))

    result = model([img_array])

    lines = []
    for page in result.pages:
        for block in page.blocks:
            for line in block.lines:
                if not line.words:
                    continue
                x0s = [w.geometry[0][0] for w in line.words]
                y0s = [w.geometry[0][1] for w in line.words]
                x1s = [w.geometry[1][0] for w in line.words]
                y1s = [w.geometry[1][1] for w in line.words]
                left   = min(x0s) * width
                top    = min(y0s) * height
                right  = max(x1s) * width
                bottom = max(y1s) * height
                confident = sum(1 for w in line.words if w.confidence >= CONFIDENCE_THRESHOLD)
                text = ' '.join(w.value for w in line.words)
                lines.append({
                    'top': top, 'bottom': bottom, 'left': left, 'right': right,
                    'confident': confident, 'text': text,
                })
    return lines
