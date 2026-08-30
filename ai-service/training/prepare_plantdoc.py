import os
import subprocess
import hashlib
import uuid
import io
import pandas as pd
from PIL import Image
import imagehash
from tqdm import tqdm
from collections import defaultdict

CLASS_MAPPING = {
    "Tomato leaf": "tomato_healthy",
    "Tomato Early blight leaf": "tomato_early_blight",
    "Tomato leaf late blight": "tomato_late_blight",
    "Potato leaf early blight": "potato_early_blight",
    "Potato leaf late blight": "potato_late_blight",
}

def compute_sha256_bytes(b_data):
    return hashlib.sha256(b_data).hexdigest()

def compute_phash_img(img):
    try:
        rgb_img = img.convert('RGB')
        return str(imagehash.phash(rgb_img, hash_size=8))
    except Exception:
        return None

def extract_plantdoc_blobs(repo_dir="training/plantdoc_repo"):
    print("Reading git tree from PlantDoc repository...")
    res = subprocess.check_output(['git', 'ls-tree', '-r', 'origin/master'], cwd=repo_dir).decode('utf-8', errors='ignore')
    lines = res.strip().split('\n')
    
    entries = []
    for line in lines:
        parts = line.split('\t')
        if len(parts) != 2:
            continue
        meta, path = parts[0], parts[1]
        mode, obj_type, blob_hash = meta.split()
        tokens = path.split('/')
        if len(tokens) >= 3:
            orig_split = tokens[0] # 'train' or 'test'
            raw_folder = tokens[1]
            orig_fname = '/'.join(tokens[2:])
            if raw_folder in CLASS_MAPPING:
                entries.append({
                    "blob_hash": blob_hash,
                    "orig_split": orig_split,
                    "raw_label": raw_folder,
                    "canonical_class": CLASS_MAPPING[raw_folder],
                    "orig_path": path,
                    "orig_fname": orig_fname
                })
    return entries

