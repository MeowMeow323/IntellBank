import os
import pandas as pd

def merge_datasets():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    generated_path = os.path.join(base_dir, "data", "generated_training_dataset.csv")
    main_path = os.path.join(base_dir, "data", "training_dataset.csv")

    if not os.path.exists(generated_path):
        print("[MERGE] No generated_training_dataset.csv found. Skipping merge.")
        return

    try:
        df_new = pd.read_csv(generated_path)
        if df_new.empty:
            print("[MERGE] Generated dataset is empty. Nothing to merge.")
        else:
            # Append without header to the main CSV
            df_new.to_csv(main_path, mode='a', header=False, index=False)
            print(f"[MERGE] Successfully merged {len(df_new)} new questions into training_dataset.csv!")
        
        # Cleanup
        os.remove(generated_path)
        print("[MERGE] Cleaned up temporary generated_training_dataset.csv")
    except Exception as e:
        print(f"[ERROR] Failed to merge datasets: {str(e)}")

if __name__ == "__main__":
    merge_datasets()
