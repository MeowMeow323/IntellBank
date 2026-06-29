"""
train_topic_predictor.py
========================
Builds a topic-prediction JSON cache from training_dataset.csv using real topic
names (the `topic` column) rather than K-Means cluster keywords.

The live prediction_service.py queries the DB directly on every request, so
this script is the *offline fallback generator* — run it once to produce a
predictions JSON that will be served for subjects not yet in the DB.

Algorithm (per subject):
  1. Group rows by (subject, topic).
  2. Count occurrences per year → total frequency and latest year seen.
  3. Compute recency-weighted confidence:
       freq_score    = topic_count / max_count_in_subject  (0–1, normalized)
       recency_score = max(0.3, 1.0 - years_since_latest * 0.15)
       confidence    = 0.6 * freq_score + 0.4 * recency_score
  4. predicted_next_year = True if topic appeared in the latest year for that subject.
"""

import os
import json
from datetime import datetime

import pandas as pd

BASE_DIR     = os.path.dirname(__file__)
DATASET_PATH = os.path.abspath(os.path.join(BASE_DIR, "..", "data", "training_dataset.csv"))
MODEL_DIR    = os.path.abspath(os.path.join(BASE_DIR, "..", "models", "topic_predictor"))
JSON_OUTPUT  = os.path.join(MODEL_DIR, "topic_predictions.json")

CURRENT_YEAR = datetime.now().year


def train_clustering():
    print(f"Loading dataset: {DATASET_PATH}")
    if not os.path.exists(DATASET_PATH):
        print("[ERROR] Dataset not found.")
        return

    df = pd.read_csv(DATASET_PATH)
    df = df.dropna(subset=["topic", "subject", "year"])
    df["topic"]   = df["topic"].astype(str).str.strip()
    df["subject"] = df["subject"].astype(str).str.strip()
    df["year"]    = pd.to_numeric(df["year"], errors="coerce")
    df = df.dropna(subset=["year"])
    df["year"] = df["year"].astype(int)

    predictions_db = {}

    for subject, sub_df in df.groupby("subject"):
        print(f"\nProcessing subject: {subject}")

        topic_stats = (
            sub_df.groupby("topic")
            .agg(total=("topic", "count"), latest_year=("year", "max"))
            .reset_index()
        )

        if topic_stats.empty:
            continue

        latest_subject_year = int(topic_stats["latest_year"].max())
        max_count = int(topic_stats["total"].max())

        subject_topics = []
        for _, row in topic_stats.iterrows():
            topic_name  = row["topic"]
            count       = int(row["total"])
            latest_year = int(row["latest_year"])

            freq_score    = count / max_count
            years_since   = max(0, CURRENT_YEAR - latest_year)
            recency_score = max(0.3, 1.0 - years_since * 0.15)
            confidence    = round(0.6 * freq_score + 0.4 * recency_score, 2)

            subject_topics.append({
                "topic":               topic_name,
                "confidence":          confidence,
                "predicted_next_year": latest_year >= latest_subject_year,
                "frequency":           count,
            })

        subject_topics.sort(key=lambda x: x["confidence"], reverse=True)
        predictions_db[subject] = subject_topics

        for t in subject_topics:
            flag = "★" if t["predicted_next_year"] else " "
            print(f"  {flag} {t['topic']:<40} conf={t['confidence']:.2f}  freq={t['frequency']}")

    os.makedirs(MODEL_DIR, exist_ok=True)
    with open(JSON_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(predictions_db, f, indent=4)
    print(f"\n[OK] Saved predictions knowledge base → {JSON_OUTPUT}")


if __name__ == "__main__":
    train_clustering()
