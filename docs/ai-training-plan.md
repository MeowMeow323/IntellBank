# IntellBank – AI Training Plan

## Overview

The AI service uses fine-tuned models for:
1. **Question Generation** – Fine-tuned FLAN-T5-small on educational Q&A datasets
2. **Topic Classification** – Classifies questions into subject/topic categories
3. **Topic Prediction** – Predicts which topics are likely to appear in future exams
4. **OCR / Text Extraction** – Extracts text from uploaded documents

---

## 1. Question Generator (FLAN-T5-small)

### Model Choice
- **Base Model**: `google/flan-t5-small` (Hugging Face)
- **Task**: Sequence-to-sequence generation
- **Fine-tuning Framework**: Hugging Face `transformers` + `datasets`

### Training Data Format
```csv
context,question,answer
"Newton's first law states that an object in motion stays in motion...",
"What does Newton's first law state?",
"An object in motion stays in motion unless acted upon by an external force."
```

### Training Steps
1. Place raw educational PDFs or Q&A CSV files in `ai-service/app/data/raw/`
2. Run `prepare_dataset.py` to produce `training_dataset.csv`
3. Run `train_question_generator.py` to fine-tune FLAN-T5-small
4. Model is saved to `ai-service/app/models/question_generator/`
5. Run `evaluate_model.py` to check ROUGE scores

### Training Command
```bash
cd ai-service
python app/training/train_question_generator.py
```

---

## 2. Topic Predictor

### Model Choice
- **Approach**: Time-series pattern analysis using historical topic frequency data
- **Framework**: scikit-learn (initial) → can upgrade to Prophet / LSTM

### Training Steps
1. Populate `topic_frequency` table with historical past-year exam data
2. Export data to `ai-service/app/data/processed/topic_freq.csv`
3. Run `train_topic_predictor.py` to train the prediction model
4. Model is saved to `ai-service/app/models/topic_predictor/`

### Training Command
```bash
python app/training/train_topic_predictor.py
```

---

## 3. OCR Service

### Approach
- Use `pytesseract` (Tesseract OCR) for image-based documents
- Use `PyMuPDF` (fitz) for PDF text extraction
- Return extracted text blocks and page numbers

---

## 4. Classification Service

### Approach
- Initial: keyword matching with a topic taxonomy
- Upgrade: zero-shot classification using `facebook/bart-large-mnli`
- Input: question text
- Output: `{ "subject": "Physics", "topic": "Newton's Laws", "confidence": 0.87 }`

---

## 5. Model Files Location

```
ai-service/
└── app/
    └── models/
        ├── question_generator/    ← saved FLAN-T5-small fine-tuned weights
        └── topic_predictor/       ← saved scikit-learn/pickle model
```

> ⚠️ These directories are .gitignored. Do NOT commit model weights to Git.
> Host them on Hugging Face Hub or a private S3 bucket for deployment.

---

## 6. Evaluation Metrics

| Model | Metrics |
|-------|---------|
| Question Generator | ROUGE-1, ROUGE-2, ROUGE-L |
| Topic Predictor | Accuracy, F1, Precision, Recall |
| Classifier | Top-1 Accuracy, Top-3 Accuracy |

---

## 7. Future Improvements

- Increase training data size with actual past-year exam papers
- Experiment with larger FLAN-T5-base or FLAN-T5-large
- Implement RLHF (Reinforcement Learning from Human Feedback) loop using educator verification data
- Add multilingual support for non-English subjects
