"""
Weakness Analysis Service — the cohort "Class Weakness" model.

This is the project's OWN trained-AI component, kept deliberately separate from the
partner's K-Means *topic predictor* (prediction_service.py). For a subject it learns,
from the educator-marked papers, which topics the COHORT is consistently weak at.

On every request it retrains (auto-retrain on demand): it builds a feature vector per
topic from all students' mastery bands and fits an unsupervised **hierarchical
(agglomerative) clustering** model — implemented from scratch in pure Python — to group
topics into weakness tiers (High / Medium / Low concern). No external APIs and no
pre-trained artifacts: it reads the same Supabase DB the rest of the AI service uses
and learns the cluster structure directly from the cohort each call.
"""

from collections import defaultdict

# Cohort gate — only surface class weaknesses once there is enough evidence.
MIN_SUBMISSIONS = 5
MIN_STUDENTS = 2

# 4-band mastery label → representative score (MUST match the Java mapping).
_BAND_SCORE = {"Beginner": 40, "Intermediate": 60, "Advanced": 80, "Mastered": 95}
_WEAK_BELOW = 50

MODEL_NAME = "agglomerative-cohort-weakness-v1"

# How many graded submissions and distinct students exist for the subject
# (a submission counts toward a subject via its questions' topics).
_GATE_SQL = """
    SELECT COUNT(DISTINCT s.submission_id) AS n_subs,
           COUNT(DISTINCT pr.student_id)   AS n_students
    FROM submissions s
    JOIN documents d  ON s.document_id = d.document_id
    JOIN projects  pr ON d.project_id  = pr.project_id
    JOIN document_questions dq ON dq.document_id = d.document_id
    JOIN questions q  ON dq.question_id = q.question_id
    JOIN question_topics qt ON qt.question_id = q.question_id
    JOIN topics t     ON qt.topic_id = t.topic_id
    WHERE t.subject_id = %s AND s.status IN ('GRADED', 'RETURNED')
"""

# Each student's latest mastery band per topic for the subject.
_PERF_SQL = """
    SELECT sp.student_id, t.topic_id, t.name AS topic_name, sp.mastery_level
    FROM student_performance sp
    JOIN topics t ON sp.topic_id = t.topic_id
    WHERE t.subject_id = %s
"""


def analyze_class_weaknesses(subject: str, conn=None) -> dict:
    """
    Returns:
      {
        "eligible": bool, "subject": str, "n_submissions": int, "n_students": int,
        "model": str, "reason": str (when ineligible),
        "topics": [{ topicId, topic, students_assessed, weak_students,
                     pct_below_50, mean_band, tier, weakness_score }]
      }
    """
    from app.services.db_service import get_db_connection
    from psycopg2.extras import DictCursor

    own_conn = conn is None
    try:
        if own_conn:
            conn = get_db_connection()
        with conn.cursor(cursor_factory=DictCursor) as cur:
            cur.execute("SELECT subject_id FROM subjects WHERE LOWER(name) = LOWER(%s)", (subject,))
            row = cur.fetchone()
            if not row:
                cur.execute("SELECT subject_id FROM subjects WHERE name ILIKE %s", (f'%{subject}%',))
                row = cur.fetchone()
            if not row:
                return _ineligible(subject, 0, 0, "Subject not found in the database.")
            sid = row["subject_id"]

            cur.execute(_GATE_SQL, (sid,))
            g = cur.fetchone() or {}
            n_subs = int(g.get("n_subs") or 0)
            n_students = int(g.get("n_students") or 0)

            cur.execute(_PERF_SQL, (sid,))
            rows = cur.fetchall()

        # ── Cohort gate ───────────────────────────────────────────────────────
        if n_subs < MIN_SUBMISSIONS or n_students < MIN_STUDENTS:
            return _ineligible(
                subject, n_subs, n_students,
                f"Need at least {MIN_SUBMISSIONS} graded submissions from {MIN_STUDENTS} students "
                f"(currently {n_subs} from {n_students}).",
            )

        # ── Per-topic cohort features ─────────────────────────────────────────
        scores = defaultdict(list)
        names = {}
        for r in rows:
            tid = str(r["topic_id"])
            names[tid] = r["topic_name"]
            scores[tid].append(_BAND_SCORE.get(r["mastery_level"], 40))

        topics = []
        for tid, sc in scores.items():
            n = len(sc)
            weak = sum(1 for s in sc if s < _WEAK_BELOW)
            topics.append({
                "topicId": tid,
                "topic": names[tid],
                "students_assessed": n,
                "weak_students": weak,
                "pct_below_50": round(100 * weak / n),
                "mean_band": round(sum(sc) / n, 1),
            })

        if not topics:
            return _ineligible(subject, n_subs, n_students, "No graded topic data for this subject yet.")

        # ── Train the clustering model → weakness tiers ───────────────────────
        topics = _train_and_tier(topics)
        for t in topics:
            # Composite weakness score (default ranking): mostly how many students are
            # weak, plus how low the average band is.
            t["weakness_score"] = round(0.7 * t["pct_below_50"] + 0.3 * (100 - t["mean_band"]), 1)
        topics.sort(key=lambda t: t["weakness_score"], reverse=True)

        return {
            "eligible": True,
            "subject": subject,
            "n_submissions": n_subs,
            "n_students": n_students,
            "model": MODEL_NAME,
            "topics": topics,
        }
    except Exception as e:
        import traceback
        print(f"[weakness] error: {e}")
        traceback.print_exc()
        raise RuntimeError(f"Weakness analysis failed: {e}") from e
    finally:
        if own_conn and conn:
            conn.close()


