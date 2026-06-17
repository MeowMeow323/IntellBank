"""
Generation Service – core AI question and solution generation logic.

The model will be lazily loaded on first request to avoid startup delay.
"""

import os
from typing import List, Optional
from dotenv import load_dotenv

load_dotenv()

MODEL_PATH = os.getenv("HUGGINGFACE_MODEL_PATH", "./app/models/question_generator/flan-t5-intellbank")

# === Lazy model loader ========================================================
_model = None
_tokenizer = None


def _load_model():
    """
    Load the fine-tuned FLAN-T5-small model from disk.
    """
    global _model, _tokenizer
    if _model is not None and _tokenizer is not None:
        return

    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(
            f"Model not found at {MODEL_PATH}. "
            "Please run: python app/training/train_question_generator.py"
        )
        
    print(f"Loading AI Model from {MODEL_PATH} into memory...")
    _tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
    _model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_PATH)
    _model.eval()


def generate_questions(request) -> List[str]:
    """
    Generate questions using the fine-tuned FLAN-T5-small model.

    Args:
        request: QuestionGenerateRequest with subject, topic, difficulty, count

    Returns:
        List of generated question strings
    """
    _load_model()
    import torch
    
    subject = request.subject
    topic = request.topic or "General"
    difficulty = request.difficulty
    
    marks_str = ""
    # Optional logic if your API includes marks
    # if hasattr(request, 'marks') and request.marks:
    #     marks_str = f"{request.marks}-mark "

    prompt = f"Generate a {difficulty} {marks_str}{subject} question about {topic}.".strip()
    
    # pyrefly: ignore [not-callable]
    inputs = _tokenizer(prompt, return_tensors="pt", max_length=128, truncation=True)
    
    with torch.no_grad():
        # pyrefly: ignore [missing-attribute]
        outputs = _model.generate(
            inputs.input_ids,
            max_length=256,
            num_return_sequences=request.count,
            num_beams=max(4, request.count),  # Ensure enough beams for unique sequences
            early_stopping=True,
            no_repeat_ngram_size=2
        )
        
    # pyrefly: ignore [missing-attribute]
    questions = [_tokenizer.decode(o, skip_special_tokens=True).strip() for o in outputs]
    return questions


def generate_solution(question_text: str) -> str:
    """
    Generate a model solution for a question.
    """
    _load_model()
    import torch
    
    # Prefix for solution generation if your model expects one
    prompt = f"Provide the solution for: {question_text}"
    
    # pyrefly: ignore [not-callable]
    inputs = _tokenizer(prompt, return_tensors="pt", max_length=256, truncation=True)
    
    with torch.no_grad():
        # pyrefly: ignore [missing-attribute]
        outputs = _model.generate(
            inputs.input_ids,
            max_length=512,
            num_beams=4,
            early_stopping=True
        )
        
    # pyrefly: ignore [missing-attribute]
    solution = _tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
    return solution


def generate_full_paper(request) -> dict:
    """
    Fetch questions from Supabase and strictly format them into the requested Markdown template.
    Returns a dict with {"markdown_content": str} or {"error": str}.
    """
    from .db_service import fetch_questions_for_topics
    
    subject = request.subject
    topics = request.topics if request.topics else []
    
    if not subject or not topics:
        return {"error": "INVALID_INPUT"}
        
    # Fetch exactly 4 questions
    questions = fetch_questions_for_topics(subject, topics, limit=4)
    
    if len(questions) != 4:
        return {"error": "INVALID_INPUT"}
        
    # Build strict markdown
    lines = []
    lines.append("[METADATA_START]")
    lines.append(f"SUBJECT: {subject}")
    lines.append(f"ALL_TOPICS: {', '.join(topics)}")
    lines.append("TOTAL_MARKS: 100")
    lines.append("[METADATA_END]")
    lines.append("")
    lines.append(f"# {subject} Examination Paper")
    lines.append("")
    lines.append("### Total Marks: 100 Marks (25 Marks per Question)")
    lines.append("")
    
    for i, q in enumerate(questions):
        lines.append("---")
        lines.append("")
        lines.append(f"## Question {i + 1} (25 Marks)")
        lines.append("")
        lines.append(f"TOPICS: {', '.join(q['topics'])}")
        lines.append(q['text'])
        lines.append("")
        
    lines.append("---")
    
    return {"markdown_content": "\n".join(lines)}

