from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.classification_service import classify_question

router = APIRouter()


class ClassifyRequest(BaseModel):
    question_text: str


class ClassifyResponse(BaseModel):
    subject: str
    topic: str
    confidence: float


@router.post("/question", response_model=ClassifyResponse)
async def classify(request: ClassifyRequest):
    """
    Classify a question into a subject and topic category.
    Uses keyword matching initially; can upgrade to zero-shot classification.
    """
    try:
        result = classify_question(request.question_text)
        return ClassifyResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")
