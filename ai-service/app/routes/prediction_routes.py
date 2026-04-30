from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from app.services.prediction_service import predict_topics

router = APIRouter()


class PredictRequest(BaseModel):
    subject: str
    year: int = 2025


class TopicPrediction(BaseModel):
    topic: str
    confidence: float
    predicted_next_year: bool = True


class PredictResponse(BaseModel):
    subject: str
    predictions: List[TopicPrediction]


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
