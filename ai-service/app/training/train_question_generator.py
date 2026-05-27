"""
train_question_generator.py
===========================
Dataset checking, validation, and fine-tuning for the IntellBank Question Generator.

Usage:
    # Validate the dataset and run training
    python app/training/train_question_generator.py
    
    # Or run only validation:
    python app/training/train_question_generator.py --check-only
"""

import os
import sys
import argparse
import pandas as pd
from dotenv import load_dotenv

# === ML & Transformers Imports ================================================
from sklearn.model_selection import train_test_split
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSeq2SeqLM,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    DataCollatorForSeq2Seq,
)

# === Load Global Environment Variables =========================================
load_dotenv()

# === Paths ====================================================================
BASE_DIR     = os.path.dirname(__file__)
DATASET_PATH = os.path.abspath(os.path.join(BASE_DIR, "..", "data", "training_dataset.csv"))
MODEL_PATH   = os.path.abspath(os.path.join(BASE_DIR, "..", "models", "question_generator", "flan-t5-intellbank"))

# The pretrained base model to fine-tune
BASE_MODEL = "google/flan-t5-small"

# === Training Hyperparameters =================================================
EPOCHS         = 10       # Keep small for laptop development; increase later
BATCH_SIZE     = 4        # Kept small for CPU/laptop memory
LEARNING_RATE  = 5e-4
MAX_INPUT_LEN  = 128
MAX_TARGET_LEN = 256
TEST_SPLIT     = 0.15     # 15% held out for evaluation


def check_dataset() -> bool:
    """Validate that the training CSV dataset is present, clean, and well-formed."""
    print("\n" + "=" * 60)
    print("  [STEP 1] Dataset Validation")
    print("=" * 60)
    print(f"Loading dataset from: {DATASET_PATH}\n")

    if not os.path.exists(DATASET_PATH):
        print("[ERROR] training_dataset.csv not found!")
        print(f"Please run the OCR dataset tool or ensure your dataset is placed at: {DATASET_PATH}")
        return False

    try:
        df = pd.read_csv(DATASET_PATH)
    except Exception as e:
        print(f"[ERROR] Failed to parse CSV file: {e}")
        return False

    df = df.dropna(how="all")  # Remove completely blank rows

    print(f"[OK] Total rows loaded: {len(df)}")
    print(f"   Columns found: {list(df.columns)}")

    required_cols = ["subject", "topic", "difficulty", "marks", "year", "input_text", "target_text"]
    missing_cols = [c for c in required_cols if c not in df.columns]
    
    if missing_cols:
        print(f"[ERROR] Missing required columns: {missing_cols}")
        return False
    print("[OK] All required columns present.")

    # Check for empty input_text or target_text
    empty_input = df["input_text"].isna() | (df["input_text"].astype(str).str.strip() == "")
    empty_target = df["target_text"].isna() | (df["target_text"].astype(str).str.strip() == "")

    if empty_input.any():
        print(f"[WARN] Found {empty_input.sum()} row(s) with empty 'input_text'!")
    else:
        print("[OK] No empty 'input_text' found.")

    if empty_target.any():
        print(f"[WARN] Found {empty_target.sum()} row(s) with empty 'target_text'!")
    else:
        print("[OK] No empty 'target_text' found.")

    # Print summary statistics
    df["input_len"] = df["input_text"].astype(str).str.len()
    df["target_len"] = df["target_text"].astype(str).str.len()
    
    print("\n-- Character Length Summary stats --")
    print(df[["input_len", "target_len"]].describe().round(1).to_string())

    print("\n-- Subject Counts --")
    print(df["subject"].value_counts().to_string())

    print("\n-- Difficulty Counts --")
    print(df["difficulty"].value_counts().to_string())

    print("\n[OK] Dataset check complete.")
    return True


