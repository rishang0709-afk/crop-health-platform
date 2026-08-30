import os
import hashlib
import uuid
import pandas as pd
from PIL import Image
import imagehash
from tqdm import tqdm
from collections import defaultdict
import random
import json
import shutil
import re

# Fixed deterministic seed
SEED = 42
random.seed(SEED)

CLASS_MAPPING = {
    "Tomato___healthy": "tomato_healthy",
    "Tomato___Early_blight": "tomato_early_blight",
    "Tomato___Late_blight": "tomato_late_blight",
    "Potato___healthy": "potato_healthy",
    "Potato___Early_blight": "potato_early_blight",
    "Potato___Late_blight": "potato_late_blight",
}

def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()

def compute_phash(filepath):
    try:
        img = Image.open(filepath).convert('RGB')
        return str(imagehash.phash(img, hash_size=8))
    except Exception:
        return None

def deduplicate_sha256(records):
    sha_seen = {}
    unique_records = []
    exact_dup_report = []
    
    print("Deduplicating via SHA256...")
    for rec in records:
        if rec['sha256'] not in sha_seen:
            sha_seen[rec['sha256']] = rec
            unique_records.append(rec)
        else:
            existing = sha_seen[rec['sha256']]
            exact_dup_report.append({
                "kept_file": existing['raw_fname'],
                "kept_class": existing['canonical_class'],
                "kept_leaf": existing['source_group_id'],
                "kept_official_split": existing['official_split'],
                "dup_file": rec['raw_fname'],
                "dup_class": rec['canonical_class'],
                "dup_leaf": rec['source_group_id'],
                "dup_official_split": rec['official_split'],
            })
            
    print(f"Exact SHA256 duplicates removed: {len(records) - len(unique_records)}")
    os.makedirs("data/manifests", exist_ok=True)
    pd.DataFrame(exact_dup_report).to_csv("data/manifests/exact_duplicates_report.csv", index=False)
    return unique_records

def group_stratified_split(records, train_ratio=0.70, val_ratio=0.15, test_ratio=0.15, seed=42):
    """
    Splits records deterministically by source_group_id per class.
    Guarantees no source_group_id spans multiple splits.
    Optimizes for ~70/15/15 image distribution per canonical class.
    """
    rng = random.Random(seed)
    
    # Group by class -> source_group_id -> list of records
    class_groups = defaultdict(lambda: defaultdict(list))
    for rec in records:
        class_groups[rec['canonical_class']][rec['source_group_id']].append(rec)
        
    final_records = []
    
    for c_class, groups_dict in sorted(class_groups.items()):
        # List of (group_id, records)
        groups = list(groups_dict.items())
        # Deterministic shuffle
        rng.shuffle(groups)
        
        total_images = sum(len(recs) for _, recs in groups)
        target_train = round(train_ratio * total_images)
        target_val = round(val_ratio * total_images)
        target_test = total_images - target_train - target_val
        
        # Ensure at least 1 group in val and test if possible
        if len(groups) >= 3:
            target_val = max(1, target_val)
            target_test = max(1, target_test)
            target_train = total_images - target_val - target_test
            
        train_groups, val_groups, test_groups = [], [], []
        train_count, val_count, test_count = 0, 0, 0
        
        # Greedy assignment based on current deficit
        for gid, recs in groups:
            sz = len(recs)
            # Calculate how much each split needs images
            deficit_train = target_train - train_count
            deficit_val = target_val - val_count
            deficit_test = target_test - test_count
            
            choices = [
                (deficit_train, 0, 'train'),
                (deficit_val, 1, 'val'),
                (deficit_test, 2, 'test')
            ]
            choices.sort(key=lambda x: -x[0])
            chosen_split = choices[0][2]
            
            if chosen_split == 'train':
                train_groups.append((gid, recs))
                train_count += sz
            elif chosen_split == 'val':
                val_groups.append((gid, recs))
                val_count += sz
            else:
                test_groups.append((gid, recs))
                test_count += sz
                
        # Ensure non-empty val/test if total groups >= 3
        if len(val_groups) == 0 and len(train_groups) > 1:
            g = train_groups.pop()
            val_groups.append(g)
        if len(test_groups) == 0 and len(train_groups) > 1:
            g = train_groups.pop()
            test_groups.append(g)
            
        for gid, recs in train_groups:
            for r in recs:
                r['split'] = 'train'
                final_records.append(r)
        for gid, recs in val_groups:
            for r in recs:
                r['split'] = 'val'
                final_records.append(r)
        for gid, recs in test_groups:
            for r in recs:
                r['split'] = 'test'
                final_records.append(r)
                
    return final_records

