from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.services.prediction_service import predict_topics, available_subjects

router = APIRouter()


class PredictRequest(BaseModel):
    subject: str
    year: int = 2025


class TopicPrediction(BaseModel):
    topic: str
    confidence: float
    predicted_next_year: bool = True
    frequency: Optional[int] = None
    tier: Optional[str] = None


class PredictResponse(BaseModel):
    subject: str
    predictions: List[TopicPrediction]


class PredictionSubjectsResponse(BaseModel):
    subjects: List[str]


@router.get("/subjects", response_model=PredictionSubjectsResponse)
async def prediction_subjects():
    """Subjects that actually have trained topic-prediction data."""
    return PredictionSubjectsResponse(subjects=available_subjects())


@router.post("/topics", response_model=PredictResponse)
async def predict(request: PredictRequest):
    """
    Predict which topics are most likely to appear in the next exam
    based on historical topic frequency patterns.
    """
    try:
        predictions = predict_topics(request.subject, request.year)
        return PredictResponse(subject=request.subject, predictions=predictions)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")
