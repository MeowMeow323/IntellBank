"""
Analytics Service – topic frequency, difficulty distribution, and exam-session data per subject.

  get_topic_frequency(subject, paper_limit)  → per-topic count + difficulty breakdown
  get_subject_trend(subject, paper_limit)    → year-by-year coverage from PYP upload dates
  get_subject_papers(subject)                → list of all papers for a subject (exam sessions)

paper_limit = None → include all questions (PYP + manually added).
paper_limit = N    → restrict to the N most recently uploaded past-year papers only.
"""

from typing import Dict, Any, Optional, List

# ── SQL helpers ───────────────────────────────────────────────────────────────

_SUBJECT_SQL = "SELECT subject_id FROM subjects WHERE LOWER(name) = LOWER(%s)"

_FUZZY_SUBJECT_SQL = "SELECT subject_id FROM subjects WHERE name ILIKE %s"

# All past-year papers that have at least one question tagged to this subject.
# Used to build the exam-session selector and to resolve paper_limit.
_PAPERS_SQL = """
    SELECT DISTINCT pyp.pyp_id, pyp.title, pyp.exam_session, pyp.upload_date
    FROM past_year_papers pyp
    JOIN questions q          ON q.pyp_id    = pyp.pyp_id
    JOIN question_topics qt   ON qt.question_id = q.question_id
    JOIN topics t             ON qt.topic_id  = t.topic_id
    WHERE t.subject_id = %s
    ORDER BY pyp.upload_date DESC
"""

# ── Topic-frequency SQL (two variants) ───────────────────────────────────────

# All questions (no paper filter — questions may or may not be linked to a PYP)
_TOPIC_FREQ_ALL_SQL = """
    SELECT
        t.topic_id,
        t.name                         AS topic_name,
        COUNT(DISTINCT qt.question_id) AS total_questions,
        SUM(CASE WHEN LOWER(d.name) LIKE '%%easy%%'   THEN 1 ELSE 0 END) AS easy_count,
        SUM(CASE WHEN LOWER(d.name) LIKE '%%medium%%' THEN 1 ELSE 0 END) AS medium_count,
        SUM(CASE WHEN LOWER(d.name) LIKE '%%hard%%'   THEN 1 ELSE 0 END) AS hard_count
    FROM topics t
    JOIN question_topics qt ON qt.topic_id      = t.topic_id
    JOIN questions q        ON q.question_id    = qt.question_id
    LEFT JOIN difficulties d ON d.difficulty_id = qt.difficulty_id
    WHERE t.subject_id = %s
    GROUP BY t.topic_id, t.name
    ORDER BY total_questions DESC
"""

# Restricted to questions from specific PYP IDs (paper_limit mode).
# Cast q.pyp_id to text for comparison so psycopg2's string-list → text[] adapter works reliably.
_TOPIC_FREQ_FILTERED_SQL = """
    SELECT
        t.topic_id,
        t.name                         AS topic_name,
        COUNT(DISTINCT qt.question_id) AS total_questions,
        SUM(CASE WHEN LOWER(d.name) LIKE '%%easy%%'   THEN 1 ELSE 0 END) AS easy_count,
        SUM(CASE WHEN LOWER(d.name) LIKE '%%medium%%' THEN 1 ELSE 0 END) AS medium_count,
        SUM(CASE WHEN LOWER(d.name) LIKE '%%hard%%'   THEN 1 ELSE 0 END) AS hard_count
    FROM topics t
    JOIN question_topics qt ON qt.topic_id      = t.topic_id
    JOIN questions q        ON q.question_id    = qt.question_id
    LEFT JOIN difficulties d ON d.difficulty_id = qt.difficulty_id
    WHERE t.subject_id = %s
      AND q.pyp_id::text = ANY(%s)
    GROUP BY t.topic_id, t.name
    ORDER BY total_questions DESC
"""

# ── Overview SQL (two variants) ───────────────────────────────────────────────

_OVERVIEW_ALL_SQL = """
    SELECT
        COUNT(DISTINCT qt.question_id)                                          AS total_questions,
        COUNT(DISTINCT CASE WHEN q.pyp_id IS NOT NULL THEN q.question_id END)  AS pyp_questions,
        COUNT(DISTINCT t.topic_id)                                              AS total_topics,
        COUNT(DISTINCT CASE WHEN q.pyp_id IS NOT NULL THEN q.pyp_id END)       AS total_papers
    FROM topics t
    JOIN question_topics qt    ON qt.topic_id   = t.topic_id
    JOIN questions q           ON q.question_id = qt.question_id
    WHERE t.subject_id = %s
"""

