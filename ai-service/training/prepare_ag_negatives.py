import os
import io
import re
import sys
import json
import random
import zipfile
import hashlib
import subprocess
import requests
import pandas as pd
from PIL import Image
import imagehash
from collections import defaultdict

# -------------------------------------------------------------
# CONSTANTS & METADATA
# -------------------------------------------------------------
DEEPWEEDS_LABELS_URL = "https://raw.githubusercontent.com/AlexOlsen/DeepWeeds/master/labels/labels.csv"
DEEPWEEDS_GD_ID = "1xnK3B6K6KekDI55vwJ0vnc2IGoDga9cj"

PLANTDOC_NONTARGET_CLASSES = {
    "Apple leaf": "apple_healthy",
    "Blueberry leaf": "blueberry_healthy",
    "Cherry leaf": "cherry_healthy",
    "Peach leaf": "peach_healthy",
    "Raspberry leaf": "raspberry_healthy",
    "Soyabean leaf": "soybean_healthy",
    "Strawberry leaf": "strawberry_healthy",
    "grape leaf": "grape_healthy",
    "Bell_pepper leaf": "bell_pepper_healthy"
}

FORBIDDEN_KEYWORDS = [
    "tomato", "potato", "solanum", "lycopersicon", "tuberosum",
    "early blight", "late blight", "alternaria", "phytophthora"
]

def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()

def compute_phash(filepath):
    try:
        with Image.open(filepath) as img:
            rgb = img.convert('RGB')
            return str(imagehash.phash(rgb, hash_size=8))
    except Exception as e:
        print(f"Error computing pHash for {filepath}: {e}")
        return None

# -------------------------------------------------------------
# STEP 1: EXTRACT PLANTDOC NON-TARGET HEALTHY FOLIAGE
# -------------------------------------------------------------
def extract_plantdoc_nontarget(repo_dir, out_dir, samples_per_class=20, seed=42):
    os.makedirs(out_dir, exist_ok=True)
    res = subprocess.check_output(['git', 'ls-tree', '-r', 'origin/master'], cwd=repo_dir).decode('utf-8', errors='ignore')
    
    class_blobs = defaultdict(list)
    for line in res.strip().split('\n'):
        parts = line.split('\t')
        if len(parts) != 2: continue
        meta, repo_path = parts[0], parts[1]
        tokens = repo_path.split('/')
        if len(tokens) >= 3:
            orig_split = tokens[0]
            folder = tokens[1]
            if folder in PLANTDOC_NONTARGET_CLASSES:
                blob_hash = meta.split()[2]
                class_blobs[folder].append({
                    "blob_hash": blob_hash,
                    "repo_path": repo_path,
                    "orig_split": orig_split,
                    "folder": folder,
                    "raw_label": folder,
                    "species": PLANTDOC_NONTARGET_CLASSES[folder]
                })
                
    rng = random.Random(seed)
    extracted_records = []
    
    for folder in sorted(class_blobs.keys()):
        blobs = class_blobs[folder]
        rng.shuffle(blobs)
        selected = blobs[:samples_per_class]
        
        for item in selected:
            blob_bytes = subprocess.check_output(['git', 'cat-file', '-p', item['blob_hash']], cwd=repo_dir)
            file_sha = hashlib.sha256(blob_bytes).hexdigest()
            filename = f"pd_nt_{file_sha[:12]}.jpg"
            dest_path = os.path.join(out_dir, filename)
            
            with open(dest_path, 'wb') as f:
                f.write(blob_bytes)
                
            extracted_records.append({
                "filename": filename,
                "dest_path": dest_path.replace("\\", "/"),
                "source": "plantdoc_nontarget",
                "raw_label": item['raw_label'],
                "species": item['species'],
                "category": "unsupported_crop",
                "orig_repo_path": item['repo_path'],
                "orig_split": item['orig_split']
            })
            
    print(f"Extracted {len(extracted_records)} PlantDoc healthy non-target images across {len(class_blobs)} classes.")
    return extracted_records

