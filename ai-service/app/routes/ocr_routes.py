import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services import ocr_service, mineru_ocr_service, db_service, paper_processing_service, job_queue_service

router = APIRouter()


class ExtractRequest(BaseModel):
    storage_path: str
    file_type: str = "application/pdf"


class ExtractResponse(BaseModel):
    text: str


class ProcessPaperRequest(BaseModel):
    pyp_id: str


class ProcessPaperResponse(BaseModel):
    status: str
    questions_inserted: int
    error: Optional[str] = None


@router.post("/extract", response_model=ExtractResponse)
async def extract_text(request: ExtractRequest):
    """
    Generic single-document OCR text extraction.
    Matches the existing Java contract: AiClientService.extractText().
    """
    config = ocr_service.load_config()
    pdf_url = ocr_service.build_url(
        config["supabase_project_url"], config["supabase_bucket"], request.storage_path
    )

    pdf_path = None
    try:
        pdf_path = ocr_service.download_pdf(pdf_url)
        text     = mineru_ocr_service.run_ocr_via_mineru(pdf_path, pyp_id='extract')
        return ExtractResponse(text=text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR extraction failed: {str(e)}")
    finally:
        ocr_service.cleanup(pdf_path)


@router.post("/process-paper", response_model=ProcessPaperResponse)
async def process_paper(request: ProcessPaperRequest):
    """
    Queues the full OCR -> parse -> classify -> store pipeline for one
    past_year_papers row and returns immediately — the actual work runs on
    job_queue_service's bounded background executor, independent of this
    HTTP request's lifetime, so it keeps running even if the caller
    disconnects (tab change, navigation, etc). Poll
    GET /process-paper/{pyp_id}/progress for live status.
    """
    conn = db_service.get_db_connection()
    try:
        paper = paper_processing_service.fetch_paper_by_id(conn, request.pyp_id)
    finally:
        conn.close()
    if paper is None:
        raise HTTPException(status_code=404, detail="Past year paper not found")

    config = ocr_service.load_config()
    env = {"SUPABASE_SERVICE_KEY": os.getenv("SUPABASE_SERVICE_KEY", "")}
    pyp_id = request.pyp_id

    def run():
        job_conn = db_service.get_db_connection()
        try:
            def on_progress(step, total, label):
                job_queue_service.set_progress(
                    pyp_id, status="PROCESSING", step=step, total_steps=total, label=label
                )

            inserted = paper_processing_service.process_paper(job_conn, paper, config, env, on_progress)
            status = "PROCESSED" if inserted > 0 else "FAILED"
            paper_processing_service.update_status(job_conn, pyp_id, status)
            job_queue_service.set_progress(pyp_id, status=status, questions_inserted=inserted)
        except Exception as e:
            job_conn.rollback()
            paper_processing_service.update_status(job_conn, pyp_id, "FAILED")
            job_queue_service.set_progress(pyp_id, status="FAILED", error=str(e))
        finally:
            job_conn.close()

    job_queue_service.submit_job(pyp_id, run)
    return ProcessPaperResponse(status="QUEUED", questions_inserted=0)


@router.get("/process-paper/{pyp_id}/progress")
async def get_process_paper_progress(pyp_id: str):
    """Live status/step for a queued or running process-paper job. Returns
    a default UPLOADED-shaped entry if the paper was never (re)triggered
    since the ai-service last started."""
    progress = job_queue_service.get_progress(pyp_id)
    if progress is None:
        return {"status": "UPLOADED", "step": 0, "total_steps": paper_processing_service.TOTAL_STEPS,
                "label": "", "questions_inserted": None, "error": None}
    return progress
