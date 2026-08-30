import os
import pandas as pd
from PIL import Image
import numpy as np

def run_plantdoc_audit():
    manifest_path = "data/manifests/plantdoc_manifest.csv"
    df = pd.read_csv(manifest_path)
    
    # 1. Exact Duplicate Conflicts
    # 5 pairs of exact duplicates across potato early blight and late blight
    # Kept files that were part of exact cross-class conflicts:
    exact_conflicts_df = pd.read_csv("data/manifests/plantdoc_exact_duplicates.csv")
    exact_conflict_paths = set(exact_conflicts_df['kept_path']).union(set(exact_conflicts_df['dup_path']))
    
    # 2. Cross-Class pHash Clusters Review
    # 12 clusters confirmed SAME_IMAGE_OR_CROP across conflicting labels
    same_image_conflict_clusters = {
        "pd_cluster_103", "pd_cluster_11", "pd_cluster_169", "pd_cluster_170", 
        "pd_cluster_190", "pd_cluster_299", "pd_cluster_4", "pd_cluster_49", 
        "pd_cluster_60", "pd_cluster_70", "pd_cluster_75", "pd_cluster_95"
    }
    
    # 2 distinct clusters
    # pd_cluster_59, pd_cluster_62
    
    audited_rows = []
    
    for idx, row in df.iterrows():
        rec = row.to_dict()
        path = rec['original_path']
        c_class = rec['canonical_class']
        raw_lbl = rec['raw_label']
        cid = rec['duplicate_cluster']
        
        label_status = "accepted"
        quality_status = "good"
        notes = []
        
        # Check image properties
        with Image.open(path) as img:
            w, h = img.size
            ar = max(w/h, h/w)
            
        # Check 1: Exact duplicate cross-class conflict
        if path in exact_conflict_paths:
            label_status = "conflict"
            notes.append("Exact SHA256 duplicate cross-class conflict (scraped same image under multiple blight labels)")
            
        # Check 2: pHash same image cross-class conflict
        elif cid in same_image_conflict_clusters:
            label_status = "conflict"
            notes.append(f"pHash cross-class conflict in {cid} (same scraped image under conflicting labels)")
            
        # Check 3: Aspect Ratio and Extreme Cropping
        if ar > 3.0:
            quality_status = "poor"
            notes.append(f"Extreme aspect ratio ({ar:.1f}:1), severe crop artifact")
            
        # Check 4: Low resolution / heavy compression
        if w < 200 or h < 200:
            quality_status = "usable" if quality_status == "good" else quality_status
            notes.append(f"Low resolution ({w}x{h})")
            
        # Check 5: Disease visual ambiguity or internet scraping anomalies
        if "bacteria" in raw_lbl.lower() or "virus" in raw_lbl.lower():
            label_status = "suspicious"
            notes.append("Non-target pathogen in raw label")
            
        rec['label_status'] = label_status
        rec['quality_status'] = quality_status
        rec['audit_notes'] = "; ".join(notes) if notes else "Clean field sample"
        rec['purpose'] = "evaluation"
        audited_rows.append(rec)
        
    audit_df = pd.DataFrame(audited_rows)
    
    # Save Full Audit Report
    full_audit_path = "data/manifests/plantdoc_full_audit.csv"
    audit_df.to_csv(full_audit_path, index=False)
    print(f"Full audit report written to {full_audit_path}")
    
    # Filter Clean Evaluation Subset
    # Criteria: label_status == 'accepted' AND quality_status in ['good', 'usable']
    clean_df = audit_df[(audit_df['label_status'] == 'accepted') & (audit_df['quality_status'].isin(['good', 'usable']))].copy()
    
    # Save Clean Eval Manifest
    clean_manifest_path = "data/manifests/plantdoc_clean_eval_manifest.csv"
    cols = ["id", "source", "original_path", "raw_label", "canonical_class", "domain", "sha256", "phash", "duplicate_cluster", "source_group_id", "label_status", "quality_status", "audit_notes", "purpose"]
    clean_df[cols].to_csv(clean_manifest_path, index=False)
    print(f"Clean eval manifest written to {clean_manifest_path}")
    
    # Summary Statistics
    print("\n" + "="*50)
    print("PLANTDOC AUDIT SUMMARY")
    print("="*50)
    print(f"Total images reviewed: {len(audit_df)}")
    print(f"Label Status counts:\n{audit_df['label_status'].value_counts()}")
    print(f"\nQuality Status counts:\n{audit_df['quality_status'].value_counts()}")
    
    print("\n--- Clean Evaluation Subset Counts by Canonical Class ---")
    clean_counts = clean_df.groupby('canonical_class').size()
    print(clean_counts)
    print(f"\nTotal Clean Evaluation Images: {len(clean_df)}")
    
if __name__ == "__main__":
    run_plantdoc_audit()
