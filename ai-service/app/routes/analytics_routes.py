from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.services.analytics_service import get_topic_frequency, get_subject_trend, get_subject_papers

router = APIRouter()


@router.get("/topic-frequency")
async def topic_frequency(
    subject: str = Query(..., description="Subject name"),
    limit: Optional[int] = Query(None, description="Restrict to N most recently uploaded past papers (omit for all)"),
):
    """
    Per-topic question count and difficulty distribution for a subject.
    Pass limit=N to restrict analysis to the N most recently uploaded past-year papers.
    """
    try:
        return get_topic_frequency(subject, paper_limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analytics failed: {str(e)}")


@router.get("/subject-trend")
async def subject_trend(
    subject: str = Query(..., description="Subject name"),
    limit: Optional[int] = Query(None, description="Restrict to N most recently uploaded past papers (omit for all)"),
):
    """
    Year-by-year topic coverage for a subject, derived from past-year-paper upload dates.
    Pass limit=N to restrict to the N most recently uploaded papers.
    """
    try:
        return get_subject_trend(subject, paper_limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Trend analysis failed: {str(e)}")


@router.get("/papers")
async def subject_papers(subject: str = Query(..., description="Subject name")):
    """
    All past-year papers that have questions tagged to this subject.
    Used to populate the exam-session list on the Subject Analysis page.
    """
    try:
        return get_subject_papers(subject)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Papers lookup failed: {str(e)}")
