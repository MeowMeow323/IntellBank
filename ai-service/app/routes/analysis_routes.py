from fastapi import APIRouter, HTTPException
from app.services.weakness_service import analyze_class_weaknesses

router = APIRouter()


@router.get("/weaknesses")
async def class_weaknesses(subject: str):
    """
    Cohort 'Class Weakness' analysis for a subject — the project's own trained model.
    Returns weakness tiers + per-topic stats, or an ineligible payload when there
    isn't enough graded data yet.
    """
    try:
        return analyze_class_weaknesses(subject)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Weakness analysis failed: {str(e)}")
