import os
import json
import random
import urllib.request
import hashlib
import uuid
import pandas as pd
from PIL import Image
import imagehash
import numpy as np
from tqdm import tqdm
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

SEED = 42
TARGET_COUNT = 750

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

def download_coco_image(item, out_dir):
    img_id, url = item
    out_path = os.path.join(out_dir, f"coco_{img_id:012d}.jpg").replace("\\", "/")
    if not os.path.exists(out_path):
        try:
            urllib.request.urlretrieve(url, out_path)
        except Exception as e:
            return img_id, None, str(e)
    return img_id, out_path, None

def assess_image_vegetation(filepath, raw_label):
    """
    Evaluates visual vegetation and foliage content of an image.
    Returns (status, reason, metrics).
    """
    try:
        with Image.open(filepath) as img:
            rgb = img.convert('RGB')
            arr = np.array(rgb, dtype=float)
            w, h = img.size
            
            # Plant/green metrics
            g_excess = 2*arr[:,:,1] - arr[:,:,0] - arr[:,:,2]
            green_ratio = float(np.mean(g_excess > 30))
            
            hsv = img.convert('HSV')
            hsv_arr = np.array(hsv, dtype=float)
            hue = hsv_arr[:,:,0]
            sat = hsv_arr[:,:,1]
            val = hsv_arr[:,:,2]
            
            # Leaf/plant color space in HSV (hue 25-105, saturation > 50, value > 40)
            plant_mask = (hue >= 25) & (hue <= 105) & (sat >= 50) & (val >= 40)
            plant_ratio = float(np.mean(plant_mask))
            
            # Category-specific flags
            # Produce/food that may be attached to leaves/branches or resemble crops
            if raw_label in ['broccoli', 'banana', 'apple', 'orange'] and plant_ratio > 0.20:
                return "reject_vegetation", f"Food/produce item with significant foliage/plant context ({plant_ratio:.1%})"
                
            if plant_ratio > 0.55:
                return "reject_vegetation", f"Image strongly dominated by foliage/vegetation ({plant_ratio:.1%})"
                
            if plant_ratio > 0.35 and green_ratio > 0.30:
                return "ambiguous_vegetation", f"Significant green vegetation/leaf canopy ({plant_ratio:.1%} plant hue, {green_ratio:.1%} green excess)"
                
            return "accepted", "Clean non-plant negative scene"
    except Exception as e:
        return "reject_quality", f"PIL decode error: {e}"

