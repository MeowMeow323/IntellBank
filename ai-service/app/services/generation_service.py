"""
Generation Service – core AI question and solution generation logic.

The model will be lazily loaded on first request to avoid startup delay.
"""

import os
import re as _re
from typing import List
from dotenv import load_dotenv

load_dotenv()

MODEL_PATH = os.getenv("HUGGINGFACE_MODEL_PATH", "./app/models/question_generator/flan-t5-intellbank")

# === Lazy model loader ========================================================
_model = None
_tokenizer = None


def _load_model():
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
    _load_model()
    import torch

    subject = request.subject
    topic = request.topic or "General"
    difficulty = request.difficulty

    prompt = f"Generate a {difficulty} {subject} question about {topic}.".strip()
    inputs = _tokenizer(prompt, return_tensors="pt", max_length=128, truncation=True)

    with torch.no_grad():
        outputs = _model.generate(
            inputs.input_ids,
            max_length=256,
            num_return_sequences=request.count,
            num_beams=max(4, request.count),
            early_stopping=True,
            no_repeat_ngram_size=2
        )

    questions = [_tokenizer.decode(o, skip_special_tokens=True).strip() for o in outputs]
    return questions


def generate_solution(question_text: str) -> str:
    _load_model()
    import torch

    prompt = f"Provide the solution for: {question_text}"
    inputs = _tokenizer(prompt, return_tensors="pt", max_length=256, truncation=True)

    with torch.no_grad():
        outputs = _model.generate(
            inputs.input_ids,
            max_length=512,
            num_beams=4,
            early_stopping=True
        )

    solution = _tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
    return solution


# =============================================================================
# Cross-reference detector — checks only the FIRST LINE of a question.
#
# A question is a cross-reference if its very first sentence starts with a
# phrase like "Based on the results of your calculations in Question 4 a) (i)"
# or "Answer the following questions based on the ABC Tech scenario from Q1".
#
# Critically, this does NOT scan the whole text, so valid full questions whose
# internal sub-part (ii) says "Based on the answer in Question 1 c) (i)" are
# NOT filtered out — only questions that have no standalone content of their own.
# =============================================================================

_CROSS_REF_START_RE = _re.compile(
    r'^(?:'
    # "Based on [the] [your] <noun> [... words ...] Question N"
    r'based\s+on\s+(?:the\s+)?(?:your\s+)?'
    r'(?:answer|answers|result|results|calculation|calculations|working|work|'
    r'information|data|network\s+diagram|diagram|chart|charts|table|figure|output)s?'
    r'(?:\s+\w+){0,5}\s+question\s+[1-9]'
    r'|'
    # "Answer the following questions based on …"
    r'answer\s+the\s+following\s+questions?\s+based\s+on'
    r'|'
    # "From Question N …"
    r'from\s+question\s+[1-9]'
    r'|'
    # "Refer / Referring to Question N …"
    r'refer(?:ring)?\s+to\s+(?:the\s+)?question\s+[1-9]'
    r'|'
    # "Using the information from Question N …"
    r'using\s+the\s+information\s+from\s+question\s+[1-9]'
    r'|'
    # "With reference to Question N …"
    r'with\s+reference\s+to\s+(?:the\s+)?question\s+[1-9]'
    r'|'
    # "Based on the above …" / "Based on the scenario above …"
    # Does NOT match "Based on the XYZ Company scenario described below …"
    r'based\s+on\s+(?:the\s+)?(?:above|(?:scenario|case\s+study)\s+(?:above|in\s+question\s+[1-9]))'
    r')',
    _re.IGNORECASE,
)


def _is_standalone_question(text: str) -> bool:
    """
    Return True only when the question has its own standalone content.

    Primary check: only the FIRST LINE is tested against the cross-ref regex.
    Safety net: even if the first line matches, a long preamble before the first
    sub-question label means the question IS self-contained (it provides its own
    scenario inline, e.g. "Based on the Radix scenario below, …").
    """
    stripped = text.strip() if text else ""
    if len(stripped) < 50:
        return False
    first_line = stripped.split('\n')[0].strip()
    if not _CROSS_REF_START_RE.match(first_line):
        return True
    # First line matched the cross-ref pattern — check if a substantial scenario
    # is still embedded within the question before the first sub-question label.
    first_sub = _re.search(r'\n\s*\(?[a-zA-Z]\)\s', stripped)
    preamble = stripped[:first_sub.start()].strip() if first_sub else stripped
    return len(preamble) > 300


def _dedup(questions: list) -> list:
    """Remove near-duplicate questions (same first 120 characters)."""
    seen: set = set()
    out = []
    for q in questions:
        key = q.get("text", "")[:120].strip().lower()
        if key not in seen:
            seen.add(key)
            out.append(q)
    return out


