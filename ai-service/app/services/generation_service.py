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


def generate_full_paper(request) -> list:
    """
    Orchestrate a full exam paper generation by sub-dividing total marks 
    into topics and querying the ML model for each sub-question.
    """
    _load_model()
    import torch
    import random
    
    subject = request.subject
    total_marks = request.total_marks
    topics = request.topics if request.topics else ["General"]
    
    num_topics = len(topics)
    marks_per_topic = total_marks // num_topics
    remainder = total_marks % num_topics
    
    paper_structure = []
    part_letters = ['a.', 'b.', 'c.', 'd.', 'e.']
    roman_numerals = ['(i)', '(ii)', '(iii)', '(iv)', '(v)', '(vi)', '(vii)']
    
    for idx, topic in enumerate(topics):
        # Distribute any remainder marks to the first few topics
        section_marks = marks_per_topic + (1 if idx < remainder else 0)
        
        # Split section into 2 top-level parts (e.g. a. 12 marks, b. 13 marks)
        part_a_marks = section_marks // 2
        part_b_marks = section_marks - part_a_marks
        parts_marks = [part_a_marks, part_b_marks]
        
        section_parts = []
        for p_idx, p_marks in enumerate(parts_marks):
            if p_marks <= 0: continue
            
            # Sub-divide into roman numeral sub-questions using buckets
            sub_configs = []
            remaining = p_marks
            while remaining > 0:
                if remaining <= 3:
                    marks = remaining
                else:
                    marks = random.randint(2, min(10, remaining))
                    # Prevent leaving a 1-mark remainder
                    if remaining - marks == 1:
                        marks -= 1
                        if marks < 2: marks = remaining
                
                diff = "Easy" if marks <= 3 else ("Medium" if marks <= 6 else "Hard")
                sub_configs.append({"marks": marks, "difficulty": diff})
                remaining -= marks
                
            sub_questions = []
            for r_idx, config in enumerate(sub_configs):
                marks = config["marks"]
                diff = config["difficulty"]
                
                prompt = f"Generate a {diff} {marks}-mark {subject} question about {topic}.".strip()
                inputs = _tokenizer(prompt, return_tensors="pt", max_length=128, truncation=True)
                
                with torch.no_grad():
                    outputs = _model.generate(
                        inputs.input_ids,
                        max_length=256,
                        num_return_sequences=1,
                        do_sample=True,
                        temperature=0.8,
                        top_p=0.9,
                        early_stopping=True,
                        no_repeat_ngram_size=2
                    )
                
                q_text = _tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
                
                sub_questions.append({
                    "numeral": roman_numerals[r_idx] if r_idx < len(roman_numerals) else f"({r_idx+1})",
                    "difficulty": diff,
                    "marks": marks,
                    "question_text": q_text
                })
                
            section_parts.append({
                "part": part_letters[p_idx],
                "part_total_marks": p_marks,
                "sub_questions": sub_questions
            })
            
        paper_structure.append({
            "question_number": idx + 1,
            "topic": topic,
            "section_marks": section_marks,
            "parts": section_parts
        })
        
    return paper_structure
