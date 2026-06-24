"""
Cloud Solution Service – generates model answers for past-year paper questions
using Google Gemini 2.5 Flash Lite.

One generate_content() call per question, run in parallel via ThreadPoolExecutor
(max 3 workers) so the whole paper finishes quickly without hitting batch limits.
"""

import json
import os
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "You are an expert academic evaluator and exam marking scheme writer. "
    "Generate model answers that are accurate, mark-aligned, and suitable "
    "for Malaysian higher education computing and information technology programmes."
)


def _marks_instruction(marks: int) -> str:
    if marks <= 2:
        return "concise answer (1-2 key points)"
    if marks <= 6:
        return f"{marks} distinct key points, one per mark, in a numbered list"
    return f"structured sections with enough depth to justify all {marks} marks; show full working for calculations"


def _build_prompt(question_text: str, subject: str, topic: str, marks: int) -> str:
    return f"""Generate a model answer for the following exam question.

### Metadata
- **Subject:** {subject}
- **Topic:** {topic}
- **Total Marks:** {marks}

### Question
{question_text}

### Instructions
Depth required: {_marks_instruction(marks)}
Use Markdown formatting. Use LaTeX (`$...$` inline, `$$...$$` block) for math.

Return a JSON object with exactly two fields:
- **content**: The complete model answer a student should write to earn full marks.
- **explanation**: Marking criteria — what earns marks and common mistakes to avoid."""


def _call_gemini(client, question: dict) -> dict:
    """Single unary generate_content() call for one question."""
    from google.genai import types

    qid   = question.get("question_id", "")
    text  = question.get("text", "").strip()
    marks = int(question.get("marks") or 5)

    prompt = _build_prompt(
        text,
        question.get("subject", "General"),
        question.get("topic", "General"),
        marks,
    )

    response = client.models.generate_content(
        model="gemini-3.1-flash-lite",
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=_SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {
                    "content":     {"type": "STRING"},
                    "explanation": {"type": "STRING"},
                },
                "required": ["content", "explanation"],
            },
            temperature=0.3,
        ),
    )

    result = json.loads(response.text)
    return {
        "question_id": qid,
        "content":     result.get("content", ""),
        "explanation": result.get("explanation", ""),
        "error":       None,
    }


def generate_pyp_solutions_batch(questions: list) -> list:
    """
    Generate solutions for a list of questions using one unary generate_content()
    call per question, running up to 3 in parallel.

    Each input dict must have:
        question_id, text, subject, topic, marks

    Returns a list of:
        {"question_id": str, "content": str, "explanation": str, "error": str|None}
    """
    from google import genai

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set in the environment.")

    client = genai.Client(api_key=api_key)

    valid   = [q for q in questions if q.get("text", "").strip()]
    skipped = [
        {"question_id": q.get("question_id", ""), "content": None,
         "explanation": None, "error": "Empty question text"}
        for q in questions if not q.get("text", "").strip()
    ]

    if not valid:
        return skipped

    logger.info("Generating solutions for %d questions (parallel, max 3 workers)", len(valid))

    results_map = {}

    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(_call_gemini, client, q): q for q in valid}
        for future in as_completed(futures):
            q = futures[future]
            qid = q.get("question_id", "")
            try:
                results_map[qid] = future.result()
            except Exception as e:
                logger.warning("Solution generation failed for question %s: %s", qid, e)
                results_map[qid] = {
                    "question_id": qid,
                    "content":     None,
                    "explanation": None,
                    "error":       str(e),
                }

    # Return in original order
    results = [results_map[q.get("question_id", "")] for q in valid if q.get("question_id") in results_map]
    return skipped + results
