from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.ocr_service import extract_text_from_document, parse_questions_from_text

router = APIRouter()


class OcrRequest(BaseModel):
    storage_path: str
    file_type: str = "application/pdf"


class OcrResponse(BaseModel):
    text: str
    pages: int = 0
    success: bool
    questions: list = []   # ← add this

@router.post("/extract", response_model=OcrResponse)
async def extract_text(request: OcrRequest):
    try:
        result    = extract_text_from_document(request.storage_path, request.file_type)
        questions = parse_questions_from_text(result["text"])
        return OcrResponse(
            text=result["text"],
            pages=result.get("pages", 0),
            success=True,
            questions=questions
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR extraction failed: {str(e)}")