def main():
    repo_dir = "training/plantdoc_repo"
    out_dir = "data/raw/plantdoc"
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs("data/manifests", exist_ok=True)
    
    entries = extract_plantdoc_blobs(repo_dir)
    print(f"Total target class entries found in git tree: {len(entries)}")
    
    # 1. Image extraction, decode verification, and SHA256/pHash computation
    raw_records = []
    corrupt_count = 0
    corrupt_details = []
    
    print("Extracting and verifying image blobs...")
    for entry in tqdm(entries, desc="Processing blobs"):
        try:
            # Extract raw blob bytes directly from git object database
            blob_bytes = subprocess.check_output(['git', 'cat-file', '-p', entry['blob_hash']], cwd=repo_dir)
            if len(blob_bytes) == 0:
                raise ValueError("Zero-byte blob")
                
            # Verify decode with PIL
            img = Image.open(io.BytesIO(blob_bytes))
            img.verify()
            
            # Reopen for pHash calculation (verify closes image stream)
            img = Image.open(io.BytesIO(blob_bytes))
            sha256 = compute_sha256_bytes(blob_bytes)
            phash = compute_phash_img(img)
            
            if not phash:
                raise ValueError("pHash computation failed")
                
            # Save materialized file
            ext = os.path.splitext(entry['orig_fname'])[1].lower()
            if not ext or ext not in ['.jpg', '.jpeg', '.png']:
                ext = '.jpg'
            out_fname = f"pd_{sha256[:12]}{ext}"
            out_path = os.path.join(out_dir, out_fname).replace("\\", "/")
            
            if not os.path.exists(out_path):
                with open(out_path, 'wb') as f:
                    f.write(blob_bytes)
                    
            raw_records.append({
                "id": str(uuid.uuid5(uuid.NAMESPACE_URL, out_path)),
                "source": "plantdoc",
                "original_path": out_path,
                "raw_label": entry['raw_label'],
                "canonical_class": entry['canonical_class'],
                "domain": "field",
                "split": "unassigned",
                "sha256": sha256,
                "phash": phash,
                "duplicate_cluster": None,
                "source_group_id": None,
                "orig_repo_path": entry['orig_path'],
                "orig_split": entry['orig_split']
            })
        except Exception as e:
            corrupt_count += 1
            corrupt_details.append({"orig_path": entry['orig_path'], "error": str(e)})
            
    print(f"\nTotal raw candidate images: {len(entries)}")
    print(f"Corrupt / invalid images: {corrupt_count}")
    
    # 2. SHA256 Exact Deduplication
    sha_seen = {}
    unique_records = []
    exact_duplicates = []
    cross_class_exact = []
    
    for rec in raw_records:
        h = rec['sha256']
        if h not in sha_seen:
            sha_seen[h] = rec
            unique_records.append(rec)
        else:
            existing = sha_seen[h]
            exact_duplicates.append({
                "kept_path": existing['original_path'],
                "kept_class": existing['canonical_class'],
                "kept_repo_path": existing['orig_repo_path'],
                "dup_path": rec['original_path'],
                "dup_class": rec['canonical_class'],
                "dup_repo_path": rec['orig_repo_path']
            })
            if existing['canonical_class'] != rec['canonical_class']:
                cross_class_exact.append((existing, rec))
                
    print(f"Exact SHA256 duplicates removed: {len(exact_duplicates)}")
    print(f"Cross-class exact duplicates: {len(cross_class_exact)}")
    pd.DataFrame(exact_duplicates).to_csv("data/manifests/plantdoc_exact_duplicates.csv", index=False)
    
    # 3. pHash Audit
    phash_threshold = 4
    print(f"\nRunning pHash audit (threshold={phash_threshold})...")
    cluster_centers = {}
    cluster_id = 0
    
    for rec in tqdm(unique_records, desc="pHash clustering"):
        h1 = imagehash.hex_to_hash(rec['phash'])
        found_cluster = None
        for cid, h2 in cluster_centers.items():
            if h1 - h2 <= phash_threshold:
                found_cluster = cid
                break
        if found_cluster is not None:
            rec['duplicate_cluster'] = found_cluster
        else:
            cid = f"pd_cluster_{cluster_id}"
            cluster_centers[cid] = h1
            rec['duplicate_cluster'] = cid
            cluster_id += 1
            
    cluster_members = defaultdict(list)
    for rec in unique_records:
        cluster_members[rec['duplicate_cluster']].append(rec)
        
    total_clusters = len(cluster_members)
    singleton_clusters = sum(1 for c in cluster_members.values() if len(c) == 1)
    multi_image_clusters = sum(1 for c in cluster_members.values() if len(c) > 1)
    
    cross_class_phash = []
    for cid, members in cluster_members.items():
        classes = set(m['canonical_class'] for m in members)
        if len(classes) > 1:
            cross_class_phash.append((cid, classes, members))
            
    print(f"Total pHash clusters: {total_clusters}")
    print(f"Multi-image pHash clusters: {multi_image_clusters}")
    print(f"Singleton pHash clusters: {singleton_clusters}")
    print(f"Cross-class near-duplicate clusters: {len(cross_class_phash)}")
    
    # Save Manifest
    df = pd.DataFrame(unique_records)
    cols = ["id", "source", "original_path", "raw_label", "canonical_class", "domain", "split", "sha256", "phash", "duplicate_cluster", "source_group_id"]
    manifest_df = df[cols]
    manifest_path = "data/manifests/plantdoc_manifest.csv"
    manifest_df.to_csv(manifest_path, index=False)
    print(f"\nPlantDoc manifest written to {manifest_path}")
    
    # Summary Table
    print("\n" + "="*50)
    print("PLANTDOC SUMMARY BY CANONICAL CLASS")
    print("="*50)
    summary = df.groupby(['canonical_class', 'raw_label']).size().reset_index(name='usable_count')
    print(summary)
    print(f"\nTotal Usable PlantDoc Images: {len(df)}")
    
if __name__ == "__main__":
    main()