def generate_full_paper(request) -> dict:
    """
    Build an exam paper from past-year questions stored in the database.

    Strategy:
      1. Fetch up to 20 questions matching the requested subject + topics.
      2. Filter out cross-reference-only questions (no standalone context).
      3. Deduplicate near-identical content.
      4. If fewer than 4 found, broaden the search to all questions for the
         subject (no topic restriction) to fill remaining slots.
      5. Use up to 4 questions (25 marks each).  If fewer than 4 exist in the
         DB the paper will have however many are available — no hardcoded text
         is ever inserted.

    Returns {"markdown_content": str, "questions": [...]} or {"error": str}.
    """
    from app.services.db_service import fetch_questions_for_topics, get_db_connection

    subject = request.subject
    topics  = request.topics if request.topics else []

    if not subject:
        return {"error": "INVALID_INPUT"}

    # Reuse ONE connection for every query below — Supabase's session-mode pooler
    # caps total clients (15), so opening a fresh connection per fetch can trip
    # "max clients reached in session mode".
    conn = get_db_connection()
    try:
        return _generate_full_paper_with_conn(subject, topics, conn,
                                              fetch_questions_for_topics)
    finally:
        conn.close()


def _generate_full_paper_with_conn(subject, topics, conn, fetch_questions_for_topics) -> dict:
    # ── Step 1: topic-filtered search ─────────────────────────────────────────
    print(f"[INFO] Fetching DB questions for subject='{subject}', topics={topics}")
    diag = {"subject": subject, "topics": topics}
    raw = fetch_questions_for_topics(subject, topics, limit=20, conn=conn)
    diag["step1_raw"] = len(raw)
    print(f"[DEBUG] Raw questions fetched: {len(raw)}")
    for _i, _q in enumerate(raw):
        _first = _q.get("text", "").strip().split('\n')[0][:120]
        _ok = _is_standalone_question(_q.get("text", ""))
        print(f"[DEBUG]  Q{_i+1} standalone={_ok} | {_first!r}")
    standalone = [q for q in raw if _is_standalone_question(q.get("text", ""))]
    db_questions = _dedup(standalone)
    print(f"[INFO] Topic search → {len(raw)} raw, {len(standalone)} standalone, {len(db_questions)} unique")

    # ── Step 2: broaden to subject-wide if still short ─────────────────────────
    if len(db_questions) < 4:
        print(f"[INFO] Only {len(db_questions)} questions after topic filter — broadening to subject-wide")
        seen_keys = {q.get("text", "")[:120].strip().lower() for q in db_questions}
        all_raw = fetch_questions_for_topics(subject, [], limit=40, conn=conn)
        print(f"[DEBUG] Subject-wide fetch returned {len(all_raw)} questions")
        for _i2, _q2 in enumerate(all_raw):
            _first2 = _q2.get("text", "").strip().split('\n')[0][:120]
            _ok2 = _is_standalone_question(_q2.get("text", ""))
            print(f"[DEBUG]  Broad Q{_i2+1} standalone={_ok2} | {_first2!r}")
        for q in all_raw:
            if not _is_standalone_question(q.get("text", "")):
                continue
            key = q.get("text", "")[:120].strip().lower()
            if key not in seen_keys:
                seen_keys.add(key)
                db_questions.append(q)
            if len(db_questions) >= 4:
                break
        print(f"[INFO] After broadening: {len(db_questions)} questions available")

    diag["after_broaden"] = len(db_questions)

    # ── Step 3: last-resort fallback — use ANY questions from the DB ───────────
    # If the cross-ref filter was too aggressive and rejected everything, still
    # generate a paper rather than returning an error.
    if not db_questions:
        print(f"[WARN] Cross-ref filter removed all candidates — falling back to unfiltered questions")
        all_fallback = fetch_questions_for_topics(subject, [], limit=40, conn=conn)
        diag["fallback_raw"] = len(all_fallback)
        db_questions = _dedup(all_fallback)
        print(f"[INFO] Unfiltered fallback: {len(db_questions)} questions available")

    diag["final"] = len(db_questions)
    if not db_questions:
        print(f"[ERROR] No questions after all steps. Diagnostics: {diag}")
        return {
            "error": (
                "No exam questions found in the database for this subject. "
                f"(diagnostics: {diag}) "
                "Please upload and process past-year papers for this subject first."
            )
        }

    # ── Step 3: build questions list (up to 4) ─────────────────────────────────
    selected = db_questions[:4]
    questions = []
    for i, q in enumerate(selected):
        fallback_topic = topics[i % len(topics)] if topics else "General"
        topic = q.get("topics", [fallback_topic])[0]
        questions.append({"text": q["text"], "topics": [topic]})

    # ── Step 4: build markdown (Java replaces this with formatted HTML) ────────
    total_marks = len(questions) * 25
    lines = [
        "[METADATA_START]",
        f"SUBJECT: {subject}",
        f"ALL_TOPICS: {', '.join(topics) if topics else 'General'}",
        f"TOTAL_MARKS: {total_marks}",
        "[METADATA_END]",
        "",
        f"# {subject} Examination Paper",
        "",
        f"### Total Marks: {total_marks} Marks (25 Marks per Question)",
        "",
        f"Answer ALL {len(questions)} questions. Each question carries 25 marks.",
        "",
    ]
    for i, q in enumerate(questions):
        lines += [
            "---",
            f"## Question {i + 1} (25 Marks)",
            "",
            f"TOPICS: {', '.join(q['topics'])}",
            q["text"],
            "",
        ]

    return {
        "markdown_content": "\n".join(lines),
        "questions": [
            {"text": q["text"], "topic": q["topics"][0], "marks": 25}
            for q in questions
        ],
    }
