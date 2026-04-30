"""
prepare_dataset.py
──────────────────
Prepare training data for FLAN-T5 question generation fine-tuning.

Input:  app/data/raw/  (place your educational PDFs / Q&A text files here)
Output: app/data/processed/training_dataset.csv

Expected output CSV columns:
    context   – the source passage/paragraph
    question  – the target question
    answer    – the expected answer

Run:
    python app/training/prepare_dataset.py
"""

import os
import csv
import glob

RAW_DIR = "./app/data/raw"
PROCESSED_DIR = "./app/data/processed"
OUTPUT_FILE = os.path.join(PROCESSED_DIR, "training_dataset.csv")


def load_raw_files():
    """
    Load raw Q&A files from the raw data directory.
    
    TODO: Implement actual file loading based on your raw data format:
    - If using PDF files: integrate with ocr_service.py to extract text
    - If using CSV/JSON: parse directly
    - If using text files: split by question/answer delimiters
    """
    print(f"[INFO] Scanning {RAW_DIR} for raw data files...")
    files = glob.glob(os.path.join(RAW_DIR, "**", "*"), recursive=True)
    print(f"[INFO] Found {len(files)} files")
    return files


def extract_qa_pairs(file_path):
    """
    Extract (context, question, answer) tuples from a raw file.
    
    TODO: Implement based on your actual raw data format.
    Example formats:
    - Past year exam PDF: use OCR → parse questions
    - Q&A CSV: read directly
    - Annotated text: regex extraction
    """
    # TODO: Replace with actual extraction logic
    # Example placeholder:
    return [
        {
            "context": "Sample educational context about the topic.",
            "question": "What is the main concept described above?",
            "answer": "The main concept is the educational topic.",
        }
    ]


def prepare():
    os.makedirs(PROCESSED_DIR, exist_ok=True)
    
    raw_files = load_raw_files()
    all_pairs = []
    
    for f in raw_files:
        if os.path.isfile(f):
            pairs = extract_qa_pairs(f)
            all_pairs.extend(pairs)
            print(f"[INFO] Extracted {len(pairs)} Q&A pairs from {os.path.basename(f)}")
    
    print(f"[INFO] Total Q&A pairs: {len(all_pairs)}")
    
    if not all_pairs:
        print("[WARN] No Q&A pairs found. Place raw data files in app/data/raw/ first.")
        return
    
    # Write to CSV
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=["context", "question", "answer"])
        writer.writeheader()
        writer.writerows(all_pairs)
    
    print(f"[DONE] Dataset saved to {OUTPUT_FILE}")
    print(f"       Next step: python app/training/train_question_generator.py")


if __name__ == "__main__":
    prepare()
