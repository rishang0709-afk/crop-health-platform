import os
import pandas as pd
from PIL import Image

def validate_manifest(csv_path="data/manifests/dataset_manifest.csv"):
    df = pd.read_csv(csv_path)
    errors = []
    warnings = []
    
    print(f"Validating manifest: {csv_path}")
    print(f"Total rows: {len(df)}")
    
    # Check 1: Row count
    if len(df) != 6637:
        errors.append(f"Expected exactly 6637 usable rows for PlantVillage RGB subset, got {len(df)}")
        
    # Check 2: Missing columns
    expected_cols = ["id", "source", "original_path", "raw_label", "canonical_class", "domain", "split", "sha256", "phash", "duplicate_cluster", "source_group_id"]
    for col in expected_cols:
        if col not in df.columns:
            errors.append(f"Missing column: {col}")
            
    # Check 3: No mock rows
    if (df['source'] == 'mock').any() or (df['domain'] == 'mock').any():
        errors.append("Mock data found in manifest!")
        
    # Check 4: Source & Domain values
    valid_sources = {"plantvillage_hf", "plantvillage", "plantdoc", "coco"}
    invalid_sources = set(df['source'].unique()) - valid_sources
    if invalid_sources:
        errors.append(f"Invalid sources found: {invalid_sources}")
        
    valid_domains = {"controlled", "field", "non_plant"}
    invalid_domains = set(df['domain'].unique()) - valid_domains
    if invalid_domains:
        errors.append(f"Invalid domains found: {invalid_domains}")
        
    # Check 5: Canonical classes
    required_classes = {
        "tomato_healthy", "tomato_early_blight", "tomato_late_blight", 
        "potato_healthy", "potato_early_blight", "potato_late_blight"
    }
    manifest_classes = set(df['canonical_class'].unique())
    missing_classes = required_classes - manifest_classes
    if missing_classes:
        errors.append(f"Missing required classes: {missing_classes}")
        
    # Check 6: Splits per class (train > 0, val > 0, test > 0)
    split_class_counts = df.groupby(['canonical_class', 'split']).size().unstack(fill_value=0)
    for c in required_classes:
        if c in split_class_counts.index:
            for s in ['train', 'val', 'test']:
                cnt = split_class_counts.loc[c].get(s, 0)
                if cnt == 0:
                    errors.append(f"Class '{c}' has 0 samples in '{s}' split!")
                    
    # Check 7: No source_group_id spanning multiple splits (HARD CONSTRAINT)
    if 'source_group_id' in df.columns:
        sg_splits = df.groupby('source_group_id')['split'].nunique()
        leaking_sg = sg_splits[sg_splits > 1]
        if len(leaking_sg) > 0:
            errors.append(f"Hard leakage failure: {len(leaking_sg)} source_group_ids span multiple splits!")
            
    # Check 8: No SHA256 spanning multiple splits (HARD CONSTRAINT)
    sha_splits = df.groupby('sha256')['split'].nunique()
    leaking_sha = sha_splits[sha_splits > 1]
    if len(leaking_sha) > 0:
        errors.append(f"Hard leakage failure: {len(leaking_sha)} SHA256 hashes span multiple splits!")
        
    # Check 9: File existence and decoding check (sample or all)
    print("Verifying image files exist and decode...")
    missing_files = 0
    decode_errors = 0
    for path in df['original_path']:
        if not os.path.exists(path):
            missing_files += 1
        else:
            try:
                with Image.open(path) as img:
                    img.verify()
            except Exception:
                decode_errors += 1
                
    if missing_files > 0:
        errors.append(f"{missing_files} files in manifest do not exist on disk!")
    if decode_errors > 0:
        errors.append(f"{decode_errors} files in manifest failed PIL image decode verification!")
        
    # Audit Check: pHash duplicate_cluster spanning splits (AUDIT ONLY)
    if 'duplicate_cluster' in df.columns:
        cluster_splits = df.groupby('duplicate_cluster')['split'].nunique()
        leaking_clusters = cluster_splits[cluster_splits > 1]
        if len(leaking_clusters) > 0:
            warnings.append(f"pHash Audit Signal: {len(leaking_clusters)} duplicate_clusters span multiple splits (provisional audit only).")
            
    # Report Results
    if warnings:
        print("\nAUDIT WARNINGS (Non-fatal):")
        for w in warnings:
            print(f"  [AUDIT] {w}")
            
    if errors:
        print("\nMANIFEST VALIDATION FAILED:")
        for e in errors:
            print(f"  [ERROR] {e}")
        return False
        
    print("\nMANIFEST VALIDATION PASSED. Data is clean and ready for training.")
    return True

if __name__ == "__main__":
    validate_manifest("data/manifests/dataset_manifest.csv")