def _ineligible(subject, n_subs, n_students, reason):
    return {
        "eligible": False, "subject": subject,
        "n_submissions": n_subs, "n_students": n_students,
        "reason": reason, "topics": [],
    }


def _threshold_tier(pct_below):
    if pct_below >= 60:
        return "High"
    if pct_below >= 30:
        return "Medium"
    return "Low"


def _train_and_tier(topics: list) -> list:
    """
    Fit hierarchical (agglomerative) clustering on the per-topic feature vectors and
    label each topic with a weakness tier. With fewer than 3 topics there's nothing to
    cluster, so it falls back to fixed thresholds.
    """
    n = len(topics)
    if n < 3:
        for t in topics:
            t["tier"] = _threshold_tier(t["pct_below_50"])
        return topics
    try:
        feats = [[t["pct_below_50"], 100 - t["mean_band"], t["weak_students"]] for t in topics]
        points = _standardize(feats)
        labels = _agglomerative(points, k=min(3, n))

        # Order clusters by their average % of weak students → High / Medium / Low.
        by_cluster = defaultdict(list)
        for lbl, t in zip(labels, topics):
            by_cluster[lbl].append(t["pct_below_50"])
        order = sorted(by_cluster, key=lambda c: sum(by_cluster[c]) / len(by_cluster[c]), reverse=True)
        tier_names = ["High", "Medium", "Low"]
        cluster_tier = {c: tier_names[min(i, len(tier_names) - 1)] for i, c in enumerate(order)}
        for lbl, t in zip(labels, topics):
            t["tier"] = cluster_tier[lbl]
    except Exception as e:
        print(f"[weakness] clustering fell back to thresholds: {e}")
        for t in topics:
            t["tier"] = _threshold_tier(t["pct_below_50"])
    return topics


# ── From-scratch agglomerative clustering (pure Python, no native deps) ────────

def _standardize(rows: list) -> list:
    """Z-score each feature column so no single feature dominates the distance."""
    n = len(rows)
    d = len(rows[0])
    means = [sum(r[j] for r in rows) / n for j in range(d)]
    stds = []
    for j in range(d):
        var = sum((r[j] - means[j]) ** 2 for r in rows) / n
        stds.append((var ** 0.5) or 1.0)
    return [[(r[j] - means[j]) / stds[j] for j in range(d)] for r in rows]


def _euclidean(a: list, b: list) -> float:
    return sum((a[i] - b[i]) ** 2 for i in range(len(a))) ** 0.5

"""
    Average-linkage agglomerative clustering: start with each point in its own cluster
    and repeatedly merge the two whose centroids are closest, until k clusters remain.
    Returns a cluster label per point.
    """
def _agglomerative(points: list, k: int) -> list:
    
    clusters = [[i] for i in range(len(points))]

    def centroid(cluster):
        d = len(points[0])
        return [sum(points[i][j] for i in cluster) / len(cluster) for j in range(d)]

    while len(clusters) > k:
        cents = [centroid(c) for c in clusters]
        best, bi, bj = None, -1, -1
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                dist = _euclidean(cents[i], cents[j])
                if best is None or dist < best:
                    best, bi, bj = dist, i, j
        clusters[bi] = clusters[bi] + clusters[bj]
        del clusters[bj]

    labels = [0] * len(points)
    for ci, cluster in enumerate(clusters):
        for idx in cluster:
            labels[idx] = ci
    return labels
