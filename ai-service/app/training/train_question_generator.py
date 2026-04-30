"""
train_question_generator.py
───────────────────────────
Fine-tune FLAN-T5-small on educational Q&A data to generate questions from context.

Training data format expected in: app/data/processed/training_dataset.csv
CSV columns: context, question, answer

Run:
    python app/training/train_question_generator.py

Output model saved to: app/models/question_generator/
"""

import os
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

# ── Configuration ─────────────────────────────────────────────────────────────

BASE_MODEL = "google/flan-t5-small"
DATASET_PATH = "./app/data/processed/training_dataset.csv"
OUTPUT_DIR = "./app/models/question_generator"
NUM_EPOCHS = 3
BATCH_SIZE = 8
LEARNING_RATE = 5e-4
MAX_INPUT_LENGTH = 512
MAX_TARGET_LENGTH = 128


def prepare_input(row):
    """Format training example for FLAN-T5 question generation task."""
    return f"generate question: context: {row['context']} answer: {row['answer']}"


def train():
    """
    Fine-tune FLAN-T5-small for question generation.

    TODO: Uncomment the training code below once you have:
    1. Populated app/data/raw/ with your educational PDFs/documents
    2. Run prepare_dataset.py to generate training_dataset.csv
    3. Installed all requirements: pip install -r requirements.txt
    """

    # ── Load Dataset ──────────────────────────────────────────────────────────
    if not os.path.exists(DATASET_PATH):
        print(f"[ERROR] Dataset not found at {DATASET_PATH}")
        print("Please run: python app/training/prepare_dataset.py first")
        return

    df = pd.read_csv(DATASET_PATH)
    print(f"[INFO] Loaded {len(df)} training examples")

    # ── TODO: Uncomment and run after dataset is ready ────────────────────────
    # from transformers import (
    #     T5ForConditionalGeneration,
    #     T5Tokenizer,
    #     Seq2SeqTrainer,
    #     Seq2SeqTrainingArguments,
    #     DataCollatorForSeq2Seq,
    # )
    # from datasets import Dataset
    # import torch
    #
    # tokenizer = T5Tokenizer.from_pretrained(BASE_MODEL)
    # model = T5ForConditionalGeneration.from_pretrained(BASE_MODEL)
    #
    # def tokenize(examples):
    #     inputs = tokenizer(
    #         examples["input_text"],
    #         max_length=MAX_INPUT_LENGTH,
    #         truncation=True,
    #         padding="max_length",
    #     )
    #     targets = tokenizer(
    #         examples["question"],
    #         max_length=MAX_TARGET_LENGTH,
    #         truncation=True,
    #         padding="max_length",
    #     )
    #     inputs["labels"] = targets["input_ids"]
    #     return inputs
    #
    # df["input_text"] = df.apply(prepare_input, axis=1)
    # dataset = Dataset.from_pandas(df[["input_text", "question"]])
    # tokenized = dataset.map(tokenize, batched=True)
    #
    # training_args = Seq2SeqTrainingArguments(
    #     output_dir=OUTPUT_DIR,
    #     num_train_epochs=NUM_EPOCHS,
    #     per_device_train_batch_size=BATCH_SIZE,
    #     learning_rate=LEARNING_RATE,
    #     save_total_limit=2,
    #     predict_with_generate=True,
    #     logging_steps=50,
    #     save_strategy="epoch",
    # )
    #
    # data_collator = DataCollatorForSeq2Seq(tokenizer, model=model)
    #
    # trainer = Seq2SeqTrainer(
    #     model=model,
    #     args=training_args,
    #     train_dataset=tokenized,
    #     tokenizer=tokenizer,
    #     data_collator=data_collator,
    # )
    #
    # print("[INFO] Starting fine-tuning...")
    # trainer.train()
    #
    # print(f"[INFO] Saving model to {OUTPUT_DIR}")
    # model.save_pretrained(OUTPUT_DIR)
    # tokenizer.save_pretrained(OUTPUT_DIR)
    # print("[DONE] Training complete!")

    print("[PLACEHOLDER] Training code is ready. Uncomment after dataset preparation.")
    print(f"               Dataset path: {DATASET_PATH}")
    print(f"               Output path:  {OUTPUT_DIR}")


if __name__ == "__main__":
    train()
