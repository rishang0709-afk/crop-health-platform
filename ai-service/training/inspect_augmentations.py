import os
import random
import torch
import numpy as np
import pandas as pd
from PIL import Image, ImageDraw
from torchvision import transforms

# Import dataset transforms
import sys
sys.path.insert(0, os.path.dirname(__file__))
from dataset import get_train_transforms, get_eval_transforms

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406])
IMAGENET_STD = np.array([0.229, 0.224, 0.225])

def unnormalize_tensor_to_pil(tensor):
    """Converts normalized PyTorch tensor (3, 224, 224) back to a PIL Image (RGB)."""
    np_img = tensor.cpu().numpy().transpose((1, 2, 0))
    np_img = np_img * IMAGENET_STD + IMAGENET_MEAN
    np_img = np.clip(np_img * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(np_img)

def render_augmentation_grid(samples, title, out_path, num_aug=4, cell_size=200, padding=10, label_h=30, title_h=50):
    """
    Renders a contact sheet where each row shows:
    [Original 224x224 (Eval transform)] | [Aug 1] | [Aug 2] | [Aug 3] | [Aug 4]
    """
    n_rows = len(samples)
    n_cols = 1 + num_aug
    
    sheet_w = n_cols * (cell_size + padding) + padding
    sheet_h = title_h + n_rows * (cell_size + label_h + padding) + padding
    
    sheet = Image.new('RGB', (sheet_w, sheet_h), color=(245, 245, 245))
    draw = ImageDraw.Draw(sheet)
    
    # Title
    draw.text((padding, 15), title, fill=(20, 20, 20))
    
    train_tf = get_train_transforms()
    eval_tf = get_eval_transforms()
    
    for row_idx, sample in enumerate(samples):
        y_base = title_h + row_idx * (cell_size + label_h + padding)
        row_label = f"{row_idx+1}. [{sample['domain']}] {sample['label']}"
        draw.text((padding, y_base), row_label, fill=(30, 30, 30))
        
        img_p = sample['path']
        try:
            with Image.open(img_p) as raw_img:
                raw_rgb = raw_img.convert('RGB')
        except Exception as e:
            print(f"Error opening {img_p}: {e}")
            continue
            
        # 1. Col 0: Original (Eval transform)
        orig_tensor = eval_tf(raw_rgb)
        orig_pil = unnormalize_tensor_to_pil(orig_tensor).resize((cell_size, cell_size))
        x_pos = padding
        y_pos = y_base + label_h
        sheet.paste(orig_pil, (x_pos, y_pos))
        draw.rectangle([x_pos, y_pos, x_pos+cell_size, y_pos+cell_size], outline=(100, 100, 100), width=2)
        draw.text((x_pos + 5, y_pos + 5), "ORIG (Eval)", fill=(255, 255, 255))
        
        # 2. Cols 1..N: Stochastic Augmented Variants
        for aug_idx in range(num_aug):
            aug_tensor = train_tf(raw_rgb)
            aug_pil = unnormalize_tensor_to_pil(aug_tensor).resize((cell_size, cell_size))
            x_aug = padding + (1 + aug_idx) * (cell_size + padding)
            sheet.paste(aug_pil, (x_aug, y_pos))
            draw.rectangle([x_aug, y_pos, x_aug+cell_size, y_pos+cell_size], outline=(180, 180, 180), width=1)
            draw.text((x_aug + 5, y_pos + 5), f"Aug #{aug_idx+1}", fill=(255, 255, 255))
            
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    sheet.save(out_path, quality=92)
    print(f"Saved: {out_path} ({sheet_w}x{sheet_h})")
    return out_path

def run_dry_transform_smoke_test(all_sample_paths):
    """
    Validates transform outputs without initializing a model training loop:
    - Output tensor shape is always (3, 224, 224)
    - No NaNs or Infs
    - Training transform exhibits randomness
    - Evaluation transform exhibits 100% determinism
    """
    print("\n" + "="*60)
    print("RUNNING DRY TRANSFORM SMOKE TEST (NO TRAINING)")
    print("="*60)
    
    train_tf = get_train_transforms()
    eval_tf = get_eval_transforms()
    
    all_passed = True
    
    for idx, p in enumerate(all_sample_paths):
        with Image.open(p) as img:
            rgb = img.convert('RGB')
            
        # 1. Check eval determinism
        t1 = eval_tf(rgb)
        t2 = eval_tf(rgb)
        assert torch.equal(t1, t2), f"Eval transform non-deterministic on {p}!"
        assert t1.shape == (3, 224, 224), f"Wrong eval shape: {t1.shape}"
        assert not torch.isnan(t1).any(), f"NaN in eval tensor for {p}"
        assert not torch.isinf(t1).any(), f"Inf in eval tensor for {p}"
        
        # 2. Check train randomness and bounds
        train_tensors = [train_tf(rgb) for _ in range(5)]
        for tt in train_tensors:
            assert tt.shape == (3, 224, 224), f"Wrong train shape: {tt.shape}"
            assert not torch.isnan(tt).any(), f"NaN in train tensor for {p}"
            assert not torch.isinf(tt).any(), f"Inf in train tensor for {p}"
            
        # Verify stochasticity (at least two stochastic runs differ)
        diff = sum(not torch.equal(train_tensors[0], train_tensors[i]) for i in range(1, 5))
        assert diff > 0, f"Training transform was deterministic (no stochasticity) on {p}!"
        
    print(f"[PASS] Smoke test verified on {len(all_sample_paths)} images:")
    print("  - Output shapes consistently torch.Size([3, 224, 224])")
    print("  - Zero NaN / Inf values detected across all tensor outputs")
    print("  - Evaluation transform is 100% deterministic (t1 == t2)")
    print("  - Training transform exhibits healthy stochastic variation across iterations")

def main():
    base_prefix = ""
    if not os.path.exists("data/manifests") and os.path.exists("ai-service/data/manifests"):
        base_prefix = "ai-service/"
        
    pv_manifest = os.path.join(base_prefix, "data/manifests/dataset_manifest.csv")
    pd_manifest = os.path.join(base_prefix, "data/manifests/plantdoc_adapt_train_manifest.csv")
    bg_manifest = os.path.join(base_prefix, "data/manifests/combined_background_manifest.csv")
    
    out_dir = os.path.join(base_prefix, "training/artifacts/aug_samples")
    os.makedirs(out_dir, exist_ok=True)
    
    # 1. Select PlantVillage samples (6 classes)
    df_pv = pd.read_csv(pv_manifest)
    pv_samples = []
    for c_class in sorted(df_pv['canonical_class'].unique()):
        match = df_pv[(df_pv['canonical_class'] == c_class) & (df_pv['split'] == 'train')].iloc[0]
        p = match['original_path']
        if not os.path.exists(p) and os.path.exists(os.path.join(base_prefix, p)):
            p = os.path.join(base_prefix, p)
        pv_samples.append({"domain": "PlantVillage", "label": c_class, "path": p})
        
    # 2. Select PlantDoc adapt train samples (5 classes)
    df_pd = pd.read_csv(pd_manifest)
    pd_samples = []
    for c_class in sorted(df_pd['canonical_class'].unique()):
        match = df_pd[df_pd['canonical_class'] == c_class].iloc[0]
        p = match['original_path']
        if not os.path.exists(p) and os.path.exists(os.path.join(base_prefix, p)):
            p = os.path.join(base_prefix, p)
        pd_samples.append({"domain": "PlantDoc_Field", "label": c_class, "path": p})
        
    # 3. Select Background samples (4 categories)
    df_bg = pd.read_csv(bg_manifest)
    bg_samples = []
    for cat in ["general_coco", "weed", "grass", "unsupported_crop"]:
        match = df_bg[(df_bg['category'] == cat) & (df_bg['split'] == 'train')].iloc[0]
        p = match['original_path']
        if not os.path.exists(p) and os.path.exists(os.path.join(base_prefix, p)):
            p = os.path.join(base_prefix, p)
        bg_samples.append({"domain": f"Background_{match['source']}", "label": f"{cat} ({match['species']})", "path": p})
        
    print("="*60)
    print("GENERATING AUGMENTATION REVIEW GRIDS")
    print("="*60)
    
    # Render contact sheets
    render_augmentation_grid(
        pv_samples, 
        "PlantVillage Controlled Crop Augmentations (Original vs 4 Stochastic Passes)", 
        os.path.join(out_dir, "aug_grid_plantvillage.jpg")
    )
    
    render_augmentation_grid(
        pd_samples, 
        "PlantDoc Field Adaptation Crop Augmentations (Original vs 4 Stochastic Passes)", 
        os.path.join(out_dir, "aug_grid_plantdoc_adapt.jpg")
    )
    
    render_augmentation_grid(
        bg_samples, 
        "Hybrid Background Augmentations (Original vs 4 Stochastic Passes)", 
        os.path.join(out_dir, "aug_grid_background.jpg")
    )
    
    render_augmentation_grid(
        pv_samples + pd_samples + bg_samples,
        "Comprehensive Multi-Domain Training Augmentations (Original vs 4 Stochastic Passes)",
        os.path.join(out_dir, "aug_grid_all_domains.jpg")
    )
    
    # Run dry transform smoke test
    all_paths = [s['path'] for s in pv_samples + pd_samples + bg_samples]
    run_dry_transform_smoke_test(all_paths)

if __name__ == "__main__":
    main()
