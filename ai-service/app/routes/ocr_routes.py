from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.ocr_service import extract_text_from_document

router = APIRouter()


class OcrRequest(BaseModel):
    storage_path: str
    file_type: str = "application/pdf"


class OcrResponse(BaseModel):
    text: str
    pages: int = 0
    success: bool


@router.post("/extract", response_model=OcrResponse)
async def extract_text(request: OcrRequest):
    """
    Extract text from a document (PDF or image) located at the given storage path.
    Spring Boot calls this after a document is uploaded to Supabase Storage.
    """
    try:
        result = extract_text_from_document(request.storage_path, request.file_type)
        return OcrResponse(text=result["text"], pages=result.get("pages", 0), success=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR extraction failed: {str(e)}")
