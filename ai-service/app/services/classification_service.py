"""
Classification Service – classifies questions into subject/topic categories.

Initial approach: keyword matching with a topic taxonomy.
Upgrade path: zero-shot classification using facebook/bart-large-mnli.
"""

from typing import Dict, Any

# ── Simple Topic Taxonomy ──────────────────────────────────────────────────────
# TODO: Expand this taxonomy with your actual subject domains.
# TODO: Replace with ML-based classification once you have labelled data.

TOPIC_TAXONOMY = {
    "Physics": {
        "Kinematics": ["velocity", "acceleration", "displacement", "motion", "projectile"],
        "Newton's Laws": ["force", "newton", "mass", "inertia", "friction"],
        "Thermodynamics": ["heat", "temperature", "entropy", "thermal", "energy"],
        "Waves": ["wave", "frequency", "amplitude", "wavelength", "oscillation"],
        "Electrostatics": ["electric", "charge", "coulomb", "field", "potential"],
        "Optics": ["light", "lens", "refraction", "reflection", "mirror"],
    },
    "Mathematics": {
        "Calculus": ["derivative", "integral", "limit", "differentiate", "integrate"],
        "Algebra": ["equation", "polynomial", "matrix", "variable", "quadratic"],
        "Statistics": ["probability", "distribution", "mean", "variance", "standard deviation"],
        "Geometry": ["triangle", "circle", "angle", "area", "perimeter"],
    },
    "Chemistry": {
        "Organic Chemistry": ["organic", "hydrocarbon", "carbon", "functional group", "polymer"],
        "Thermochemistry": ["enthalpy", "gibbs", "reaction", "endothermic", "exothermic"],
        "Electrochemistry": ["electrode", "electrolysis", "cell", "redox", "oxidation"],
    },
}


def classify_question(question_text: str) -> Dict[str, Any]:
    """
    Classify a question into subject and topic using keyword matching.

    Args:
        question_text: The question text to classify

    Returns:
        Dict with subject, topic, and confidence keys
    """
    question_lower = question_text.lower()
    best_subject = "General"
    best_topic = "Unknown"
    best_score = 0

    for subject, topics in TOPIC_TAXONOMY.items():
        for topic, keywords in topics.items():
            score = sum(1 for kw in keywords if kw in question_lower)
            if score > best_score:
                best_score = score
                best_subject = subject
                best_topic = topic

    confidence = min(best_score / 3.0, 1.0) if best_score > 0 else 0.1

    # TODO: Upgrade to zero-shot ML classification:
    # from transformers import pipeline
    # classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")
    # candidate_labels = [f"{s}:{t}" for s, topics in TOPIC_TAXONOMY.items() for t in topics]
    # result = classifier(question_text, candidate_labels)
    # best_label = result["labels"][0]
    # confidence = result["scores"][0]
    # best_subject, best_topic = best_label.split(":")

    return {
        "subject": best_subject,
        "topic": best_topic,
        "confidence": round(confidence, 4),
    }
