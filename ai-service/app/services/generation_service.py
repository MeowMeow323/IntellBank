"""
Generation Service – core AI question and solution generation logic.

TODO: Load your fine-tuned FLAN-T5-small model from the path set in .env.
      After training (run app/training/train_question_generator.py),
      set HUGGINGFACE_MODEL_PATH=./app/models/question_generator in .env.

The model will be lazily loaded on first request to avoid startup delay.
"""

import os
from typing import List, Optional
from dotenv import load_dotenv

load_dotenv()

MODEL_PATH = os.getenv("HUGGINGFACE_MODEL_PATH", "./app/models/question_generator")

# ── Lazy model loader ──────────────────────────────────────────────────────────
_model = None
_tokenizer = None


def _load_model():
    """
    Load the fine-tuned FLAN-T5-small model from disk.
    TODO: Uncomment and implement after you have trained the model.
    """
    global _model, _tokenizer

    # TODO: Implement model loading once training is complete
    # from transformers import T5ForConditionalGeneration, T5Tokenizer
    # if not os.path.exists(MODEL_PATH):
    #     raise FileNotFoundError(
    #         f"Model not found at {MODEL_PATH}. "
    #         "Please run: python app/training/train_question_generator.py"
    #     )
    # _tokenizer = T5Tokenizer.from_pretrained(MODEL_PATH)
    # _model = T5ForConditionalGeneration.from_pretrained(MODEL_PATH)
    # _model.eval()

    pass  # Remove this when implementing


def generate_questions(request) -> List[str]:
    """
    Generate questions using the fine-tuned FLAN-T5-small model.

    Args:
        request: QuestionGenerateRequest with subject, topic, difficulty, count

    Returns:
        List of generated question strings
    """
    # TODO: Replace dummy generation with actual model inference once trained.
    # Example implementation after model is loaded:
    #
    # _load_model()
    # prompt = f"generate question: subject: {request.subject} topic: {request.topic} difficulty: {request.difficulty}"
    # inputs = _tokenizer(prompt, return_tensors="pt", max_length=512, truncation=True)
    # with torch.no_grad():
    #     outputs = _model.generate(
    #         inputs.input_ids,
    #         max_length=128,
    #         num_return_sequences=request.count,
    #         num_beams=request.count,
    #         early_stopping=True
    #     )
    # questions = [_tokenizer.decode(o, skip_special_tokens=True) for o in outputs]
    # return questions

    # ── DUMMY RESPONSES (remove after model training) ──────────────────────
    subject = request.subject
    topic = request.topic or "General"
    difficulty = request.difficulty

    dummy_templates = [
        f"[{difficulty}] Explain the concept of {topic} in {subject} with a suitable example.",
        f"[{difficulty}] What are the key principles governing {topic} in {subject}?",
        f"[{difficulty}] Describe the relationship between {topic} and its applications in {subject}.",
        f"[{difficulty}] Analyze how {topic} influences outcomes in {subject}.",
        f"[{difficulty}] Compare and contrast two aspects of {topic} in the context of {subject}.",
    ]
    return dummy_templates[:request.count]


def generate_solution(question_text: str) -> str:
    """
    Generate a model solution for a question.

    TODO: Replace with actual FLAN-T5-small inference after training.
    """
    # TODO: Implement actual model-based solution generation
    # _load_model()
    # prompt = f"answer: {question_text}"
    # inputs = _tokenizer(prompt, return_tensors="pt", max_length=512, truncation=True)
    # with torch.no_grad():
    #     outputs = _model.generate(inputs.input_ids, max_length=256)
    # return _tokenizer.decode(outputs[0], skip_special_tokens=True)

    # ── DUMMY RESPONSE ─────────────────────────────────────────────────────
    return (
        f"[Placeholder solution for: '{question_text[:80]}...']\n\n"
        "TODO: Train the FLAN-T5-small model and update this function "
        "to use actual model inference. See app/training/train_question_generator.py."
    )
