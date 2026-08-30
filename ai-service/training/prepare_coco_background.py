import os
import json
import random
import urllib.request
import hashlib
import uuid
import pandas as pd
from PIL import Image
import imagehash
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

def select_diverse_coco_negatives(coco_json_path="training/annotations/instances_val2017.json", target_count=750, seed=42):
    with open(coco_json_path, 'r') as f:
        coco = json.load(f)
        
    rng = random.Random(seed)
    
    # Categories
    categories = {c['id']: c for c in coco['categories']}
    cat_names = {c['id']: c['name'] for c in coco['categories']}
    
    # Images metadata
    images_by_id = {img['id']: img for img in coco['images']}
    
    # Group annotations by image
    img_annos = defaultdict(list)
    for a in coco['annotations']:
        img_annos[a['image_id']].append(a['category_id'])
        
    # Exclusion filter:
    # Exclude potted plant (id 64)
    # Also exclude images with zero annotations or ambiguous greenery
    excluded_cats = {64} # potted plant
    
    # Candidate images
    candidate_img_ids = []
    cat_to_imgs = defaultdict(list)
    
    for img_id, img_info in images_by_id.items():
        anno_cats = set(img_annos.get(img_id, []))
        # Must have at least one annotation and none of the excluded categories
        if len(anno_cats) > 0 and not (anno_cats & excluded_cats):
            candidate_img_ids.append(img_id)
            # Register under its primary categories
            for cid in anno_cats:
                cat_to_imgs[cid].append(img_id)
                
    print(f"Total candidate COCO images (excluding potted plants): {len(candidate_img_ids)}")
    
    # Diverse selection across categories
    # Sort categories by size, deterministically pick images evenly
    selected_img_ids = set()
    selected_meta = {} # img_id -> primary_category
    
    # Round-robin selection across all non-plant categories
    cat_ids = sorted(list(cat_to_imgs.keys()))
    for cid in cat_ids:
        rng.shuffle(cat_to_imgs[cid])
        
    round_num = 0
    while len(selected_img_ids) < target_count and round_num < 50:
        for cid in cat_ids:
            if len(selected_img_ids) >= target_count:
                break
            imgs = cat_to_imgs[cid]
            if round_num < len(imgs):
                candidate_id = imgs[round_num]
                if candidate_id not in selected_img_ids:
                    selected_img_ids.add(candidate_id)
                    selected_meta[candidate_id] = cat_names[cid]
        round_num += 1
        
    selected_list = sorted(list(selected_img_ids))
    print(f"Selected {len(selected_list)} diverse COCO negative images.")
    
    # Summary of category distribution
    cat_distribution = defaultdict(int)
    for iid in selected_list:
        cat_distribution[selected_meta[iid]] += 1
        
    return selected_list, selected_meta, cat_distribution, images_by_id

