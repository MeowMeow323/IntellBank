"""
train_topic_predictor.py
========================
Trains a simple KMeans clustering model over the dataset to extract the top topics
for each subject and generates a JSON knowledge base for the Prediction Service.
"""

import os
import json
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans

BASE_DIR = os.path.dirname(__file__)
DATASET_PATH = os.path.abspath(os.path.join(BASE_DIR, "..", "data", "training_dataset.csv"))
MODEL_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "models", "topic_predictor"))
JSON_OUTPUT = os.path.join(MODEL_DIR, "topic_predictions.json")

CLUSTERS_PER_SUBJECT = 5

def train_clustering():
    print(f"Loading dataset: {DATASET_PATH}")
    if not os.path.exists(DATASET_PATH):
        print(f"[ERROR] Dataset not found.")
        return

    df = pd.read_csv(DATASET_PATH)
    
    # Drop rows without text or subject
    df = df.dropna(subset=['target_text', 'subject', 'year'])
    df['target_text'] = df['target_text'].astype(str)
    
    subjects = df['subject'].unique()
    
    predictions_db = {}
    
    os.makedirs(MODEL_DIR, exist_ok=True)

    for subject in subjects:
        print(f"\nProcessing subject: {subject}")
        sub_df = df[df['subject'] == subject].copy()
        
        if len(sub_df) < CLUSTERS_PER_SUBJECT:
            print(f"  [WARN] Not enough data for {subject} to form {CLUSTERS_PER_SUBJECT} clusters. Skipping.")
            continue
            
        vectorizer = TfidfVectorizer(stop_words='english', max_features=1000)
        X = vectorizer.fit_transform(sub_df['target_text'])
        
        kmeans = KMeans(n_clusters=CLUSTERS_PER_SUBJECT, random_state=42)
        sub_df['cluster'] = kmeans.fit_predict(X)
        
        order_centroids = kmeans.cluster_centers_.argsort()[:, ::-1]
        terms = vectorizer.get_feature_names_out()
        
        latest_year = sub_df['year'].max()
        
        subject_topics = []
        for i in range(CLUSTERS_PER_SUBJECT):
            # Extract top 3 keywords to form a topic name
            top_terms = [terms[ind].capitalize() for ind in order_centroids[i, :3]]
            topic_name = " & ".join(top_terms)
            
            # Confidence is based on the size of the cluster (how prevalent it is)
            cluster_size = len(sub_df[sub_df['cluster'] == i])
            confidence = min(cluster_size / len(sub_df) * 3.0, 0.99)  # scale up for UI
            
            # Predict it's coming next year if it appeared in the most recent year
            appeared_recently = len(sub_df[(sub_df['cluster'] == i) & (sub_df['year'] == latest_year)]) > 0
            
            subject_topics.append({
                "topic": topic_name,
                "confidence": round(confidence, 2),
                "predicted_next_year": appeared_recently
            })
            
        # Sort by confidence descending
        subject_topics = sorted(subject_topics, key=lambda x: x['confidence'], reverse=True)
        predictions_db[subject] = subject_topics
        
        for t in subject_topics:
            print(f"  -> {t['topic']} (Conf: {t['confidence']}, NextYr: {t['predicted_next_year']})")
            
    print(f"\nSaving predictions knowledge base to: {JSON_OUTPUT}")
    with open(JSON_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(predictions_db, f, indent=4)
    print("[OK] Done.")

if __name__ == "__main__":
    train_clustering()