# Filtered overview counts questions from specific papers only.
# total_papers is returned from Python (len(ids)) to avoid a %s::int literal in SELECT.
_OVERVIEW_FILTERED_SQL = """
    SELECT
        COUNT(DISTINCT qt.question_id) AS total_questions,
        COUNT(DISTINCT t.topic_id)     AS total_topics
    FROM topics t
    JOIN question_topics qt ON qt.topic_id   = t.topic_id
    JOIN questions q        ON q.question_id = qt.question_id
    WHERE t.subject_id = %s
      AND q.pyp_id::text = ANY(%s)
"""

# ── Trend SQL (two variants) ──────────────────────────────────────────────────

_TREND_ALL_SQL = """
    SELECT
        COALESCE(
            (regexp_match(pyp.exam_session, '(\d{4})'))[1]::int,
            EXTRACT(YEAR FROM pyp.upload_date)::int
        )                                        AS year,
        t.topic_id,
        t.name                                   AS topic_name,
        COUNT(DISTINCT qt.question_id)           AS question_count
    FROM topics t
    JOIN question_topics qt   ON qt.topic_id   = t.topic_id
    JOIN questions q          ON q.question_id = qt.question_id
    JOIN past_year_papers pyp ON q.pyp_id      = pyp.pyp_id
    WHERE t.subject_id = %s
    GROUP BY 1, t.topic_id, t.name
    ORDER BY 1, question_count DESC
"""

_TREND_FILTERED_SQL = """
    SELECT
        COALESCE(
            (regexp_match(pyp.exam_session, '(\d{4})'))[1]::int,
            EXTRACT(YEAR FROM pyp.upload_date)::int
        )                                        AS year,
        t.topic_id,
        t.name                                   AS topic_name,
        COUNT(DISTINCT qt.question_id)           AS question_count
    FROM topics t
    JOIN question_topics qt   ON qt.topic_id   = t.topic_id
    JOIN questions q          ON q.question_id = qt.question_id
    JOIN past_year_papers pyp ON q.pyp_id      = pyp.pyp_id
    WHERE t.subject_id = %s
      AND q.pyp_id::text = ANY(%s)
    GROUP BY 1, t.topic_id, t.name
    ORDER BY 1, question_count DESC
"""


# ── Internal helpers ──────────────────────────────────────────────────────────

def _resolve_subject(cur, subject: str):
    """Return subject_id or None."""
    cur.execute(_SUBJECT_SQL, (subject,))
    row = cur.fetchone()
    if not row:
        cur.execute(_FUZZY_SUBJECT_SQL, (f"%{subject}%",))
        row = cur.fetchone()
    return row["subject_id"] if row else None


def _fetch_papers(cur, sid, limit: Optional[int] = None) -> List[Dict]:
    """Return all (or latest N) papers for the subject, newest-first."""
    cur.execute(_PAPERS_SQL, (sid,))
    rows = cur.fetchall()
    papers = [
        {
            "pypId":        str(r["pyp_id"]),
            "title":        r["title"],
            "examSession":  r["exam_session"],
            "uploadDate":   r["upload_date"].isoformat() if r["upload_date"] else None,
        }
        for r in rows
    ]
    if limit and limit > 0:
        papers = papers[:limit]
    return papers


def _paper_ids(papers: List[Dict]) -> List[str]:
    return [p["pypId"] for p in papers]


def _build_topics(topic_rows) -> List[Dict]:
    topics = []
    for r in topic_rows:
        total  = int(r["total_questions"]) or 1
        easy   = int(r["easy_count"]   or 0)
        medium = int(r["medium_count"] or 0)
        hard   = int(r["hard_count"]   or 0)
        tagged   = easy + medium + hard
        untagged = max(0, total - tagged)
        topics.append({
            "topicId":      str(r["topic_id"]),
            "name":         r["topic_name"],
            "count":        int(r["total_questions"]),
            "easy_pct":     round(easy     / total * 100),
            "medium_pct":   round(medium   / total * 100),
            "hard_pct":     round(hard     / total * 100),
            "untagged_pct": round(untagged / total * 100),
        })
    return topics


# ── Public API ────────────────────────────────────────────────────────────────

