"""
classification_service.py
==========================
Classifies a question block into topic(s) for a given subject.

Primary path: local zero-shot classification (facebook/bart-large-mnli via
transformers.pipeline) scored against the topic names already defined for
that subject in the `topics` table — no per-topic keyword curation needed,
any subject "just works" as soon as it has at least one topic name (see the
Subjects & Topics admin page / POST /api/metadata/topics on the Java side).

Fallback path (only used when a subject has zero topics defined yet, or
when --no-db-topics testing is needed): keyword-hit scoring against
app/data/topic_keywords.json, same logic this used to be the only option —
kept so the pipeline never hard-fails for an unconfigured subject.
"""

import os
import json

from app.services import db_service

BASE_DIR   = os.path.dirname(__file__)
DATA_DIR   = os.path.join(BASE_DIR, '..', 'data')
TOPIC_JSON = os.path.join(DATA_DIR, 'topic_keywords.json')

_ZERO_SHOT_MODEL = "facebook/bart-large-mnli"

# === Lazy singletons ==========================================================
_classifier = None
_keywords_cache: dict | None = None


def _load_zero_shot_classifier():
    global _classifier
    if _classifier is not None:
        return _classifier

    from transformers import pipeline
    print(f"Loading zero-shot classification model ({_ZERO_SHOT_MODEL})...")
    _classifier = pipeline("zero-shot-classification", model=_ZERO_SHOT_MODEL)
    return _classifier


# =============================================================================
# Keyword fallback (legacy path — used only when a subject has no DB topics)
# =============================================================================

def load_topic_keywords() -> dict:
    global _keywords_cache
    if _keywords_cache is not None:
        return _keywords_cache

    if not os.path.exists(TOPIC_JSON):
        print(f"[WARN] topic_keywords.json not found at {TOPIC_JSON}. Using empty map.")
        _keywords_cache = {}
        return _keywords_cache

    with open(TOPIC_JSON, 'r', encoding='utf-8') as f:
        _keywords_cache = json.load(f)
    return _keywords_cache


def classify_all_topics(block: str, keywords: dict, top_n: int = 2) -> list[str]:
    """
    Returns the top N topics ranked by keyword hit count.
    Requires at least 2 keyword hits to qualify — avoids tagging a question with a
    topic it only mentions incidentally (e.g. one word in passing).
    Falls back to the single best match if nothing reaches the threshold.
    """
    lower = block.lower()
    scores = {}
    for topic, kws in keywords.items():
        hits = sum(1 for kw in kws if kw.lower() in lower)
        if hits >= 2:
            scores[topic] = hits

    if not scores:
        # Threshold not met — fall back to the topic with the most hits (even if just 1)
        best, best_hits = None, 0
        for topic, kws in keywords.items():
            hits = sum(1 for kw in kws if kw.lower() in lower)
            if hits > best_hits:
                best, best_hits = topic, hits
        return [best] if best else ['General']

    sorted_topics = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [t for t, _ in sorted_topics[:top_n]]


# =============================================================================
# Primary path — zero-shot against DB-backed topic names
# =============================================================================

def get_candidate_topics(conn, subject_id: str) -> list[str]:
    return db_service.fetch_topic_names_for_subject(conn, subject_id)


def classify_topics_for_block(conn, subject_id: str, block_text: str, top_n: int = 2) -> list[str]:
    """
    Drop-in replacement for the old classify_all_topics(block, keywords, top_n)
    call site in the OCR pipeline. Tries zero-shot against this subject's
    real topic names first; only falls back to keyword-matching/'General' if
    the subject has no topics defined yet.
    """
    candidates = get_candidate_topics(conn, subject_id)

    if candidates:
        classifier = _load_zero_shot_classifier()
        # Truncate to a reasonable length — zero-shot models have limited context
        # and question text rarely needs more than this to identify its topic.
        text = block_text[:1000]
        result = classifier(text, candidate_labels=candidates, multi_label=True)
        ranked = sorted(zip(result["labels"], result["scores"]), key=lambda x: x[1], reverse=True)
        return [label for label, _score in ranked[:top_n]]

    # No topics defined for this subject yet — fall back to keywords/'General'.
    keywords = load_topic_keywords()
    return classify_all_topics(block_text, keywords, top_n)


def classify_question(question_text: str, subject_name: str) -> dict:
    """
    Standalone classification for a single question, used by
    POST /ai/classify/question (matches Java's AiClientService.classifyQuestion
    contract: {question_text} -> {subject, topic, confidence}).
    """
    conn = db_service.get_db_connection()
    try:
        subject_id = db_service.fetch_subject_id_by_name(conn, subject_name)
        if not subject_id:
            return {"subject": subject_name, "topic": "General", "confidence": 0.0}

        candidates = get_candidate_topics(conn, subject_id)
        if not candidates:
            keywords = load_topic_keywords()
            topics = classify_all_topics(question_text, keywords, top_n=1)
            return {"subject": subject_name, "topic": topics[0] if topics else "General", "confidence": 0.0}

        classifier = _load_zero_shot_classifier()
        result = classifier(question_text[:1000], candidate_labels=candidates, multi_label=True)
        ranked = sorted(zip(result["labels"], result["scores"]), key=lambda x: x[1], reverse=True)
        top_label, top_score = ranked[0]
        return {"subject": subject_name, "topic": top_label, "confidence": round(float(top_score), 4)}
    finally:
        conn.close()
