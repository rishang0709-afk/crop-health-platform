import os
import hashlib
import uuid
import pandas as pd
from PIL import Image
import imagehash
from tqdm import tqdm
from collections import defaultdict
import random
import shutil

# Seed for reproducibility
random.seed(42)

# MAPPING 
CLASS_MAPPING = {
    "plantvillage": {
        "Tomato___healthy": "tomato_healthy",
        "Tomato___Early_blight": "tomato_early_blight",
        "Tomato___Late_blight": "tomato_late_blight",
        "Potato___healthy": "potato_healthy",
        "Potato___Early_blight": "potato_early_blight",
        "Potato___Late_blight": "potato_late_blight",
    },
    "plantdoc": {
        "Tomato leaf": "tomato_healthy",
        "Tomato Early blight leaf": "tomato_early_blight",
        "Tomato leaf late blight": "tomato_late_blight",
        "Potato leaf": "potato_healthy",
        "Potato leaf early blight": "potato_early_blight",
        "Potato leaf late blight": "potato_late_blight",
    },
    "background": {
        "coco_negatives": "background",
    }
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

def find_duplicates_and_cross_class(records, phash_threshold=4):
    # 1. Exact matches (SHA256)
    sha_seen = {}
    unique_records = []
    cross_class_issues = []
    
    print("Removing exact SHA256 duplicates and checking cross-class leaks...")
    for rec in records:
        if rec['sha256'] not in sha_seen:
            sha_seen[rec['sha256']] = rec
            unique_records.append(rec)
        else:
            existing = sha_seen[rec['sha256']]
            if existing['canonical_class'] != rec['canonical_class']:
                cross_class_issues.append((existing['original_path'], rec['original_path'], 'SHA256'))
                
    print(f"Exact duplicates removed: {len(records) - len(unique_records)}")
    
    # 2. Near duplicates (pHash clustering)
    print("Clustering near-duplicates (pHash)...")
    clusters = {}
    cluster_id = 0
    
    for rec in tqdm(unique_records, desc="pHash clustering"):
        h1 = imagehash.hex_to_hash(rec['phash'])
        found_cluster = None
        for center_phash_hex, cid in clusters.items():
            h2 = imagehash.hex_to_hash(center_phash_hex)
            if h1 - h2 <= phash_threshold:
                found_cluster = cid
                break
        
        if found_cluster is not None:
            rec['duplicate_cluster'] = found_cluster
        else:
            clusters[rec['phash']] = f"cluster_{cluster_id}"
            rec['duplicate_cluster'] = f"cluster_{cluster_id}"
            cluster_id += 1
            
    # Check cross-class in clusters
    cluster_classes = defaultdict(set)
    for rec in unique_records:
        cluster_classes[rec['duplicate_cluster']].add(rec['canonical_class'])
        
    for cid, classes in cluster_classes.items():
        if len(classes) > 1:
            print(f"WARNING: Cross-class contamination in {cid}: {classes}. Flagging for manual review.")
            
    return unique_records, cross_class_issues

def split_dataset(unique_records):
    clusters = defaultdict(list)
    for rec in unique_records:
        clusters[rec['duplicate_cluster']].append(rec)
        
    stratified_clusters = defaultdict(list)
    for cid, items in clusters.items():
        rep = items[0]
        stratified_clusters[(rep['canonical_class'], rep['domain'])].append(cid)
        
    final_records = []
    print("Splitting dataset...")
    
    for (c_class, c_domain), cids in stratified_clusters.items():
        random.shuffle(cids)
        total_items = sum(len(clusters[cid]) for cid in cids)
        
        train_target = int(0.7 * total_items)
        val_target = int(0.15 * total_items)
        
        train_count = 0
        val_count = 0
        
        for cid in cids:
            cluster_size = len(clusters[cid])
            if train_count < train_target or len(cids) <= 3 and train_count == 0:
                split = "train"
                train_count += cluster_size
            elif val_count < val_target or len(cids) <= 3 and val_count == 0:
                split = "val"
                val_count += cluster_size
            else:
                split = "test"
                
            for rec in clusters[cid]:
                rec['split'] = split
                final_records.append(rec)
                
    return final_records

def main():
    base_dir = "data/raw"
    records = []
    corrupt_count = 0
    
    print("Scanning dataset directories...")
    if not os.path.exists(base_dir):
        print("data/raw not found. Have you downloaded the datasets?")
        return

    for source in ["plantvillage", "plantdoc", "background"]:
        source_dir = os.path.join(base_dir, source)
        if not os.path.exists(source_dir):
            continue
            
        for raw_label in os.listdir(source_dir):
            label_dir = os.path.join(source_dir, raw_label)
            if not os.path.isdir(label_dir):
                continue
                
            if raw_label not in CLASS_MAPPING.get(source, {}):
                continue
                
            canonical_class = CLASS_MAPPING[source][raw_label]
            domain = "controlled" if source == "plantvillage" else "field" if source == "plantdoc" else "negative"
            
            for fname in os.listdir(label_dir):
                filepath = os.path.join(label_dir, fname)
                try:
                    with Image.open(filepath) as img:
                        img.verify()
                    if os.path.getsize(filepath) == 0:
                        raise ValueError("Zero byte file")
                        
                    sha256 = compute_sha256(filepath)
                    phash = compute_phash(filepath)
                    
                    if not phash:
                        corrupt_count += 1
                        continue
                        
                    records.append({
                        "id": str(uuid.uuid4()),
                        "source": source,
                        "original_path": filepath.replace("\\", "/"),
                        "raw_label": raw_label,
                        "canonical_class": canonical_class,
                        "domain": domain,
                        "sha256": sha256,
                        "phash": phash,
                        "split": None,
                        "duplicate_cluster": None
                    })
                except Exception:
                    corrupt_count += 1

    print(f"Initial raw images: {len(records) + corrupt_count}")
    print(f"Corrupt images: {corrupt_count}")
    
    if len(records) == 0:
        print("No valid images found. Stopping.")
        return
    
    unique_records, cross_class = find_duplicates_and_cross_class(records, phash_threshold=4)
    if cross_class:
        print("CROSS CLASS EXACT DUPLICATES FOUND:")
        for issue in cross_class:
            print(issue)
            
    final_records = split_dataset(unique_records)
    
    df = pd.DataFrame(final_records)
    cols = ["id", "source", "original_path", "raw_label", "canonical_class", "domain", "split", "sha256", "phash", "duplicate_cluster"]
    df = df[cols]
    
    os.makedirs("data/manifests", exist_ok=True)
    manifest_path = "data/manifests/dataset_manifest.csv"
    df.to_csv(manifest_path, index=False)
    
    print(f"Manifest written to {manifest_path}")
    print("\n--- PHASE 2B DATASET REPORT ---")
    print(f"Total Usable Images: {len(df)}")
    
    print("\nSource/Domain Counts:")
    print(df.groupby(['source', 'domain']).size())
    print("\nCanonical Class Counts:")
    print(df.groupby('canonical_class').size())
    print("\nSplit Counts:")
    print(df.groupby('split').size())
    print("\nDetailed Split by Class and Domain:")
    print(df.groupby(['canonical_class', 'domain', 'split']).size())

if __name__ == "__main__":
    main()
