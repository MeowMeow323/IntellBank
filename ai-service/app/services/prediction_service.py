"""
Prediction Service – predicts which topics are likely to appear in upcoming exams.

Initial approach: rule-based frequency analysis.
Upgrade path: scikit-learn time-series classifier or Prophet.
"""

import os
from typing import List, Dict, Any

# TODO: Load the trained topic predictor model once trained.
# MODEL_PATH = os.getenv("TOPIC_PREDICTOR_PATH", "./app/models/topic_predictor")

# ── Placeholder Topic Predictor ───────────────────────────────────────────────
# Replace with real predictions from the trained model.

PLACEHOLDER_PREDICTIONS = {
    "Physics": [
        {"topic": "Kinematics", "confidence": 0.87, "predicted_next_year": True},
        {"topic": "Thermodynamics", "confidence": 0.82, "predicted_next_year": True},
        {"topic": "Waves", "confidence": 0.74, "predicted_next_year": True},
        {"topic": "Electrostatics", "confidence": 0.65, "predicted_next_year": False},
    ],
    "Mathematics": [
        {"topic": "Calculus", "confidence": 0.91, "predicted_next_year": True},
        {"topic": "Statistics", "confidence": 0.78, "predicted_next_year": True},
        {"topic": "Algebra", "confidence": 0.70, "predicted_next_year": False},
    ],
    "Chemistry": [
        {"topic": "Organic Chemistry", "confidence": 0.83, "predicted_next_year": True},
        {"topic": "Thermochemistry", "confidence": 0.71, "predicted_next_year": True},
    ],
}


def predict_topics(subject: str, year: int = 2025) -> List[Dict[str, Any]]:
    """
    Predict topics likely to appear in the next exam for a given subject.

    Args:
        subject: Subject name to predict topics for
        year: Target year for prediction

    Returns:
        List of topic prediction dicts with confidence scores
    """
    # TODO: Load and use trained ML model:
    # import pickle
    # with open(os.path.join(MODEL_PATH, "predictor.pkl"), "rb") as f:
    #     model = pickle.load(f)
    # predictions = model.predict(subject=subject, target_year=year)
    # return predictions

    # Return placeholder predictions
    predictions = PLACEHOLDER_PREDICTIONS.get(subject, [
        {"topic": "General Topics", "confidence": 0.50, "predicted_next_year": True}
    ])
    return predictions