# -------------------------------------------------------------
# STEP 2: INGEST DEEPWEEDS FROM OFFICIAL REPOSITORY
# -------------------------------------------------------------
def ingest_deepweeds(out_dir, tmp_dir, samples_per_class=30, seed=42):
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(tmp_dir, exist_ok=True)
    
    print("Fetching DeepWeeds labels.csv from official repository...")
    resp = requests.get(DEEPWEEDS_LABELS_URL)
    df_labels = pd.read_csv(io.StringIO(resp.text))
    
    rng = random.Random(seed)
    sampled_map = {}
    for species, group in df_labels.groupby('Species'):
        rows = group.to_dict('records')
        rng.shuffle(rows)
        for r in rows[:samples_per_class]:
            sampled_map[r['Filename']] = r
            
    print(f"Sampled {len(sampled_map)} images ({samples_per_class} per class across {df_labels['Species'].nunique()} classes).")
    
    # Download archive
    zip_path = os.path.join(tmp_dir, "deepweeds_images.zip")
    if not os.path.exists(zip_path):
        print("Connecting to official DeepWeeds Google Drive archive...")
        session = requests.Session()
        res1 = session.get("https://docs.google.com/uc?export=download", params={'id': DEEPWEEDS_GD_ID})
        m_uuid = re.search(r'name=["\']uuid["\'][^>]*value=["\']([^"\']*)["\']', res1.text)
        uuid_val = m_uuid.group(1) if m_uuid else ""
        
        dl_url = "https://drive.usercontent.google.com/download"
        params = {'id': DEEPWEEDS_GD_ID, 'export': 'download', 'confirm': 't', 'uuid': uuid_val}
        
        print("Downloading DeepWeeds images.zip archive (~468MB)...")
        res2 = session.get(dl_url, params=params, stream=True)
        with open(zip_path, 'wb') as f:
            for chunk in res2.iter_content(chunk_size=65536):
                if chunk:
                    f.write(chunk)
        print(f"Downloaded DeepWeeds archive: {os.path.getsize(zip_path)/(1024*1024):.1f} MB")
        
    print("Selectively extracting sampled images from archive...")
    extracted_records = []
    with zipfile.ZipFile(zip_path, 'r') as zf:
        for zinfo in zf.infolist():
            fname = os.path.basename(zinfo.filename)
            if fname in sampled_map:
                meta = sampled_map[fname]
                dest_path = os.path.join(out_dir, fname)
                with open(dest_path, 'wb') as f:
                    f.write(zf.read(zinfo))
                    
                cat = "grass" if meta['Species'] == "Negative" else "weed"
                extracted_records.append({
                    "filename": fname,
                    "dest_path": dest_path.replace("\\", "/"),
                    "source": "deepweeds",
                    "raw_label": meta['Species'],
                    "species": meta['Species'],
                    "category": cat,
                    "orig_repo_path": f"deepweeds/{fname}",
                    "orig_split": "official_deepweeds"
                })
                
    print(f"Extracted {len(extracted_records)} DeepWeeds images into {out_dir}")
    
    # Cleanup temporary zip to save space
    try:
        os.remove(zip_path)
        print("Cleaned up temporary archive zip file.")
    except Exception as e:
        print(f"Note: Could not remove tmp zip: {e}")
        
    return extracted_records

# -------------------------------------------------------------
# STEP 3: CANDIDATE CURATION & VALIDATION PIPELINE
# -------------------------------------------------------------
def curate_candidates(candidates, base_prefix=""):
    print("\nRunning manual & automated safety curation pipeline...")
    curated_records = []
    
    # Preload collision datasets
    pv_path = os.path.join(base_prefix, 'data/manifests/dataset_manifest.csv')
    pd_path = os.path.join(base_prefix, 'data/manifests/field_eval_manifest.csv')
    pd_holdout_path = os.path.join(base_prefix, 'data/manifests/plantdoc_test_holdout.csv')
    coco_path = os.path.join(base_prefix, 'data/manifests/background_manifest.csv')
    
    pv_shas = set(pd.read_csv(pv_path)['sha256']) if os.path.exists(pv_path) else set()
    pd_shas = set(pd.read_csv(pd_path)['sha256']) if os.path.exists(pd_path) else set()
    pd_holdout_shas = set(pd.read_csv(pd_holdout_path)['sha256']) if os.path.exists(pd_holdout_path) else set()
    coco_shas = set(pd.read_csv(coco_path)['sha256']) if os.path.exists(coco_path) else set()
    
    all_target_shas = pv_shas | pd_shas | pd_holdout_shas
    
    for cand in candidates:
        fpath = cand['dest_path']
        if not os.path.exists(fpath) and os.path.exists(os.path.join(base_prefix, fpath)):
            fpath = os.path.join(base_prefix, fpath)
            
        sha = compute_sha256(fpath)
        ph = compute_phash(fpath)
        
        # Quality & Dimensions check
        is_valid = True
        status = "ACCEPTED"
        reason = "Clean verified agricultural negative"
        
        # Check forbidden keywords in metadata
        raw_l_lower = cand['raw_label'].lower()
        for kw in FORBIDDEN_KEYWORDS:
            if kw in raw_l_lower:
                is_valid = False
                status = "EXCLUDED"
                reason = f"Forbidden target keyword in label: {kw}"
                break
                
        # Check image decode
        w, h = 0, 0
        if is_valid:
            try:
                with Image.open(fpath) as img:
                    w, h = img.size
                    if w < 100 or h < 100:
                        is_valid = False
                        status = "EXCLUDED"
                        reason = f"Resolution too low ({w}x{h})"
                    ar = max(w/h, h/w)
                    if ar > 3.0:
                        is_valid = False
                        status = "EXCLUDED"
                        reason = f"Extreme aspect ratio ({ar:.1f}:1)"
                    img.verify()
            except Exception as e:
                is_valid = False
                status = "EXCLUDED"
                reason = f"Image file corrupted: {e}"
                
        # Check exact hash collisions with target classes
        if is_valid:
            if sha in all_target_shas:
                is_valid = False
                status = "EXCLUDED"
                reason = "Exact SHA256 collision with supervised crop target class"
            elif sha in coco_shas:
                is_valid = False
                status = "EXCLUDED"
                reason = "Exact SHA256 collision with existing COCO background"
                
        rec = {
            "id": f"ag_neg_{sha[:12]}",
            "source": cand['source'],
            "original_path": cand['dest_path'],
            "raw_label": cand['raw_label'],
            "species": cand['species'],
            "category": cand['category'],
            "canonical_class": "background",
            "domain": "field",
            "sha256": sha,
            "phash": ph,
            "width": w,
            "height": h,
            "duplicate_cluster": "",
            "source_group_id": "",
            "review_status": status,
            "exclusion_reason": reason
        }
        curated_records.append(rec)
        
    # Cluster accepted records by pHash
    accepted = [r for r in curated_records if r['review_status'] == "ACCEPTED"]
    excluded = [r for r in curated_records if r['review_status'] == "EXCLUDED"]
    
    cluster_centers = {}
    cluster_idx = 0
    for r in accepted:
        h1 = imagehash.hex_to_hash(r['phash'])
        matched_cid = None
        for cid, h2 in cluster_centers.items():
            if h1 - h2 <= 4:
                matched_cid = cid
                break
        if matched_cid is not None:
            r['duplicate_cluster'] = matched_cid
            r['source_group_id'] = matched_cid
        else:
            cid = f"ag_bg_cluster_{cluster_idx}"
            cluster_centers[cid] = h1
            r['duplicate_cluster'] = cid
            r['source_group_id'] = cid
            cluster_idx += 1
            
    for r in excluded:
        r['duplicate_cluster'] = "excluded"
        r['source_group_id'] = "excluded"
        
    return accepted + excluded

