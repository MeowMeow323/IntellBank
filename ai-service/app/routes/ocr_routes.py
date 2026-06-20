import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services import ocr_service, mineru_ocr_service, db_service, paper_processing_service

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
    Runs the full OCR -> parse -> classify -> store pipeline for one
    past_year_papers row, writing questions/question_topics directly to
    Supabase. Updates past_year_papers.status itself (Java also updates it
    from this response — harmless double-write, keeps the CLI script's
    existing behavior of owning status transitions).
    """
    conn = db_service.get_db_connection()
    try:
        paper = paper_processing_service.fetch_paper_by_id(conn, request.pyp_id)
        if paper is None:
            raise HTTPException(status_code=404, detail="Past year paper not found")

        config = ocr_service.load_config()
        env = {"SUPABASE_SERVICE_KEY": os.getenv("SUPABASE_SERVICE_KEY", "")}

        try:
            inserted = paper_processing_service.process_paper(conn, paper, config, env)
        except Exception as e:
            conn.rollback()
            paper_processing_service.update_status(conn, request.pyp_id, "FAILED")
            return ProcessPaperResponse(status="FAILED", questions_inserted=0, error=str(e))

        status = "PROCESSED" if inserted > 0 else "FAILED"
        paper_processing_service.update_status(conn, request.pyp_id, status)
        return ProcessPaperResponse(status=status, questions_inserted=inserted)
    finally:
        conn.close()