def get_topic_frequency(subject: str, paper_limit: Optional[int] = None) -> Dict[str, Any]:
    """
    Per-topic question count and difficulty distribution for a subject.

    paper_limit = N  → restrict to the N most recently uploaded past-year papers.
    paper_limit = None → all questions.

    Returns:
      {
        subject, total_questions, pyp_questions, total_topics, total_papers,
        papers_included: [{ pypId, title, uploadDate }],
        topics: [{ topicId, name, count, easy_pct, medium_pct, hard_pct, untagged_pct }]
      }
    """
    from app.services.db_service import get_db_connection
    from psycopg2.extras import DictCursor

    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=DictCursor) as cur:
            sid = _resolve_subject(cur, subject)
            if sid is None:
                return {"subject": subject, "error": f"Subject '{subject}' not found.", "topics": [], "papers_included": []}

            papers = _fetch_papers(cur, sid, paper_limit)
            ids = _paper_ids(papers)

            if paper_limit and ids:
                # Filtered: only questions from the selected papers.
                # _OVERVIEW_FILTERED_SQL returns 2 columns; total_papers comes from Python.
                cur.execute(_OVERVIEW_FILTERED_SQL, (sid, ids))
                ov = cur.fetchone() or {}
                overview = {
                    "total_questions": int(ov.get("total_questions") or 0),
                    "pyp_questions":   int(ov.get("total_questions") or 0),
                    "total_topics":    int(ov.get("total_topics")    or 0),
                    "total_papers":    len(ids),
                }
            else:
                cur.execute(_OVERVIEW_ALL_SQL, (sid,))
                ov = cur.fetchone() or {}
                overview = {
                    "total_questions": int(ov.get("total_questions") or 0),
                    "pyp_questions":   int(ov.get("pyp_questions")   or 0),
                    "total_topics":    int(ov.get("total_topics")    or 0),
                    "total_papers":    int(ov.get("total_papers")    or 0),
                }

            if paper_limit and ids:
                cur.execute(_TOPIC_FREQ_FILTERED_SQL, (sid, ids))
            else:
                cur.execute(_TOPIC_FREQ_ALL_SQL, (sid,))
            topic_rows = cur.fetchall()

        return {
            "subject":          subject,
            "total_questions":  overview["total_questions"],
            "pyp_questions":    overview["pyp_questions"],
            "total_topics":     overview["total_topics"],
            "total_papers":     overview["total_papers"],
            "papers_included":  papers,
            "topics":           _build_topics(topic_rows),
        }

    finally:
        conn.close()


def get_subject_trend(subject: str, paper_limit: Optional[int] = None) -> Dict[str, Any]:
    """
    Year-by-year topic coverage for a subject.

    paper_limit = N → only the N most recently uploaded past-year papers.

    Returns:
      {
        subject,
        papers_included: [{ pypId, title, uploadDate }],
        years: [{ year, topics: [{ topicId, name, count }], total }]
      }
    """
    from app.services.db_service import get_db_connection
    from psycopg2.extras import DictCursor
    from collections import defaultdict

    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=DictCursor) as cur:
            sid = _resolve_subject(cur, subject)
            if sid is None:
                return {"subject": subject, "error": f"Subject '{subject}' not found.", "years": [], "papers_included": []}

            papers = _fetch_papers(cur, sid, paper_limit)
            ids = _paper_ids(papers)

            if paper_limit and ids:
                cur.execute(_TREND_FILTERED_SQL, (sid, ids))
            else:
                cur.execute(_TREND_ALL_SQL, (sid,))
            rows = cur.fetchall()

        if not rows:
            return {
                "subject": subject, "years": [], "papers_included": papers,
                "note": "No past-year-paper data available yet.",
            }

        by_year = defaultdict(list)
        for r in rows:
            by_year[int(r["year"])].append({
                "topicId": str(r["topic_id"]),
                "name":    r["topic_name"],
                "count":   int(r["question_count"]),
            })

        years = [
            {"year": yr, "topics": topics, "total": sum(t["count"] for t in topics)}
            for yr, topics in sorted(by_year.items())
        ]

        return {"subject": subject, "papers_included": papers, "years": years}

    finally:
        conn.close()


def get_subject_papers(subject: str) -> Dict[str, Any]:
    """
    All past-year papers that have questions tagged to this subject.
    Used to build the exam-session list on the Subject Analysis page.
    """
    from app.services.db_service import get_db_connection
    from psycopg2.extras import DictCursor

    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=DictCursor) as cur:
            sid = _resolve_subject(cur, subject)
            if sid is None:
                return {"subject": subject, "error": f"Subject '{subject}' not found.", "papers": []}
            papers = _fetch_papers(cur, sid)
        return {"subject": subject, "papers": papers}
    finally:
        conn.close()
