from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services import ocr_service, classification_service

router = APIRouter()


class ClassifyRequest(BaseModel):
    question_text: str
    subject: Optional[str] = None


class ClassifyResponse(BaseModel):
    subject: str
    topic: str
    confidence: float


@router.post("/question", response_model=ClassifyResponse)
async def classify_question(request: ClassifyRequest):
    """
    Matches the existing Java contract: AiClientService.classifyQuestion()
    (currently sends only {question_text}, no subject) — falls back to the
    pipeline's configured default_subject when none is provided.
    """
    try:
        subject = request.subject or ocr_service.load_config()["default_subject"]
        result = classification_service.classify_question(request.question_text, subject)
        return ClassifyResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")