def main():
    out_dir = "data/raw/background/coco_negatives"
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs("data/manifests", exist_ok=True)
    
    selected_ids, selected_meta, cat_dist, images_by_id = select_diverse_coco_negatives(
        coco_json_path="training/annotations/instances_val2017.json",
        target_count=TARGET_COUNT,
        seed=SEED
    )
    
    # Prepare download tasks
    download_tasks = []
    for img_id in selected_ids:
        img_info = images_by_id[img_id]
        # Official COCO image URL
        url = img_info.get('coco_url') or f"http://images.cocodataset.org/val2017/{img_id:012d}.jpg"
        download_tasks.append((img_id, url))
        
    print("\nDownloading selected COCO images...")
    downloaded_paths = {}
    with ThreadPoolExecutor(max_workers=16) as executor:
        futures = [executor.submit(download_coco_image, task, out_dir) for task in download_tasks]
        for f in tqdm(futures, desc="Downloading"):
            img_id, path, err = f.result()
            if path:
                downloaded_paths[img_id] = path
            else:
                print(f"Download failed for {img_id}: {err}")
                
    # Validate and compute hashes
    print("\nValidating downloaded images & computing hashes...")
    records = []
    corrupt_count = 0
    
    for img_id in selected_ids:
        path = downloaded_paths.get(img_id)
        if not path or not os.path.exists(path):
            corrupt_count += 1
            continue
            
        try:
            with Image.open(path) as img:
                img.verify()
            if os.path.getsize(path) == 0:
                raise ValueError("Zero-byte file")
                
            sha256 = compute_sha256(path)
            phash = compute_phash(path)
            if not phash:
                raise ValueError("pHash computation failed")
                
            records.append({
                "id": str(uuid.uuid5(uuid.NAMESPACE_URL, path)),
                "source": "coco2017",
                "original_path": path,
                "raw_label": selected_meta[img_id],
                "canonical_class": "background",
                "domain": "negative",
                "split": None, # to be assigned 70/15/15
                "sha256": sha256,
                "phash": phash,
                "duplicate_cluster": None,
                "source_group_id": f"coco_{img_id:012d}"
            })
        except Exception as e:
            print(f"Validation error on {path}: {e}")
            corrupt_count += 1
            
    print(f"Total validated background images: {len(records)}")
    print(f"Corrupt/failed images: {corrupt_count}")
    
    # Internal duplicate check
    sha_seen = {}
    unique_records = []
    exact_duplicates = 0
    for r in records:
        if r['sha256'] not in sha_seen:
            sha_seen[r['sha256']] = r
            unique_records.append(r)
        else:
            exact_duplicates += 1
    print(f"Internal exact SHA256 duplicates: {exact_duplicates}")
    
    # Cross-dataset hash check against PlantVillage & PlantDoc
    pv_manifest_path = "data/manifests/dataset_manifest.csv"
    pd_manifest_path = "data/manifests/plantdoc_manifest.csv"
    
    pv_hashes = set(pd.read_csv(pv_manifest_path)['sha256']) if os.path.exists(pv_manifest_path) else set()
    pd_hashes = set(pd.read_csv(pd_manifest_path)['sha256']) if os.path.exists(pd_manifest_path) else set()
    
    coco_hashes = set(r['sha256'] for r in unique_records)
    match_pv = coco_hashes & pv_hashes
    match_pd = coco_hashes & pd_hashes
    print(f"Matches against PlantVillage: {len(match_pv)}")
    print(f"Matches against PlantDoc: {len(match_pd)}")
    
    # pHash clustering audit (threshold 4)
    print("\nClustering near-duplicates via pHash (threshold=4)...")
    cluster_centers = {}
    cluster_id = 0
    for rec in tqdm(unique_records, desc="pHash clustering"):
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
    for rec in unique_records:
        cluster_members[rec['duplicate_cluster']].append(rec)
        
    total_clusters = len(cluster_members)
    multi_clusters = sum(1 for c in cluster_members.values() if len(c) > 1)
    singleton_clusters = sum(1 for c in cluster_members.values() if len(c) == 1)
    print(f"Total pHash clusters: {total_clusters} (Multi-image: {multi_clusters}, Singletons: {singleton_clusters})")
    
    # Deterministic Split: 70% TRAIN, 15% VAL, 15% TEST
    # Grouped by duplicate_cluster / source_group_id so near-duplicates stay together
    print("\nSplitting background images 70/15/15...")
    rng = random.Random(SEED)
    
    cluster_list = list(cluster_members.items())
    rng.shuffle(cluster_list)
    
    total_imgs = len(unique_records)
    target_train = round(0.70 * total_imgs)
    target_val = round(0.15 * total_imgs)
    target_test = total_imgs - target_train - target_val
    
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
            
    df_bg = pd.DataFrame(split_records)
    cols = ["id", "source", "original_path", "raw_label", "canonical_class", "domain", "split", "sha256", "phash", "duplicate_cluster", "source_group_id"]
    df_bg = df_bg[cols]
    
    bg_manifest_path = "data/manifests/background_manifest.csv"
    df_bg.to_csv(bg_manifest_path, index=False)
    print(f"Background manifest written to {bg_manifest_path}")
    
    print("\n" + "="*50)
    print("COCO BACKGROUND SUMMARY")
    print("="*50)
    print(f"Total usable background images: {len(df_bg)}")
    print(f"Split counts:\n{df_bg['split'].value_counts()}")
    print("\nTop Categories in Background:")
    print(df_bg['raw_label'].value_counts().head(15))

if __name__ == "__main__":
    main()
