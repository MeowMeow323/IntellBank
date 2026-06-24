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


# How many questions a generated paper may contain. The target is derived from the
# requested total marks (25 marks/question) but always clamped to this range, so a
# paper is never trivially short (few topics chosen) nor unreasonably long.
MIN_QUESTIONS = 3
MAX_QUESTIONS = 6
MARKS_PER_QUESTION = 25


# =============================================================================
# Composite question reconstruction
#
# Questions are stored as individual leaf sub-parts whose content begins with a
# "[QPART:<question-no>:<part>]" marker (e.g. "[QPART:4:b-ii]"). Sibling sub-parts
# repeat their shared stem. To present a real 25-mark exam question we regroup all
# fragments of one original question (same paper + question number) and merge them,
# de-duplicating the repeated stems.
# =============================================================================

_QPART_RE       = _re.compile(r'^\s*\[QPART:([^:\]]+):([^\]]+)\]\s*', _re.IGNORECASE)
_SCENARIO_OPEN  = _re.compile(r'\[SCENARIO\]\s*', _re.IGNORECASE)
_SCENARIO_CLOSE = _re.compile(r'\s*\[/SCENARIO\]', _re.IGNORECASE)
_ROMAN = {'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8}


def _part_sort_key(part: str):
    """Order parts a, b, c then a-i, a-ii … so the question reads top-to-bottom."""
    part = (part or '').lower().strip()
    bits = part.split('-')
    letter = bits[0] if bits else ''
    sub = bits[1] if len(bits) > 1 else ''
    return (letter, _ROMAN.get(sub, 0))


def _strip_markers(text: str) -> str:
    """Drop the [QPART:…] prefix and unwrap [SCENARIO]…[/SCENARIO]; keep [TABLE] (Java renders it)."""
    text = _QPART_RE.sub('', text)
    text = _SCENARIO_OPEN.sub('', text)
    text = _SCENARIO_CLOSE.sub('', text)
    return text.strip()


def _assemble_fragments(frags: list) -> str:
    """
    Concatenate a question's sub-part fragments into one body, de-duplicating repeated
    paragraph blocks (siblings such as (i)/(ii) repeat the shared "b) …" stem).
    """
    seen: set = set()
    blocks: list = []
    for f in frags:
        body = _strip_markers(f['content'])
        for block in _re.split(r'\n{2,}', body):
            b = block.strip()
            if not b:
                continue
            key = _re.sub(r'\s+', ' ', b).lower()
            if key in seen:
                continue
            seen.add(key)
            blocks.append(b)
    return '\n\n'.join(blocks)


def _build_composite_questions(rows: list) -> list:
    """Regroup stored sub-part fragments into full questions: [{'text','topics','marks'}]."""
    groups: dict = {}
    order: list = []
    for r in rows:
        content = r.get('content', '') or ''
        m = _QPART_RE.match(content)
        if m:
            key = (r.get('pyp_id'), m.group(1))          # same paper + question number
            part = m.group(2)
        else:
            key = ('solo', r.get('question_id'))          # already a whole question
            part = ''
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append({
            'part': part,
            'content': content,
            'marks': r.get('marks', 0) or 0,
            'topics': r.get('topics', []) or [],
        })

    composites = []
    for key in order:
        frags = sorted(groups[key], key=lambda f: _part_sort_key(f['part']))
        text = _assemble_fragments(frags)
        if len(text.strip()) < 30:
            continue
        topics = []
        for f in frags:
            for t in f['topics']:
                if t and t not in topics:
                    topics.append(t)
        composites.append({'text': text, 'topics': topics, 'marks': MARKS_PER_QUESTION})
    return composites


def generate_full_paper(request) -> dict:
    """
    Build an exam paper from past-year questions stored in the database.

    Stored questions are individual sub-part fragments, so the strategy is:
      1. Fetch every question row for the subject (with pyp_id + [QPART] markers).
      2. Regroup the fragments into full multi-part questions (parts a/b/c …).
      3. Drop cross-reference-only questions and near-duplicates.
      4. Prefer questions covering the chosen topics, then top up with the rest,
         up to `target` questions (total_marks/25, clamped to [MIN, MAX]).

    Returns {"markdown_content": str, "questions": [...]} or {"error": str}.
    """
    from app.services.db_service import fetch_subject_questions, get_db_connection

    subject = request.subject
    topics  = request.topics if request.topics else []
    total_marks = getattr(request, "total_marks", None) or (MAX_QUESTIONS * MARKS_PER_QUESTION)

    if not subject:
        return {"error": "INVALID_INPUT"}

    target = max(MIN_QUESTIONS, min(MAX_QUESTIONS, total_marks // MARKS_PER_QUESTION))

    # Reuse ONE connection — Supabase's session-mode pooler caps total clients (15).
    conn = get_db_connection()
    try:
        return _generate_full_paper_with_conn(subject, topics, target, conn,
                                              fetch_subject_questions)
    finally:
        conn.close()


def _generate_full_paper_with_conn(subject, topics, target, conn, fetch_subject_questions) -> dict:
    print(f"[INFO] Building paper for subject='{subject}', topics={topics}, target={target}")
    diag = {"subject": subject, "topics": topics, "target": target}

    # ── Step 1: fetch every fragment, regroup into full questions ──────────────
    rows = fetch_subject_questions(subject, conn=conn)
    diag["rows"] = len(rows)
    composites = _build_composite_questions(rows)
    diag["composites"] = len(composites)

    # ── Step 2: keep standalone, drop near-duplicates ──────────────────────────
    composites = [c for c in composites if _is_standalone_question(c["text"])]
    composites = _dedup(composites)
    diag["standalone"] = len(composites)
    print(f"[INFO] {len(rows)} fragments → {diag['composites']} questions → {len(composites)} standalone/unique")

    if not composites:
        print(f"[ERROR] No questions after grouping. Diagnostics: {diag}")
        return {
            "error": (
                "No exam questions found in the database for this subject. "
                f"(diagnostics: {diag}) "
                "Please upload and process past-year papers for this subject first."
            )
        }

    # ── Step 3: prefer questions covering the chosen topics, then top up ───────
    chosen = {t.strip().lower() for t in topics} if topics else set()

    def matches(c):
        return bool(chosen) and any((t or "").strip().lower() in chosen for t in c["topics"])

    matched = [c for c in composites if matches(c)]
    others  = [c for c in composites if not matches(c)]
    import random as _random
    _random.shuffle(matched)
    _random.shuffle(others)

    selected = matched[:target]
    for c in others:
        if len(selected) >= target:
            break
        selected.append(c)
    diag["selected"] = len(selected)
    print(f"[INFO] Selected {len(selected)} questions ({len(matched)} topic-matched, target {target})")

    # ── Step 4: build markdown (Java replaces this with formatted HTML) ────────
    questions = []
    for c in selected:
        qtopics = c["topics"] if c["topics"] else (topics[:1] if topics else ["General"])
        questions.append({"text": c["text"], "topics": qtopics})

    total_marks = len(questions) * MARKS_PER_QUESTION
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
            {"text": q["text"], "topic": q["topics"][0], "topics": q["topics"], "marks": MARKS_PER_QUESTION}
            for q in questions
        ],
    }