# -------------------------------------------------------------
# MAIN EXECUTION ROUTINE
# -------------------------------------------------------------
def run_phase_4b2a():
    base_prefix = ""
    if not os.path.exists("data/manifests") and os.path.exists("ai-service/data/manifests"):
        base_prefix = "ai-service/"
        
    repo_dir = os.path.join(base_prefix, 'training/plantdoc_repo')
    raw_pd_dir = os.path.join(base_prefix, 'data/raw/background/ag_negatives/plantdoc_nontarget')
    raw_dw_dir = os.path.join(base_prefix, 'data/raw/background/ag_negatives/deepweeds')
    tmp_dir = os.path.join(base_prefix, 'data/raw/background/tmp')
    out_manifest = os.path.join(base_prefix, 'data/manifests/ag_background_candidates.csv')
    
    print("="*60)
    print("PHASE 4B.2A: VERIFIED-SOURCE AGRICULTURAL HARD-NEGATIVE INGESTION")
    print("="*60)
    
    # 1. PlantDoc Non-Target Extraction (180 candidates: 20/class x 9 classes)
    pd_records = extract_plantdoc_nontarget(repo_dir, raw_pd_dir, samples_per_class=20, seed=42)
    
    # 2. DeepWeeds Ingestion (270 candidates: 30/class x 9 classes)
    dw_records = ingest_deepweeds(raw_dw_dir, tmp_dir, samples_per_class=30, seed=42)
    
    # Combine Candidates
    all_candidates = pd_records + dw_records
    print(f"\nTotal Candidates Ingested: {len(all_candidates)}")
    
    # 3. Quality & Safety Curation
    curated_records = curate_candidates(all_candidates, base_prefix)
    
    # 4. Save Candidate Manifest
    df_manifest = pd.DataFrame(curated_records)
    df_manifest.to_csv(out_manifest, index=False)
    print(f"\nSaved Candidate Manifest: {out_manifest} ({len(df_manifest)} rows)")
    
    # 5. Validation & Summary
    df_accepted = df_manifest[df_manifest['review_status'] == "ACCEPTED"]
    df_excluded = df_manifest[df_manifest['review_status'] == "EXCLUDED"]
    
    print("\n" + "="*60)
    print("CURATION SUMMARY")
    print("="*60)
    print(f"Total Ingested Candidates: {len(df_manifest)}")
    print(f"Accepted Candidates:       {len(df_accepted)}")
    print(f"Excluded Candidates:       {len(df_excluded)}")
    
    print("\nAccepted Candidates by Source:")
    print(df_accepted['source'].value_counts())
    
    print("\nAccepted Candidates by Category:")
    print(df_accepted['category'].value_counts())
    
    print("\nAccepted Candidates by Original Species / Class:")
    print(df_accepted['species'].value_counts())
    
    print("\nUnique pHash / Source Groups in Accepted Candidates:")
    print(f"  Total Unique Groups: {df_accepted['source_group_id'].nunique()} across {len(df_accepted)} images")
    multi_groups = df_accepted['source_group_id'].value_counts()
    print(f"  Multi-image clusters: {len(multi_groups[multi_groups > 1])}")

if __name__ == "__main__":
    run_phase_4b2a()