def main():
    coco_json_path = "training/annotations/instances_val2017.json"
    out_dir = "data/raw/background/coco_negatives"
    manifest_path = "data/manifests/background_manifest.csv"
    
    with open(coco_json_path, 'r') as f:
        coco = json.load(f)
    images_by_id = {img['id']: img for img in coco['images']}
    cat_names = {c['id']: c['name'] for c in coco['categories']}
    
    df_current = pd.read_csv(manifest_path)
    print(f"Auditing current {len(df_current)} background images...")
    
    audit_results = []
    accepted_records = []
    rejected_count_veg = 0
    rejected_count_ambig = 0
    rejected_count_qual = 0
    
    for idx, r in df_current.iterrows():
        path = r['original_path']
        lbl = r['raw_label']
        status, reason = assess_image_vegetation(path, lbl)
        
        audit_results.append({
            "id": r['id'],
            "original_path": path,
            "raw_label": lbl,
            "background_audit_status": status,
            "audit_reason": reason
        })
        
        if status == "accepted":
            accepted_records.append(r.to_dict())
        elif status == "reject_vegetation":
            rejected_count_veg += 1
        elif status == "ambiguous_vegetation":
            rejected_count_ambig += 1
        elif status == "reject_quality":
            rejected_count_qual += 1
            
    print(f"Visual Audit Results:")
    print(f"  Accepted immediately: {len(accepted_records)}")
    print(f"  Rejected (Vegetation-dominated): {rejected_count_veg}")
    print(f"  Rejected (Ambiguous vegetation): {rejected_count_ambig}")
    print(f"  Rejected (Quality): {rejected_count_qual}")
    
    needed_replacements = TARGET_COUNT - len(accepted_records)
    print(f"Need {needed_replacements} clean replacement images to reach exactly {TARGET_COUNT}.")
    
    # Select replacements from COCO pool
    # Exclude all plant/produce categories from replacements: potted plant (64), broccoli, apple, banana, orange
    already_used_ids = set(int(os.path.basename(r['original_path']).replace('coco_', '').replace('.jpg', '')) for r in df_current.to_dict('records'))
    
    # Safe non-plant supercategories / categories
    safe_categories = [
        'car', 'bus', 'train', 'motorcycle', 'truck', 'airplane', 'boat', 'bicycle',
        'chair', 'couch', 'bed', 'dining table', 'toilet', 'refrigerator', 'sink', 'microwave', 'oven', 'clock',
        'laptop', 'tv', 'cell phone', 'keyboard', 'mouse', 'remote',
        'dog', 'cat', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'bird',
        'skis', 'snowboard', 'surfboard', 'skateboard', 'tennis racket', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter',
        'bottle', 'cup', 'bowl', 'fork', 'knife', 'spoon', 'pizza', 'sandwich', 'cake', 'donut',
        'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'scissors', 'book'
    ]
    safe_cat_ids = set(c['id'] for c in coco['categories'] if c['name'] in safe_categories)
    
    img_annos = defaultdict(list)
    for a in coco['annotations']:
        img_annos[a['image_id']].append(a['category_id'])
        
    candidate_replacements = []
    for img_id, img_info in images_by_id.items():
        if img_id in already_used_ids:
            continue
        anno_cats = set(img_annos.get(img_id, []))
        # Must have safe categories and no excluded categories (no potted plant 64)
        if len(anno_cats) > 0 and anno_cats.issubset(safe_cat_ids) and 64 not in anno_cats:
            primary_cat_id = list(anno_cats)[0]
            candidate_replacements.append((img_id, cat_names[primary_cat_id]))
            
    rng = random.Random(SEED + 100)
    rng.shuffle(candidate_replacements)
    
    print(f"Available candidate replacement pool: {len(candidate_replacements)}")
    
    # Download and audit replacements until reaching target_count
    replacement_records = []
    download_tasks = []
    for img_id, cat_name in candidate_replacements:
        url = images_by_id[img_id].get('coco_url') or f"http://images.cocodataset.org/val2017/{img_id:012d}.jpg"
        download_tasks.append((img_id, url, cat_name))
        
    print("Downloading candidate replacements...")
    downloaded_replacements = []
    with ThreadPoolExecutor(max_workers=16) as executor:
        futures = [executor.submit(download_coco_image, (task[0], task[1]), out_dir) for task in download_tasks]
        for idx, f in enumerate(futures):
            img_id, path, err = f.result()
            cat_name = download_tasks[idx][2]
            if path and os.path.exists(path):
                downloaded_replacements.append((img_id, path, cat_name))
                
    # Audit downloaded replacements
    print("Auditing downloaded replacements...")
    selected_replacements = []
    for img_id, path, cat_name in downloaded_replacements:
        if len(accepted_records) + len(selected_replacements) >= TARGET_COUNT:
            break
        status, reason = assess_image_vegetation(path, cat_name)
        if status == "accepted":
            sha256 = compute_sha256(path)
            phash = compute_phash(path)
            if phash:
                rec = {
                    "id": str(uuid.uuid5(uuid.NAMESPACE_URL, path)),
                    "source": "coco2017",
                    "original_path": path,
                    "raw_label": cat_name,
                    "canonical_class": "background",
                    "domain": "negative",
                    "split": None,
                    "sha256": sha256,
                    "phash": phash,
                    "duplicate_cluster": None,
                    "source_group_id": f"coco_{img_id:012d}"
                }
                selected_replacements.append(rec)
                audit_results.append({
                    "id": rec['id'],
                    "original_path": path,
                    "raw_label": cat_name,
                    "background_audit_status": "accepted",
                    "audit_reason": "Clean replacement sample"
                })
                
    print(f"Selected {len(selected_replacements)} clean replacement images.")
    
    # Combine final 750 images
    final_records = accepted_records + selected_replacements
    print(f"Final usable background image count: {len(final_records)}")
    
    # Save full audit log
    audit_log_path = "data/manifests/coco_background_audit.csv"
    pd.DataFrame(audit_results).to_csv(audit_log_path, index=False)
    print(f"Full background audit log written to {audit_log_path}")
    
    # pHash Clustering Audit
    cluster_centers = {}
    cluster_id = 0
    for rec in tqdm(final_records, desc="pHash clustering"):
        h1 = imagehash.hex_to_hash(rec['phash'])
        found_cluster = None
        for cid, h2 in cluster_centers.items():
            if h1 - h2 <= 4:
                found_cluster = cid
                break
        if found_cluster is not None:
            rec['duplicate_cluster'] = found_cluster
        else:
            cid = f"coco_cluster_{cluster_id}"
            cluster_centers[cid] = h1
            rec['duplicate_cluster'] = cid
            cluster_id += 1
            
    cluster_members = defaultdict(list)
    for rec in final_records:
        cluster_members[rec['duplicate_cluster']].append(rec)
        
    multi_clusters = sum(1 for c in cluster_members.values() if len(c) > 1)
    singleton_clusters = sum(1 for c in cluster_members.values() if len(c) == 1)
    print(f"Final pHash clusters: {len(cluster_members)} (Multi-image: {multi_clusters}, Singletons: {singleton_clusters})")
    
    # Deterministic Split: 70% TRAIN (525), 15% VAL (112), 15% TEST (113)
    rng = random.Random(SEED)
    cluster_list = list(cluster_members.items())
    rng.shuffle(cluster_list)
    
    total_imgs = len(final_records)
    target_train = round(0.70 * total_imgs) # 525
    target_val = round(0.15 * total_imgs)   # 112
    target_test = total_imgs - target_train - target_val # 113
    
    train_count, val_count, test_count = 0, 0, 0
    split_records = []
    
    for cid, members in cluster_list:
        sz = len(members)
        if train_count + sz <= target_train or (val_count >= target_val and test_count >= target_test):
            s = "train"
            train_count += sz
        elif val_count + sz <= target_val or (test_count >= target_test):
            s = "val"
            val_count += sz
        else:
            s = "test"
            test_count += sz
            
        for m in members:
            m['split'] = s
            split_records.append(m)
            
    df_final = pd.DataFrame(split_records)
    cols = ["id", "source", "original_path", "raw_label", "canonical_class", "domain", "split", "sha256", "phash", "duplicate_cluster", "source_group_id"]
    df_final = df_final[cols]
    df_final.to_csv(manifest_path, index=False)
    print(f"Final background manifest written to {manifest_path}")
    
    # Final Validation
    pv_manifest_path = "data/manifests/dataset_manifest.csv"
    pd_manifest_path = "data/manifests/plantdoc_manifest.csv"
    pv_hashes = set(pd.read_csv(pv_manifest_path)['sha256']) if os.path.exists(pv_manifest_path) else set()
    pd_hashes = set(pd.read_csv(pd_manifest_path)['sha256']) if os.path.exists(pd_manifest_path) else set()
    bg_hashes = set(df_final['sha256'])
    
    print("\n" + "="*50)
    print("FINAL COCO BACKGROUND AUDIT SUMMARY")
    print("="*50)
    print(f"Total usable background images: {len(df_final)}")
    print(f"Split counts:\n{df_final['split'].value_counts()}")
    print(f"Matches against PlantVillage: {len(bg_hashes & pv_hashes)}")
    print(f"Matches against PlantDoc: {len(bg_hashes & pd_hashes)}")
    print(f"Internal SHA256 duplicates: {len(df_final) - df_final['sha256'].nunique()}")

if __name__ == "__main__":
    main()
