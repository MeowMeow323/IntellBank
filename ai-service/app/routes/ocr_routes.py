import os
from fastapi import APIRouter, HTTPException, UploadFile, File
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


def _to_title_case(s: str) -> str:
    """Title-case an ALL-CAPS string (typical for exam paper headers)."""
    LOWER_WORDS = {'of', 'and', 'the', 'in', 'to', 'for', 'a', 'an', 'with', 'at', 'by', 'or'}
    words = s.lower().split()
    return ' '.join(
        w if (i > 0 and w in LOWER_WORDS) else w.capitalize()
        for i, w in enumerate(words)
    )


@router.post("/preview")
async def preview_paper_metadata(file: UploadFile = File(...)):
    """
    Lightweight OCR on cover page only — extracts course code, course name,
    and exam session for pre-filling the upload confirmation dialog.
    Uses Tesseract directly (much faster than the full MinerU pipeline) since
    we only need the structured header text, not equations or tables.
    Requires: Tesseract on PATH + pdf2image/Poppler installed.
    """
    try:
        import pytesseract
        from pdf2image import convert_from_bytes
    except ImportError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Preview OCR dependencies missing ({e}). Run: pip install pdf2image pytesseract"
        )

    # Windows: Tesseract installer puts the binary here; set explicitly so the
    # AI service doesn't depend on the process-level PATH being up to date.
    import platform
    if platform.system() == "Windows":
        import os as _os
        _win_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        if _os.path.exists(_win_path):
            pytesseract.pytesseract.tesseract_cmd = _win_path

    try:
        pdf_bytes = await file.read()
        images = convert_from_bytes(pdf_bytes, first_page=1, last_page=1, dpi=200)
        if not images:
            return {"course_code": None, "course_name": None, "exam_session": None}

        raw_text = pytesseract.image_to_string(images[0])

        course_code, course_name, exam_session = None, None, None

        detected = ocr_service.detect_subject_from_text(raw_text)
        if detected:
            course_code, raw_name = detected
            course_name = _to_title_case(raw_name) if raw_name == raw_name.upper() else raw_name

        session = ocr_service.detect_exam_session_from_text(raw_text)
        if session:
            exam_session = session

        return {
            "course_code": course_code,
            "course_name": course_name,
            "exam_session": exam_session,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preview OCR failed: {str(e)}")


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
