"""
train_topic_predictor.py
────────────────────────
Train the topic frequency predictor using historical exam data.

Input:  Historical topic frequency data (from app/data/processed/topic_freq.csv
        or directly from the PostgreSQL database)

Output: app/models/topic_predictor/predictor.pkl

CSV columns: subject, topic, year, frequency

Run:
    python app/training/train_topic_predictor.py
"""

import os
import pandas as pd

DATASET_PATH = "./app/data/processed/topic_freq.csv"
OUTPUT_DIR = "./app/models/topic_predictor"


def train():
    """
    Train a topic frequency predictor.
    
    Initial model: scikit-learn Random Forest classifier.
    Upgrade path: Prophet for time-series forecasting.
    """
    if not os.path.exists(DATASET_PATH):
        print(f"[ERROR] Dataset not found at {DATASET_PATH}")
        print("Please export topic frequency data from PostgreSQL:")
        print("  COPY (SELECT subject, topic, year, frequency FROM topic_frequency)")
        print("  TO '/path/to/topic_freq.csv' CSV HEADER;")
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    df = pd.read_csv(DATASET_PATH)
    print(f"[INFO] Loaded {len(df)} topic frequency records")

    # TODO: Uncomment and implement the ML model after you have enough data:
    #
    # from sklearn.ensemble import RandomForestClassifier
    # from sklearn.preprocessing import LabelEncoder
    # from sklearn.model_selection import train_test_split
    # from sklearn.metrics import classification_report
    # import pickle
    #
    # # Encode categorical features
    # le_subject = LabelEncoder()
    # le_topic = LabelEncoder()
    # df["subject_enc"] = le_subject.fit_transform(df["subject"])
    # df["topic_enc"] = le_topic.fit_transform(df["topic"])
    #
    # # Feature: year + subject → predict topic (high or low frequency)
    # X = df[["subject_enc", "year", "frequency"]]
    # y = (df["frequency"] >= df["frequency"].median()).astype(int)  # binary: high/low
    #
    # X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    #
    # clf = RandomForestClassifier(n_estimators=100, random_state=42)
    # clf.fit(X_train, y_train)
    #
    # preds = clf.predict(X_test)
    # print(classification_report(y_test, preds))
    #
    # # Save model and encoders
    # model_data = {
    #     "model": clf,
    #     "le_subject": le_subject,
    #     "le_topic": le_topic,
    # }
    # with open(os.path.join(OUTPUT_DIR, "predictor.pkl"), "wb") as f:
    #     pickle.dump(model_data, f)
    #
    # print(f"[DONE] Predictor saved to {OUTPUT_DIR}/predictor.pkl")

    print("[PLACEHOLDER] Topic predictor training script ready.")
    print(f"               Input:  {DATASET_PATH}")
    print(f"               Output: {OUTPUT_DIR}")
    print("               Uncomment the code above after you have frequency data.")


if __name__ == "__main__":
    train()
