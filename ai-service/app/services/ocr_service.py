"""
OCR Service – extracts text from PDF or image documents.

Uses:
- PyMuPDF (fitz) for PDF text extraction
- pytesseract for image-based OCR (requires Tesseract installed on the system)
"""

import os
from typing import Dict, Any


def extract_text_from_document(storage_path: str, file_type: str) -> Dict[str, Any]:
    """
    Extract text from a document at the given storage path.

    Args:
        storage_path: Local path or Supabase storage path to the file.
                      TODO: If using Supabase Storage, download the file first
                            using the Supabase Python client.
        file_type: MIME type e.g. 'application/pdf', 'image/png'

    Returns:
        Dict with 'text' and 'pages' keys
    """

    # TODO: If storage_path is a Supabase path, download to temp dir first:
    # from supabase import create_client
    # supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    # data = supabase.storage.from_("documents").download(storage_path)
    # local_path = f"/tmp/{os.path.basename(storage_path)}"
    # with open(local_path, "wb") as f:
    #     f.write(data)

    local_path = storage_path  # placeholder

    if file_type == "application/pdf" or storage_path.endswith(".pdf"):
        return _extract_from_pdf(local_path)
    elif file_type.startswith("image/") or any(
        storage_path.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".tiff"]
    ):
        return _extract_from_image(local_path)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")


def _extract_from_pdf(path: str) -> Dict[str, Any]:
    """Extract text from PDF using PyMuPDF."""
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(path)
        full_text = ""
        for page in doc:
            full_text += page.get_text()
        return {"text": full_text.strip(), "pages": len(doc)}
    except ImportError:
        # Graceful fallback if PyMuPDF not installed
        return {"text": f"[PDF text extraction placeholder – PyMuPDF not installed] Path: {path}", "pages": 0}
    except Exception as e:
        raise RuntimeError(f"PDF extraction error: {str(e)}")


def _extract_from_image(path: str) -> Dict[str, Any]:
    """Extract text from image using pytesseract OCR."""
    try:
        from PIL import Image
        import pytesseract

        image = Image.open(path)
        text = pytesseract.image_to_string(image)
        return {"text": text.strip(), "pages": 1}
    except ImportError:
        return {"text": f"[Image OCR placeholder – pytesseract not installed] Path: {path}", "pages": 0}
    except Exception as e:
        raise RuntimeError(f"Image OCR error: {str(e)}")
