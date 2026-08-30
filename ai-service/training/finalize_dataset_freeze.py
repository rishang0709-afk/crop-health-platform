import os
import json
import datetime
import pandas as pd
from PIL import Image

# 1. CANONICAL FROZEN CLASS ORDER
CLASS_INDEX = {
    0: "background",
    1: "potato_early_blight",
    2: "potato_healthy",
    3: "potato_late_blight",
    4: "tomato_early_blight",
    5: "tomato_healthy",
    6: "tomato_late_blight"
}
CLASS_TO_INDEX = {v: k for k, v in CLASS_INDEX.items()}

def main():
    print("==================================================")
    print("PHASE 2F: FINAL COMBINED DATASET FREEZE & VALIDATION")
    print("==================================================")
    
    os.makedirs("data/manifests", exist_ok=True)
    os.makedirs("training", exist_ok=True)
    
    # 1. Save Class Mapping
    class_mapping_path = "training/class_mapping.json"
    with open(class_mapping_path, "w") as f:
        json.dump({
            "index_to_class": CLASS_INDEX,
            "class_to_index": CLASS_TO_INDEX,
            "num_classes": len(CLASS_INDEX)
        }, f, indent=2)
    print(f"Class mapping saved to {class_mapping_path}")
    
    # 2. Load Frozen Manifests
    pv_manifest_path = "data/manifests/dataset_manifest.csv"
    bg_manifest_path = "data/manifests/background_manifest.csv"
    pd_clean_manifest_path = "data/manifests/plantdoc_clean_eval_manifest.csv"
    
    assert os.path.exists(pv_manifest_path), "PlantVillage manifest missing!"
    assert os.path.exists(bg_manifest_path), "COCO background manifest missing!"
    assert os.path.exists(pd_clean_manifest_path), "PlantDoc clean manifest missing!"
    
    df_pv = pd.read_csv(pv_manifest_path)
    df_bg = pd.read_csv(bg_manifest_path)
    df_pd = pd.read_csv(pd_clean_manifest_path)
    
    print(f"\nLoaded frozen source datasets:")
    print(f"  PlantVillage: {len(df_pv)} images")
    print(f"  COCO Background: {len(df_bg)} images")
    print(f"  PlantDoc Clean Eval: {len(df_pd)} images")
    
    assert len(df_pv) == 6637, f"Expected 6637 PlantVillage images, got {len(df_pv)}"
    assert len(df_bg) == 750, f"Expected 750 COCO background images, got {len(df_bg)}"
    assert len(df_pd) == 448, f"Expected 448 PlantDoc clean eval images, got {len(df_pd)}"
    
    # 3. Build Combined Training Manifest (PlantVillage + COCO)
    # Ensure columns match
    req_cols = ["id", "source", "original_path", "raw_label", "canonical_class", "domain", "split", "sha256", "phash", "duplicate_cluster", "source_group_id"]
    df_training = pd.concat([df_pv[req_cols], df_bg[req_cols]], ignore_index=True)
    
    training_manifest_path = "data/manifests/training_manifest.csv"
    df_training.to_csv(training_manifest_path, index=False)
    print(f"\nCombined training manifest written to {training_manifest_path} ({len(df_training)} total rows)")
    
    # 4. Build Field Evaluation Manifest
    field_cols = ["id", "source", "original_path", "raw_label", "canonical_class", "domain", "sha256", "phash", "duplicate_cluster", "source_group_id", "label_status", "quality_status", "audit_notes", "purpose"]
    field_eval_manifest_path = "data/manifests/field_eval_manifest.csv"
    df_pd[field_cols].to_csv(field_eval_manifest_path, index=False)
    print(f"Field evaluation manifest written to {field_eval_manifest_path} ({len(df_pd)} total rows)")
    
    # 5. Dataset Validation & Integrity Checks
    print("\n--- Validating Files & Hashes ---")
    all_training_paths = list(df_training['original_path'])
    all_field_paths = list(df_pd['original_path'])
    
    for p in all_training_paths + all_field_paths:
        assert os.path.exists(p), f"File does not exist: {p}"
        assert os.path.getsize(p) > 0, f"Zero byte file: {p}"
        with Image.open(p) as img:
            img.verify()
    print("All 7,835 referenced image files exist, have non-zero size, and decode cleanly via PIL.")
    
    # 6. Cross-Dataset Duplicate & Leakage Checks
    pv_sha = set(df_pv['sha256'])
    bg_sha = set(df_bg['sha256'])
    pd_sha = set(df_pd['sha256'])
    
    # Cross-source checks
    pv_bg_match = pv_sha & bg_sha
    pv_pd_match = pv_sha & pd_sha
    bg_pd_match = bg_sha & pd_sha
    
    assert len(pv_bg_match) == 0, f"Overlap between PlantVillage and COCO: {pv_bg_match}"
    assert len(pv_pd_match) == 0, f"Overlap between PlantVillage and PlantDoc: {pv_pd_match}"
    assert len(bg_pd_match) == 0, f"Overlap between COCO and PlantDoc: {bg_pd_match}"
    print("Cross-dataset SHA256 overlap check: Exactly 0 overlapping images.")
    
    # Split leakage checks within training manifest
    sha_splits = df_training.groupby('sha256')['split'].nunique()
    assert (sha_splits == 1).all(), "SHA256 duplicate crosses train/val/test splits!"
    
    pv_sg_splits = df_pv.groupby('source_group_id')['split'].nunique()
    assert (pv_sg_splits == 1).all(), "PlantVillage leaf group crosses train/val/test splits!"
    print("Split leakage checks: PASSED (0 source_group_id cross-split, 0 SHA256 cross-split).")
    
    # Check that PlantDoc never appears in training manifest
    training_sha = set(df_training['sha256'])
    train_pd_overlap = training_sha & pd_sha
    assert len(train_pd_overlap) == 0, "PlantDoc image found in training manifest!"
    print("PlantDoc isolation check: PASSED (0 PlantDoc images in training manifest).")
    
    # 7. Summary Tables & Class Counts
    print("\n--- Training Manifest Split Summary ---")
    split_summary = df_training['split'].value_counts()
    print(split_summary)
    
    print("\n--- Per-Class Train / Val / Test Distribution (training_manifest.csv) ---")
    class_split_table = df_training.groupby(['canonical_class', 'split']).size().unstack(fill_value=0)
    class_split_table['total'] = class_split_table.sum(axis=1)
    class_split_table = class_split_table.reindex([CLASS_INDEX[i] for i in range(7)])
    print(class_split_table[['train', 'val', 'test', 'total']])
    
    print("\n--- PlantDoc Clean Field Evaluation Distribution (field_eval_manifest.csv) ---")
    pd_table = df_pd.groupby('canonical_class').size()
    print(pd_table)
    
    # 8. Class Imbalance Analysis
    train_counts = class_split_table['train']
    largest_class = train_counts.idxmax()
    largest_count = train_counts.max()
    smallest_class = train_counts.idxmin()
    smallest_count = train_counts.min()
    imbalance_ratio = largest_count / smallest_count
    
    print(f"\n--- Class Imbalance in Training Set ---")
    print(f"  Largest class: '{largest_class}' with {largest_count} images")
    print(f"  Smallest class: '{smallest_class}' with {smallest_count} images")
    print(f"  Imbalance ratio (max/min): {imbalance_ratio:.2f}:1")
    
    # 9. Write Dataset Freeze Metadata JSON
    freeze_meta = {
        "dataset_version": "crop-health-v1",
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "class_mapping": {
            "index_to_class": CLASS_INDEX,
            "class_to_index": CLASS_TO_INDEX,
            "num_classes": 7
        },
        "manifests": {
            "training_manifest_path": "data/manifests/training_manifest.csv",
            "field_eval_manifest_path": "data/manifests/field_eval_manifest.csv",
            "plantvillage_manifest_path": "data/manifests/dataset_manifest.csv",
            "coco_background_manifest_path": "data/manifests/background_manifest.csv",
            "plantdoc_clean_manifest_path": "data/manifests/plantdoc_clean_eval_manifest.csv"
        },
        "counts": {
            "total_supervised_development": len(df_training),
            "train_count": int(split_summary.get('train', 0)),
            "val_count": int(split_summary.get('val', 0)),
            "controlled_test_count": int(split_summary.get('test', 0)),
            "field_eval_count": len(df_pd)
        },
        "sources": {
            "plantvillage": {
                "count": 6637,
                "domain": "controlled",
                "purpose": "model_development (train/val/controlled_test)",
                "classes": 6
            },
            "coco2017": {
                "count": 750,
                "domain": "negative",
                "purpose": "background_rejection (train/val/controlled_test)",
                "classes": 1
            },
            "plantdoc": {
                "count": 448,
                "domain": "field",
                "purpose": "held_out_field_evaluation",
                "classes": 5,
                "limitation": "potato_healthy absent (0 images)"
            }
        },
        "split_policy": {
            "target_ratio": "70% TRAIN / 15% VAL / 15% TEST",
            "group_isolation": "Strict leaf-level (source_group_id) and exact SHA256 isolation",
            "field_evaluation_isolation": "100% held-out; no field data in training"
        },
        "notes": "Dataset frozen and validated. Clean data ready for Phase 3 model architecture and training planning."
    }
    
    freeze_json_path = "data/manifests/dataset_freeze.json"
    with open(freeze_json_path, "w") as f:
        json.dump(freeze_meta, f, indent=2)
    print(f"\nDataset freeze metadata written to {freeze_json_path}")
    print("\nDATASET FREEZE AND VALIDATION COMPLETED SUCCESSFULLY.")

if __name__ == "__main__":
    main()