def tokenize(batch, tokenizer):
    """Tokenize dataset batches for Seq2Seq learning."""
    model_inputs = tokenizer(
        batch["input_text"],
        max_length=MAX_INPUT_LEN,
        padding="max_length",
        truncation=True,
    )
    labels = tokenizer(
        batch["target_text"],
        max_length=MAX_TARGET_LEN,
        padding="max_length",
        truncation=True,
    )
    # Replace padding token ids with -100 so loss function ignores them
    model_inputs["labels"] = [
        [(t if t != tokenizer.pad_token_id else -100) for t in label]
        for label in labels["input_ids"]
    ]
    return model_inputs


def train_model():
    """Fine-tune the FLAN-T5-small model on the training dataset."""
    print("\n" + "=" * 60)
    print("  [STEP 2] Model Training & Fine-Tuning")
    print("=" * 60)

    # 1. Verify dataset first
    if not os.path.exists(DATASET_PATH):
        print(f"[ERROR] Dataset not found at {DATASET_PATH}. Cannot train.")
        return

    print(f"Loading and splitting dataset...")
    df = pd.read_csv(DATASET_PATH).dropna(how="all")
    df = df[["input_text", "target_text"]].dropna()
    df = df[df["input_text"].astype(str).str.strip() != ""]
    df = df[df["target_text"].astype(str).str.strip() != ""]
    df = df.reset_index(drop=True)

    print(f"  {len(df)} valid training samples found.")
    
    train_df, test_df = train_test_split(df, test_size=TEST_SPLIT, random_state=42)
    train_dataset = Dataset.from_pandas(train_df.reset_index(drop=True))
    test_dataset = Dataset.from_pandas(test_df.reset_index(drop=True))

    print(f"Loading base model and tokenizer: {BASE_MODEL}...")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    model = AutoModelForSeq2SeqLM.from_pretrained(BASE_MODEL)
    
    # Assert not None to satisfy static analysis type-narrowing
    assert tokenizer is not None, "Failed to load tokenizer"
    assert model is not None, "Failed to load base model"
    print("  Base model successfully loaded.")

    print("Tokenizing datasets...")
    tokenize_fn = lambda batch: tokenize(batch, tokenizer)
    train_tokenized = train_dataset.map(tokenize_fn, batched=True, remove_columns=["input_text", "target_text"])
    test_tokenized = test_dataset.map(tokenize_fn, batched=True, remove_columns=["input_text", "target_text"])
    
    # Assert isinstance to satisfy static analysis type-narrowing
    assert isinstance(train_tokenized, Dataset), "train_tokenized must be a Dataset"
    assert isinstance(test_tokenized, Dataset), "test_tokenized must be a Dataset"
    print("  Tokenization complete.")

    training_args = Seq2SeqTrainingArguments(
        output_dir=MODEL_PATH,
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        learning_rate=LEARNING_RATE,
        warmup_steps=10,
        weight_decay=0.01,
        logging_steps=5,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        predict_with_generate=True,
        fp16=False,
        report_to="none"
    )

    data_collator = DataCollatorForSeq2Seq(tokenizer=tokenizer, model=model, padding=True)

    print("Starting training (Seq2SeqTrainer)...")
    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=train_tokenized,
        # pyrefly: ignore [bad-argument-type]
        eval_dataset=test_tokenized,
        data_collator=data_collator,
    )

    trainer.train()
    print("\nTraining complete!")

    print(f"Saving fine-tuned model and tokenizer to: {MODEL_PATH}")
    os.makedirs(MODEL_PATH, exist_ok=True)
    model.save_pretrained(MODEL_PATH)
    tokenizer.save_pretrained(MODEL_PATH)
    print("[OK] Model saved successfully.")

    print("\nRunning final evaluation on test partition...")
    eval_results = trainer.evaluate()
    print(f"  Final Evaluation Loss: {eval_results.get('eval_loss', 'N/A'):.4f}")


def main():
    parser = argparse.ArgumentParser(
        description="Dataset checking and Model Training for the IntellBank FLAN-T5 Question Generator."
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Only validate and check the training CSV dataset without training"
    )
    args = parser.parse_args()

    if args.check_only:
        check_dataset()
    else:
        if check_dataset():
            train_model()


if __name__ == "__main__":
    main()
