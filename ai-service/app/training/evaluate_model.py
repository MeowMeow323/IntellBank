"""
evaluate_model.py
─────────────────
Evaluate the fine-tuned FLAN-T5-small question generator using ROUGE metrics.

Run after training:
    python app/training/evaluate_model.py

Metrics reported:
    ROUGE-1, ROUGE-2, ROUGE-L
"""

import os
from dotenv import load_dotenv

load_dotenv()

MODEL_PATH = os.getenv("HUGGINGFACE_MODEL_PATH", "./app/models/question_generator")
DATASET_PATH = "./app/data/processed/training_dataset.csv"


def evaluate():
    """
    Load the trained model and evaluate on a hold-out test split.
    
    TODO: Uncomment after model training is complete.
    """
    if not os.path.exists(MODEL_PATH):
        print(f"[ERROR] Model not found at {MODEL_PATH}")
        print("Please run: python app/training/train_question_generator.py first")
        return

    # TODO: Uncomment evaluation code after training:
    #
    # import pandas as pd
    # import evaluate as hf_evaluate
    # from transformers import T5ForConditionalGeneration, T5Tokenizer
    # import torch
    #
    # print(f"[INFO] Loading model from {MODEL_PATH}")
    # tokenizer = T5Tokenizer.from_pretrained(MODEL_PATH)
    # model = T5ForConditionalGeneration.from_pretrained(MODEL_PATH)
    # model.eval()
    #
    # df = pd.read_csv(DATASET_PATH)
    # test_df = df.sample(frac=0.1, random_state=42)  # 10% for evaluation
    #
    # rouge = hf_evaluate.load("rouge")
    # predictions = []
    # references = []
    #
    # for _, row in test_df.iterrows():
    #     prompt = f"generate question: context: {row['context']} answer: {row['answer']}"
    #     inputs = tokenizer(prompt, return_tensors="pt", max_length=512, truncation=True)
    #     with torch.no_grad():
    #         outputs = model.generate(inputs.input_ids, max_length=128)
    #     pred = tokenizer.decode(outputs[0], skip_special_tokens=True)
    #     predictions.append(pred)
    #     references.append(row["question"])
    #
    # results = rouge.compute(predictions=predictions, references=references)
    # print("\n=== ROUGE Evaluation Results ===")
    # for metric, score in results.items():
    #     print(f"  {metric}: {score:.4f}")
    # print("================================\n")

    print("[PLACEHOLDER] Evaluation script ready.")
    print(f"               Model path:   {MODEL_PATH}")
    print(f"               Dataset path: {DATASET_PATH}")
    print("               Uncomment the code above after training.")


if __name__ == "__main__":
    evaluate()
