"""
train_topic_predictor.py
========================
Builds the topic-prediction knowledge base consumed by app/services/prediction_service.py.

Method (FR 4.1–4.3): for each subject, count how frequently every topic appears across the
question bank (question_topics), then run K-Means on that 1-D frequency signal to cluster
topics into priority tiers (High / Medium / Low). A topic's confidence is its frequency
normalised against the most frequent topic in the same subject.

Output: app/models/topic_predictor/topic_predictions.json
    {
      "<subject name>": [
        { "topic": "...", "confidence": 0.87, "predicted_next_year": true,
          "frequency": 13, "tier": "High" },
        ...
      ]
    }

Run:  python app/tools/train_topic_predictor.py
"""

import os
import sys
import json

import numpy as np
import psycopg2
from dotenv import load_dotenv

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
except Exception:
    pass

load_dotenv()

OUTPUT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "models", "topic_predictor", "topic_predictions.json"
)

# Subjects with fewer than this many distinct topics skip K-Means (not enough to cluster).
MIN_TOPICS_FOR_KMEANS = 3
TIER_LABELS = ["High", "Medium", "Low"]


# =============================================================================
# Database
# =============================================================================

def get_conn():
    required = ["SUPABASE_DB_HOST", "SUPABASE_DB_PORT", "SUPABASE_DB_NAME",
               "SUPABASE_DB_USER", "SUPABASE_DB_PASSWORD"]
    missing = [k for k in required if not os.getenv(k)]
    if missing:
        raise ValueError("Missing .env variables: " + ", ".join(missing))
    return psycopg2.connect(
        host=os.getenv("SUPABASE_DB_HOST"),
        port=int(os.getenv("SUPABASE_DB_PORT")),
        dbname=os.getenv("SUPABASE_DB_NAME"),
        user=os.getenv("SUPABASE_DB_USER"),
        password=os.getenv("SUPABASE_DB_PASSWORD"),
        sslmode="require",
    )


def fetch_topic_frequencies(conn) -> dict[str, list[tuple[str, int]]]:
    """Return { subject: [(topic, frequency), ...] } — frequency = #questions tagged to the topic."""
    sql = """
        SELECT s.name AS subject, t.name AS topic, COUNT(qt.question_id) AS freq
        FROM question_topics qt
        JOIN topics   t ON t.topic_id   = qt.topic_id
        JOIN subjects s ON s.subject_id = t.subject_id
        GROUP BY s.name, t.name
        ORDER BY s.name, freq DESC
    """
    result: dict[str, list[tuple[str, int]]] = {}
    with conn.cursor() as cur:
        cur.execute(sql)
        for subject, topic, freq in cur.fetchall():
            result.setdefault(subject, []).append((topic, int(freq)))
    return result


# =============================================================================
# Clustering
# =============================================================================

def assign_tiers(frequencies: list[int]) -> list[str]:
    """
    Cluster the frequency values into High/Medium/Low tiers using K-Means.
    Falls back to a simple threshold split when there are too few topics to cluster.
    """
    n = len(frequencies)
    if n == 0:
        return []
    if n < MIN_TOPICS_FOR_KMEANS:
        # Not enough points to cluster meaningfully — rank by raw frequency.
        hi = max(frequencies)
        return ["High" if f == hi else "Medium" for f in frequencies]

    from sklearn.cluster import KMeans

    X = np.array(frequencies, dtype=float).reshape(-1, 1)
    k = min(len(TIER_LABELS), len(set(frequencies)))   # never ask for more clusters than distinct values
    km = KMeans(n_clusters=k, random_state=42, n_init=10).fit(X)

    # Order clusters by their centroid (highest centroid = "High").
    centroids = km.cluster_centers_.flatten()
    order = list(np.argsort(centroids)[::-1])           # cluster ids, busiest first
    cluster_to_tier = {cid: TIER_LABELS[min(rank, len(TIER_LABELS) - 1)]
                       for rank, cid in enumerate(order)}
    return [cluster_to_tier[c] for c in km.labels_]


def build_subject_predictions(topics: list[tuple[str, int]]) -> list[dict]:
    frequencies = [f for _, f in topics]
    tiers = assign_tiers(frequencies)
    max_freq = max(frequencies) if frequencies else 1

    predictions = []
    for (topic, freq), tier in zip(topics, tiers):
        confidence = round(freq / max_freq, 2) if max_freq else 0.0
        predictions.append({
            "topic": topic,
            "confidence": confidence,
            "predicted_next_year": tier in ("High", "Medium"),
            "frequency": freq,
            "tier": tier,
        })
    predictions.sort(key=lambda p: p["confidence"], reverse=True)
    return predictions


# =============================================================================
# Main
# =============================================================================

def main():
    print("=" * 60)
    print("  IntellBank — Topic Predictor (K-Means) Training")
    print("=" * 60)

    conn = get_conn()
    try:
        freq_by_subject = fetch_topic_frequencies(conn)
    finally:
        conn.close()

    if not freq_by_subject:
        print("  [WARN] No question_topics found. Seed the database first.")
        return

    knowledge_base = {
        subject: build_subject_predictions(topics)
        for subject, topics in freq_by_subject.items()
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(knowledge_base, f, indent=2, ensure_ascii=False)

    print(f"\n  ✓ Wrote predictions for {len(knowledge_base)} subject(s) → {OUTPUT_PATH}")
    for subject, preds in knowledge_base.items():
        top = ", ".join(f"{p['topic']}({p['confidence']})" for p in preds[:3])
        print(f"    - {subject}: {len(preds)} topics | top: {top}")


if __name__ == "__main__":
    main()