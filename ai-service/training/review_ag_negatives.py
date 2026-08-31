import os
import random
import pandas as pd
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import imagehash
from collections import defaultdict

def main():
    base_prefix = ""
    if not os.path.exists("data/manifests") and os.path.exists("ai-service/data/manifests"):
        base_prefix = "ai-service/"
        
    cand_manifest_path = os.path.join(base_prefix, 'data/manifests/ag_background_candidates.csv')
    excl_manifest_path = os.path.join(base_prefix, 'data/manifests/ag_background_exclusions.csv')
    artifacts_dir = os.path.join(base_prefix, 'training/artifacts/ag_negative_review')
    os.makedirs(artifacts_dir, exist_ok=True)
    
    # 1. Load Current Candidates
    df_all_cand = pd.read_csv(cand_manifest_path)
    print(f"Total raw candidates in manifest: {len(df_all_cand)}")
    
    # 2. Exclude Bell Pepper
    is_bell_pepper = (df_all_cand['raw_label'] == 'Bell_pepper leaf') | (df_all_cand['species'] == 'bell_pepper_healthy')
    df_bell_pepper = df_all_cand[is_bell_pepper].copy()
    df_accepted = df_all_cand[~is_bell_pepper].copy().reset_index(drop=True)
    
    # Mark exclusions
    df_bell_pepper['review_status'] = 'EXCLUDED_FROM_INITIAL_ADAPTATION'
    df_bell_pepper['exclusion_reason'] = (
        'CLOSE_TAXONOMIC_VISUAL_NEGATIVE: healthy Solanaceae foliage may interfere '
        'with tomato/potato healthy crop boundary during first domain adaptation experiment.'
    )
    
    # Save exclusions manifest
    df_bell_pepper.to_csv(excl_manifest_path, index=False)
    print(f"Wrote {len(df_bell_pepper)} exclusions to {excl_manifest_path}")
    
    # Update candidate manifest with accepted only
    df_accepted.to_csv(cand_manifest_path, index=False)
    print(f"Updated {len(df_accepted)} accepted candidates in {cand_manifest_path}")
    
    # 3. Comprehensive Cross-Dataset Collision Audit
    pv_path = os.path.join(base_prefix, 'data/manifests/dataset_manifest.csv')
    pd_field_path = os.path.join(base_prefix, 'data/manifests/field_eval_manifest.csv')
    pd_train_path = os.path.join(base_prefix, 'data/manifests/plantdoc_adapt_train_manifest.csv')
    pd_val_path = os.path.join(base_prefix, 'data/manifests/plantdoc_adapt_val_manifest.csv')
    pd_holdout_path = os.path.join(base_prefix, 'data/manifests/plantdoc_test_holdout.csv')
    coco_path = os.path.join(base_prefix, 'data/manifests/background_manifest.csv')
    
    df_pv = pd.read_csv(pv_path)
    df_pd_field = pd.read_csv(pd_field_path)
    df_pd_train = pd.read_csv(pd_train_path)
    df_pd_val = pd.read_csv(pd_val_path)
    df_pd_holdout = pd.read_csv(pd_holdout_path)
    df_coco = pd.read_csv(coco_path)
    
    print("\n" + "="*60)
    print("AUTHORITATIVE DATASET AUDIT COUNTS")
    print("="*60)
    print(f"PlantVillage Total Images:        {len(df_pv)} (Unique SHA: {df_pv['sha256'].nunique()})")
    print(f"PlantDoc Total Screened Field:    {len(df_pd_field)} (Unique SHA: {df_pd_field['sha256'].nunique()})")
    print(f"PlantDoc Adapt Train:             {len(df_pd_train)}")
    print(f"PlantDoc Adapt Val:               {len(df_pd_val)}")
    print(f"PlantDoc Quarantined Holdout:     {len(df_pd_holdout)}")
    print(f"COCO Generic Negatives:           {len(df_coco)} (Unique SHA: {df_coco['sha256'].nunique()})")
    print(f"Agricultural Candidates (Accept): {len(df_accepted)}")
    
    cand_shas = set(df_accepted['sha256'])
    
    # SHA Collisions
    pv_collisions = cand_shas & set(df_pv['sha256'])
    pd_field_collisions = cand_shas & set(df_pd_field['sha256'])
    pd_holdout_collisions = cand_shas & set(df_pd_holdout['sha256'])
    coco_collisions = cand_shas & set(df_coco['sha256'])
    
    print("\n--- SHA256 Collision Results ---")
    print(f"  Against ALL 6,637 PlantVillage:       {len(pv_collisions)} collisions")
    print(f"  Against ALL 448 PlantDoc Target:     {len(pd_field_collisions)} collisions")
    print(f"  Against 38 PlantDoc Holdout:         {len(pd_holdout_collisions)} collisions")
    print(f"  Against 750 COCO Negatives:          {len(coco_collisions)} collisions")
    assert len(pv_collisions) == 0, "SHA Collision with PlantVillage!"
    assert len(pd_field_collisions) == 0, "SHA Collision with PlantDoc target benchmark!"
    assert len(pd_holdout_collisions) == 0, "SHA Collision with PlantDoc holdout!"
    assert len(coco_collisions) == 0, "SHA Collision with COCO background!"
    
    # pHash Proximity Audit (<= 4)
    print("\n--- Exhaustive Pairwise pHash Proximity Audit (threshold <= 4) ---")
    cand_hashes = [(r['id'], r['species'], imagehash.hex_to_hash(r['phash'])) for _, r in df_accepted.iterrows()]
    pv_hashes = [(r['id'], r['canonical_class'], imagehash.hex_to_hash(r['phash'])) for _, r in df_pv.iterrows()]
    pd_hashes = [(r['id'], r['canonical_class'], imagehash.hex_to_hash(r['phash'])) for _, r in df_pd_field.iterrows()]
    coco_hashes = [(r['id'], r['raw_label'], imagehash.hex_to_hash(r['phash'])) for _, r in df_coco.iterrows()]
    
    suspicious_pairs = []
    for cid, cspec, ch in cand_hashes:
        for pid, pclass, ph in pv_hashes:
            if ch - ph <= 4:
                suspicious_pairs.append(('PlantVillage', cid, cspec, pid, pclass, ch - ph))
        for pdid, pdclass, pdh in pd_hashes:
            if ch - pdh <= 4:
                suspicious_pairs.append(('PlantDoc_Target', cid, cspec, pdid, pdclass, ch - pdh))
        for coid, coraw, coh in coco_hashes:
            if ch - coh <= 4:
                suspicious_pairs.append(('COCO', cid, cspec, coid, coraw, ch - coh))
                
    print(f"Total cross-dataset pHash <= 4 suspicious pairs: {len(suspicious_pairs)}")
    
    # 4. Generate Visual Review Contact Sheets
    print("\n" + "="*60)
    print("GENERATING VISUAL CURATION REVIEW CONTACT SHEETS")
    print("="*60)
    
    # Group accepted by species
    species_groups = defaultdict(list)
    for _, r in df_accepted.iterrows():
        species_groups[r['species']].append(r)
        
    # We will make two contact sheets:
    # 1. DeepWeeds Review Sheet (9 species x 3 samples = 27 images)
    # 2. PlantDoc Non-Target Review Sheet (8 species x 3 samples = 24 images)
    
    def create_contact_sheet(species_list, title, outfile_name, samples_per_sp=3):
        n_species = len(species_list)
        cell_size = 200
        padding = 10
        label_height = 30
        title_height = 50
        
        grid_cols = samples_per_sp
        grid_rows = n_species
        
        sheet_w = grid_cols * (cell_size + padding) + padding
        sheet_h = title_height + grid_rows * (cell_size + label_height + padding) + padding
        
        sheet = Image.new('RGB', (sheet_w, sheet_h), color=(245, 245, 245))
        draw = ImageDraw.Draw(sheet)
        
        # Title
        draw.text((padding, 15), title, fill=(20, 20, 20))
        
        rng = random.Random(42)
        for row_idx, sp in enumerate(species_list):
            items = list(species_groups[sp])
            rng.shuffle(items)
            samples = items[:samples_per_sp]
            
            y_base = title_height + row_idx * (cell_size + label_height + padding)
            # Label
            draw.text((padding, y_base), f"{row_idx+1}. {sp} ({len(items)} available)", fill=(40, 40, 40))
            
            for col_idx, item in enumerate(samples):
                x_pos = padding + col_idx * (cell_size + padding)
                y_pos = y_base + label_height
                
                img_p = item['original_path']
                if not os.path.exists(img_p) and os.path.exists(os.path.join(base_prefix, img_p)):
                    img_p = os.path.join(base_prefix, img_p)
                    
                try:
                    with Image.open(img_p) as im:
                        im_thumb = im.convert('RGB').resize((cell_size, cell_size))
                        sheet.paste(im_thumb, (x_pos, y_pos))
                        draw.rectangle([x_pos, y_pos, x_pos+cell_size, y_pos+cell_size], outline=(180, 180, 180), width=1)
                except Exception as e:
                    print(f"Error loading {img_p}: {e}")
                    
        out_path = os.path.join(artifacts_dir, outfile_name)
        sheet.save(out_path, quality=90)
        print(f"Saved contact sheet: {out_path} ({sheet_w}x{sheet_h})")
        return out_path
        
    dw_species = [
        'Chinee apple', 'Lantana', 'Parkinsonia', 'Parthenium', 
        'Prickly acacia', 'Rubber vine', 'Siam weed', 'Snake weed', 'Negative'
    ]
    pd_species = [
        'apple_healthy', 'blueberry_healthy', 'cherry_healthy', 'peach_healthy', 
        'raspberry_healthy', 'soybean_healthy', 'strawberry_healthy', 'grape_healthy'
    ]
    
    create_contact_sheet(dw_species, "DeepWeeds Curated Candidates (Weed & Pasture Grass)", "deepweeds_review_grid.jpg", samples_per_sp=3)
    create_contact_sheet(pd_species, "PlantDoc Non-Target Healthy Foliage Candidates (Unsupported Crops)", "plantdoc_nontarget_review_grid.jpg", samples_per_sp=3)
    
    print("\n" + "="*60)
    print("UPDATED CANDIDATE SUMMARY")
    print("="*60)
    print(f"Accepted Candidates: {len(df_accepted)}")
    print(f"Excluded Candidates: {len(df_bell_pepper)}")
    print("\nCounts by Source:")
    print(df_accepted['source'].value_counts())
    print("\nCounts by Category:")
    print(df_accepted['category'].value_counts())
    print("\nCounts by Species:")
    print(df_accepted['species'].value_counts())

if __name__ == "__main__":
    main()
