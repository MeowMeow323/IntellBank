from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.services.generation_service import generate_questions, generate_solution

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


class QuestionGenerateResponse(BaseModel):
    questions: List[str]
    model_used: str


class SolutionGenerateResponse(BaseModel):
    solution: str
    model_used: str


@router.post("/question", response_model=QuestionGenerateResponse)
async def generate_question_endpoint(request: QuestionGenerateRequest):
    """
    Generate questions using the fine-tuned FLAN-T5-small model.
    Returns dummy questions until the model is trained and loaded.
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