def run_phash_audit(records, phash_threshold=4):
    """
    Audits pHash near-duplicates strictly as an audit signal (no splitting alterations).
    Returns audit statistics and representative candidates.
    """
    print("\nRunning pHash audit...")
    cluster_centers = {}
    cluster_id = 0
    
    for rec in tqdm(records, desc="pHash clustering"):
        h1 = imagehash.hex_to_hash(rec['phash'])
        found_cluster = None
        for cid, h2 in cluster_centers.items():
            if h1 - h2 <= phash_threshold:
                found_cluster = cid
                break
        
        if found_cluster is not None:
            rec['duplicate_cluster'] = found_cluster
        else:
            cid = f"cluster_{cluster_id}"
            cluster_centers[cid] = h1
            rec['duplicate_cluster'] = cid
            cluster_id += 1
            
    # Compute cluster statistics
    cluster_members = defaultdict(list)
    for rec in records:
        cluster_members[rec['duplicate_cluster']].append(rec)
        
    total_clusters = len(cluster_members)
    singleton_clusters = sum(1 for c in cluster_members.values() if len(c) == 1)
    multi_image_clusters = sum(1 for c in cluster_members.values() if len(c) > 1)
    
    # Audit cross-class near-duplicates
    cross_class_clusters = []
    for cid, members in cluster_members.items():
        classes = set(m['canonical_class'] for m in members)
        if len(classes) > 1:
            cross_class_clusters.append((cid, classes, members))
            
    # Audit cross-split near-duplicates
    cross_split_clusters = []
    for cid, members in cluster_members.items():
        splits = set(m['split'] for m in members)
        if len(splits) > 1:
            cross_split_clusters.append((cid, splits, members))
            
    print(f"Total pHash clusters: {total_clusters}")
    print(f"Multi-image pHash clusters: {multi_image_clusters}")
    print(f"Singleton pHash clusters: {singleton_clusters}")
    print(f"Cross-class near-duplicate candidate clusters: {len(cross_class_clusters)}")
    print(f"Cross-split near-duplicate candidate clusters: {len(cross_split_clusters)}")
    
    # Export cross-split candidates for inspection
    cross_split_rows = []
    for cid, splits, members in cross_split_clusters:
        for m in members:
            cross_split_rows.append({
                "duplicate_cluster": cid,
                "splits_in_cluster": "/".join(sorted(splits)),
                "id": m['id'],
                "canonical_class": m['canonical_class'],
                "source_group_id": m['source_group_id'],
                "split": m['split'],
                "raw_fname": m['raw_fname'],
                "original_path": m['original_path']
            })
    pd.DataFrame(cross_split_rows).to_csv("data/manifests/phash_cross_split_audit.csv", index=False)
    
    return {
        "total_clusters": total_clusters,
        "multi_image_clusters": multi_image_clusters,
        "singleton_clusters": singleton_clusters,
        "cross_class_clusters": len(cross_class_clusters),
        "cross_split_clusters": len(cross_split_clusters),
        "cross_class_details": cross_class_clusters,
        "cross_split_details": cross_split_clusters
    }

