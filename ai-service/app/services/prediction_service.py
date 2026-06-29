"""
Prediction Service – predicts which topics are likely to appear in upcoming exams.

Queries the live DB (same pattern as weakness_service.py) so predictions reflect
the actual question bank without needing a pre-generated JSON artefact.

Confidence = 0.6 * frequency_score + 0.4 * recency_score
  frequency_score  = topic_question_count / max_topic_count  (normalized)
  recency_score    = decays from 1.0 → 0.3 over 2 years based on last PYP upload date;
                     0.5 when the topic has no past-year-paper link yet
"""

from collections import defaultdict
from datetime import datetime, timezone
from typing import List, Dict, Any

MIN_QUESTIONS = 1  # minimum questions needed for a topic to appear in predictions


# ── SQL ───────────────────────────────────────────────────────────────────────

_SUBJECT_SQL = """
    SELECT subject_id FROM subjects WHERE LOWER(name) = LOWER(%s)
"""

_TOPIC_ANALYSIS_SQL = """
    SELECT
        t.topic_id,
        t.name                                                              AS topic_name,
        COUNT(DISTINCT qt.question_id)                                      AS total_questions,
        COUNT(DISTINCT CASE WHEN q.pyp_id IS NOT NULL THEN q.question_id END) AS pyp_questions,
        MAX(pyp.upload_date)                                                AS last_seen
    FROM topics t
    JOIN question_topics qt     ON qt.topic_id    = t.topic_id
    JOIN questions q            ON q.question_id  = qt.question_id
    LEFT JOIN past_year_papers pyp ON q.pyp_id    = pyp.pyp_id
    WHERE t.subject_id = %s
    GROUP BY t.topic_id, t.name
    HAVING COUNT(DISTINCT qt.question_id) >= %s
    ORDER BY total_questions DESC
"""

_SUBJECTS_WITH_QUESTIONS_SQL = """
    SELECT DISTINCT s.name
    FROM subjects s
    JOIN topics t ON t.subject_id = s.subject_id
    JOIN question_topics qt ON qt.topic_id = t.topic_id
    ORDER BY s.name
"""


# ── Public API ────────────────────────────────────────────────────────────────

def available_subjects() -> List[str]:
    """Subjects that have at least one question in the DB (thus capable of predictions)."""
    from app.services.db_service import get_db_connection
    from psycopg2.extras import DictCursor
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=DictCursor) as cur:
            cur.execute(_SUBJECTS_WITH_QUESTIONS_SQL)
            return [row["name"] for row in cur.fetchall()]
    except Exception as e:
        print(f"[prediction] available_subjects error: {e}")
        return []
    finally:
        try:
            conn.close()
        except Exception:
            pass


def predict_topics(subject: str, year: int = 2025) -> List[Dict[str, Any]]:
    """
    Predict topics likely to appear in the next exam for a given subject.
    Queries the live DB; no pre-generated JSON required.

    Returns list of dicts: { topic, confidence, predicted_next_year, frequency, tier }
    """
    from app.services.db_service import get_db_connection
    from psycopg2.extras import DictCursor

    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=DictCursor) as cur:
            cur.execute(_SUBJECT_SQL, (subject,))
            row = cur.fetchone()
            if not row:
                # fuzzy fallback
                cur.execute(
                    "SELECT subject_id FROM subjects WHERE name ILIKE %s", (f"%{subject}%",)
                )
                row = cur.fetchone()
            if not row:
                return _fallback(f"Subject '{subject}' not found.")

            sid = row["subject_id"]
            cur.execute(_TOPIC_ANALYSIS_SQL, (sid, MIN_QUESTIONS))
            rows = cur.fetchall()

        if not rows:
            return _fallback(f"No questions found for subject '{subject}'.")

        return _build_predictions(rows)

    except Exception as e:
        import traceback
        print(f"[prediction] predict_topics error: {e}")
        traceback.print_exc()
        return _fallback(f"Prediction failed: {e}")
    finally:
        try:
            conn.close()
        except Exception:
            pass


# ── Internal helpers ──────────────────────────────────────────────────────────

def _fallback(reason: str) -> List[Dict[str, Any]]:
    print(f"[prediction] fallback — {reason}")
    return [{"topic": "General Topics", "confidence": 0.50, "predicted_next_year": True,
             "frequency": None, "tier": "Medium"}]


def _build_predictions(rows) -> List[Dict[str, Any]]:
    now = datetime.now(tz=timezone.utc)

    counts = [int(r["total_questions"]) for r in rows]
    max_count = max(counts) if counts else 1

    # Find the most recently seen PYP date to determine "appeared recently"
    all_dates = [r["last_seen"] for r in rows if r["last_seen"] is not None]
    latest_paper_date = max(all_dates) if all_dates else None

    results = []
    for r in rows:
        topic_count = int(r["total_questions"])
        freq_score = topic_count / max_count

        last_seen = r["last_seen"]
        if last_seen is not None:
            # Normalize last_seen to UTC-aware datetime
            if hasattr(last_seen, "tzinfo") and last_seen.tzinfo is None:
                last_seen = last_seen.replace(tzinfo=timezone.utc)
            days_since = (now - last_seen).days
            recency_score = max(0.3, 1.0 - days_since / 730.0)
        else:
            recency_score = 0.5

        confidence = round(0.6 * freq_score + 0.4 * recency_score, 2)

        # A topic is "predicted next year" if it appeared in the most recent PYP
        if latest_paper_date and last_seen is not None:
            if hasattr(latest_paper_date, "tzinfo") and latest_paper_date.tzinfo is None:
                latest_paper_date_aware = latest_paper_date.replace(tzinfo=timezone.utc)
            else:
                latest_paper_date_aware = latest_paper_date
            if hasattr(last_seen, "tzinfo") and last_seen.tzinfo is None:
                last_seen_aware = last_seen.replace(tzinfo=timezone.utc)
            else:
                last_seen_aware = last_seen
            # Within 90 days of the most recent paper upload = "appeared recently"
            predicted_next_year = (latest_paper_date_aware - last_seen_aware).days <= 90
        else:
            predicted_next_year = confidence >= 0.5

        tier = "High" if confidence >= 0.7 else "Medium" if confidence >= 0.4 else "Low"

        results.append({
            "topic": r["topic_name"],
            "confidence": confidence,
            "predicted_next_year": predicted_next_year,
            "frequency": topic_count,
            "tier": tier,
        })

    results.sort(key=lambda x: x["confidence"], reverse=True)
    return results
