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