def main():
    repo_dir = "training/plantvillage_repo/raw/color"
    out_dir = "data/raw/plantvillage_hf"
    os.makedirs(out_dir, exist_ok=True)
    
    # Load official splits for metadata tracking
    train_set = set()
    test_set = set()
    if os.path.exists("training/color_train.txt"):
        with open("training/color_train.txt", "r") as f:
            for line in f:
                train_set.add(line.strip())
    if os.path.exists("training/color_test.txt"):
        with open("training/color_test.txt", "r") as f:
            for line in f:
                test_set.add(line.strip())
                
    # Load leaf map
    map_path = "training/plantvillage_repo/leaf-map.json"
    leaf_map = {}
    if os.path.exists(map_path):
        raw_map = json.load(open(map_path))
        for k, v in raw_map.items():
            if v:
                leaf_map[k] = v[0] # e.g. "Potato___Early_blight:::115.0"

    records = []
    corrupt_count = 0
    gh_pattern = re.compile(r'^(GH_HL Leaf \d+)', re.IGNORECASE)
    
    print("Scanning dataset directories...")
    for raw_label in sorted(os.listdir(repo_dir)):
        if raw_label not in CLASS_MAPPING:
            continue
            
        canonical_class = CLASS_MAPPING[raw_label]
        label_dir = os.path.join(repo_dir, raw_label)
        
        for fname in sorted(os.listdir(label_dir)):
            if not fname.lower().endswith(".jpg"):
                continue
                
            in_path = os.path.join(label_dir, fname)
            
            try:
                with Image.open(in_path) as img:
                    img.verify()
                if os.path.getsize(in_path) == 0:
                    raise ValueError("Zero byte file")
                    
                sha256 = compute_sha256(in_path)
                phash = compute_phash(in_path)
                
                if not phash:
                    corrupt_count += 1
                    continue
                    
                # Determine leaf_id
                file_key = ""
                tail = fname
                if "___" in fname:
                    tail = fname.split("___", 1)[1]
                    file_key = tail.lower().replace(".jpg", "")
                
                # Check official leaf_map first
                if file_key in leaf_map:
                    leaf_id = leaf_map[file_key]
                elif raw_label == "Tomato___healthy" and gh_pattern.match(tail):
                    # Reviewed normalized fallback for GH_HL Leaf family
                    m = gh_pattern.match(tail)
                    leaf_id = f"Tomato___healthy:::{m.group(1).upper()}"
                else:
                    leaf_id = f"{raw_label}:::{fname}"
                
                # Official split metadata
                rel_path = f"raw/color/{raw_label}/{fname}"
                official_split = "unassigned"
                if rel_path in train_set:
                    official_split = "train"
                elif rel_path in test_set:
                    official_split = "test"
                
                # Materialize 
                out_fname = f"pv_{sha256[:12]}.jpg"
                out_path = os.path.join(out_dir, out_fname)
                if not os.path.exists(out_path):
                    shutil.copy2(in_path, out_path)
                    
                records.append({
                    "id": str(uuid.uuid5(uuid.NAMESPACE_URL, out_path)),
                    "source": "plantvillage_hf",
                    "original_path": out_path.replace("\\", "/"),
                    "raw_label": raw_label,
                    "canonical_class": canonical_class,
                    "domain": "controlled",
                    "source_group_id": str(leaf_id),
                    "sha256": sha256,
                    "phash": phash,
                    "split": None,
                    "duplicate_cluster": None,
                    "official_split": official_split,
                    "raw_fname": fname
                })
            except Exception as e:
                print(f"Corrupt or invalid image {in_path}: {e}")
                corrupt_count += 1

    print(f"Total raw candidate images scanned: {len(records) + corrupt_count}")
    print(f"Corrupt images: {corrupt_count}")
    
    # 1. SHA256 Deduplication (Hard constraint)
    unique_records = deduplicate_sha256(records)
    print(f"Total usable unique images: {len(unique_records)}")
    
    # 2. Group-stratified split by source_group_id (Hard constraint)
    split_records = group_stratified_split(unique_records, train_ratio=0.70, val_ratio=0.15, test_ratio=0.15, seed=SEED)
    
    # 3. pHash Audit (Audit signal only)
    phash_audit = run_phash_audit(split_records, phash_threshold=4)
    
    # Write dataset manifest
    df = pd.DataFrame(split_records)
    cols = ["id", "source", "original_path", "raw_label", "canonical_class", "domain", "split", "sha256", "phash", "duplicate_cluster", "source_group_id"]
    df = df[cols]
    
    manifest_path = "data/manifests/dataset_manifest.csv"
    df.to_csv(manifest_path, index=False)
    print(f"\nManifest written to {manifest_path}")
    
    # Print summary reports
    print("\n" + "="*50)
    print("PHASE 2B DATASET REPORT (GROUP-STRATIFIED 70/15/15)")
    print("="*50)
    print(f"Total usable images: {len(df)}")
    print(f"Total source_group_id groups: {df['source_group_id'].nunique()}")
    
    print("\n--- Image Counts per Class & Split ---")
    img_counts = df.groupby(['canonical_class', 'split']).size().unstack(fill_value=0)
    img_counts['total'] = img_counts.sum(axis=1)
    img_counts['train_pct'] = (img_counts['train'] / img_counts['total'] * 100).round(1)
    img_counts['val_pct'] = (img_counts['val'] / img_counts['total'] * 100).round(1)
    img_counts['test_pct'] = (img_counts['test'] / img_counts['total'] * 100).round(1)
    print(img_counts[['train', 'val', 'test', 'total', 'train_pct', 'val_pct', 'test_pct']])
    
    print("\n--- Source Group (Leaf) Counts per Class & Split ---")
    grp_counts = df.groupby(['canonical_class', 'split'])['source_group_id'].nunique().unstack(fill_value=0)
    grp_counts['total_groups'] = grp_counts.sum(axis=1)
    print(grp_counts)
    
    # Cross-split source_group_id leakage verification
    leakage = df.groupby('source_group_id')['split'].nunique()
    leaking_groups = (leakage > 1).sum()
    print(f"\nSource Group Leakage (groups spanning multiple splits): {leaking_groups}")
    
    # SHA256 duplicate cross-split leakage verification
    sha_leakage = df.groupby('sha256')['split'].nunique()
    leaking_sha = (sha_leakage > 1).sum()
    print(f"SHA256 Leakage (hashes spanning multiple splits): {leaking_sha}")

if __name__ == "__main__":
    main()

