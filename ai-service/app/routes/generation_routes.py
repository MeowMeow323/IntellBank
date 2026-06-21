from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from app.services.generation_service import generate_questions, generate_solution, generate_full_paper

router = APIRouter()


class QuestionGenerateRequest(BaseModel):
    subject: str
    topic: Optional[str] = None
    difficulty: str = "MEDIUM"
    count: int = 5
    context: Optional[str] = None  # Optional source context for generation


class SolutionGenerateRequest(BaseModel):
    question_text: str
    subject: Optional[str] = None
    topic: Optional[str] = None


class PaperGenerateRequest(BaseModel):
    subject: str
    total_marks: int = Field(default=100, ge=10, le=200)
    topics: List[str] = Field(default=["General"], description="List of topics to cover in the exam")
    difficulty_distribution: str = Field(default="Standard", description="Standard, Easy, or Hard bias")


class QuestionGenerateResponse(BaseModel):
    questions: List[str]
    model_used: str


class SolutionGenerateResponse(BaseModel):
    solution: str
    model_used: str


class PaperGenerateResponse(BaseModel):
    subject: str
    total_marks: int
    paper_structure: Optional[str] = None
    markdown_content: Optional[str] = None
    questions: Optional[List[Dict[str, Any]]] = None
    error: Optional[str] = None
    model_used: str


@router.post("/question", response_model=QuestionGenerateResponse)
async def generate_question_endpoint(request: QuestionGenerateRequest):
    """
    Generate questions using the fine-tuned FLAN-T5-small model.
    """
    try:
        questions = generate_questions(request)
        return QuestionGenerateResponse(questions=questions, model_used="flan-t5-small-finetuned")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Question generation failed: {str(e)}")


@router.post("/solution", response_model=SolutionGenerateResponse)
async def generate_solution_endpoint(request: SolutionGenerateRequest):
    """
    Generate a model solution for a given question.
    """
    try:
        solution = generate_solution(request.question_text)
        return SolutionGenerateResponse(solution=solution, model_used="flan-t5-small-finetuned")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Solution generation failed: {str(e)}")


@router.get("/debug")
async def debug_db(subject: str = "Software Project Management"):
    """Diagnostic: returns what's in the DB AND simulates the filter logic."""
    from app.services.db_service import get_db_connection, fetch_questions_for_topics
    from app.services.generation_service import _is_standalone_question
    from psycopg2.extras import DictCursor
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=DictCursor) as cur:
            cur.execute("SELECT subject_id, name FROM subjects ORDER BY name")
            all_subjects = [{"id": str(r["subject_id"]), "name": r["name"]} for r in cur.fetchall()]

            cur.execute("SELECT subject_id FROM subjects WHERE LOWER(name) = LOWER(%s)", (subject,))
            row = cur.fetchone()
            if not row:
                cur.execute("SELECT subject_id FROM subjects WHERE name ILIKE %s", (f'%{subject}%',))
                row = cur.fetchone()
            if not row:
                return {"all_subjects": all_subjects, "matched_subject": None, "topics": [], "question_count": 0}

            sid = row["subject_id"]
            cur.execute("SELECT name FROM topics WHERE subject_id = %s ORDER BY name", (sid,))
            topics = [r["name"] for r in cur.fetchall()]

            cur.execute("""
                SELECT COUNT(DISTINCT q.question_id) AS cnt
                FROM questions q
                JOIN question_topics qt ON q.question_id = qt.question_id
                JOIN topics t ON qt.topic_id = t.topic_id
                WHERE t.subject_id = %s
            """, (sid,))
            q_count = (cur.fetchone() or {}).get("cnt", 0)
        conn.close()

        # Simulate filter on ALL questions for this subject
        all_qs = fetch_questions_for_topics(subject, [], limit=50)
        filter_results = []
        for q in all_qs:
            text = q.get("text", "")
            first_line = text.strip().split('\n')[0][:150]
            standalone = _is_standalone_question(text)
            filter_results.append({
                "standalone": standalone,
                "first_line": first_line,
                "text_length": len(text)
            })
        standalone_count = sum(1 for r in filter_results if r["standalone"])

        return {
            "all_subjects": all_subjects,
            "matched_subject": subject,
            "topics": topics,
            "question_count": q_count,
            "fetched_count": len(all_qs),
            "standalone_count": standalone_count,
            "filter_details": filter_results
        }
    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}


@router.post("/paper", response_model=PaperGenerateResponse)
async def generate_paper_endpoint(request: PaperGenerateRequest):
    """
    Orchestrate the generation of a full, structured exam paper.
    Divides total marks into sub-questions and queries the AI model for each block.
    """
    try:
        result = generate_full_paper(request)
        if "error" in result:
            return PaperGenerateResponse(
                subject=request.subject,
                total_marks=request.total_marks,
                error=result["error"],
                model_used="db-retrieval"
            )
            
        return PaperGenerateResponse(
            subject=request.subject,
            total_marks=request.total_marks,
            markdown_content=result["markdown_content"],
            questions=result.get("questions"),
            model_used="db-retrieval"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Paper generation failed: {str(e)}")
