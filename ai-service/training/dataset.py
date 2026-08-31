import os
import io
import json
import random
import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset
from PIL import Image
from torchvision import transforms

def load_class_mapping(mapping_path="training/class_mapping.json"):
    """Loads authoritative class mapping dictionary."""
    if not os.path.exists(mapping_path):
        # Fallback for relative path when called from repo root
        if os.path.exists(os.path.join("ai-service", mapping_path)):
            mapping_path = os.path.join("ai-service", mapping_path)
        else:
            raise FileNotFoundError(f"Class mapping file not found: {mapping_path}")
    with open(mapping_path, "r") as f:
        data = json.load(f)
    class_to_index = data["class_to_index"]
    index_to_class = {int(k): v for k, v in data["index_to_class"].items()}
    return class_to_index, index_to_class

class RandomJPEGCompression:
    """
    Simulates realistic smartphone / camera JPEG compression artifacts.
    Operates safely in-memory on PIL Image objects without external dependencies.
    """
    def __init__(self, p=0.20, quality_range=(60, 90)):
        self.p = p
        self.quality_range = quality_range

    def __call__(self, img):
        if random.random() < self.p:
            quality = random.randint(*self.quality_range)
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=quality)
            buf.seek(0)
            return Image.open(buf).convert('RGB')
        return img

    def __repr__(self):
        return f"RandomJPEGCompression(p={self.p}, quality_range={self.quality_range})"

def get_train_transforms():
    """
    Conservative, morphology-safe training transforms designed for foliar plant pathology.
    Preserves lesion boundaries, concentric fungal rings, and botanical color integrity.
    """
    return transforms.Compose([
        transforms.RandomResizedCrop(224, scale=(0.65, 1.0), ratio=(0.85, 1.15)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomAffine(degrees=(-15, 15), translate=(0.05, 0.05), scale=(0.95, 1.05)),
        transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15, hue=0.02),
        transforms.RandomApply([transforms.GaussianBlur(kernel_size=3, sigma=(0.1, 1.0))], p=0.15),
        RandomJPEGCompression(p=0.20, quality_range=(60, 90)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

def get_eval_transforms():
    """Deterministic validation and test evaluation transforms."""
    return transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

class CropHealthDataset(Dataset):
    """
    Manifest-driven PyTorch Dataset for Crop Health classification.
    Loads images directly from paths defined in manifest CSV files.
    """
    def __init__(self, manifest_path, split=None, transform=None, class_mapping_path="training/class_mapping.json"):
        base_prefix = ""
        if not os.path.exists(manifest_path) and os.path.exists(os.path.join("ai-service", manifest_path)):
            manifest_path = os.path.join("ai-service", manifest_path)
            base_prefix = "ai-service/"
            
        if not os.path.exists(manifest_path):
            raise FileNotFoundError(f"Manifest file not found: {manifest_path}")
            
        self.class_to_index, self.index_to_class = load_class_mapping(class_mapping_path)
        self.transform = transform
        self.split = split
        
        df = pd.read_csv(manifest_path)
        if split is not None:
            if "split" not in df.columns:
                raise ValueError(f"Requested split '{split}', but 'split' column not in {manifest_path}")
            df = df[df["split"] == split].reset_index(drop=True)
            
        self.records = []
        for idx, row in df.iterrows():
            c_class = row["canonical_class"]
            if c_class not in self.class_to_index:
                raise ValueError(f"Unknown canonical_class '{c_class}' at index {idx} in {manifest_path}")
            
            img_path = row["original_path"]
            if not os.path.exists(img_path) and os.path.exists(os.path.join(base_prefix, img_path)):
                img_path = os.path.join(base_prefix, img_path)
                
            if not os.path.exists(img_path):
                raise FileNotFoundError(f"Image not found at {img_path} (referenced in {manifest_path})")
                
            self.records.append({
                "path": img_path,
                "label_idx": self.class_to_index[c_class],
                "canonical_class": c_class,
                "id": row.get("id", str(idx))
            })
            
    def __len__(self):
        return len(self.records)
        
    def __getitem__(self, idx):
        rec = self.records[idx]
        try:
            with Image.open(rec["path"]) as img:
                img = img.convert("RGB")
        except Exception as e:
            raise RuntimeError(f"Error reading image {rec['path']}: {e}")
            
        if self.transform:
            img = self.transform(img)
            
        return img, torch.tensor(rec["label_idx"], dtype=torch.long)

def compute_dynamic_class_weights(manifest_path="data/manifests/training_manifest.csv", class_mapping_path="training/class_mapping.json"):
    """
    Computes square-root inverse-frequency class weights dynamically from the TRAIN split.
    raw_weight_c = sqrt(N_total / (C * Nc))
    class_weights = raw_weight_c / mean(raw_weight_c)
    """
    class_to_index, index_to_class = load_class_mapping(class_mapping_path)
    if not os.path.exists(manifest_path) and os.path.exists(os.path.join("ai-service", manifest_path)):
        manifest_path = os.path.join("ai-service", manifest_path)
        
    df = pd.read_csv(manifest_path)
    train_df = df[df["split"] == "train"]
    
    counts = train_df["canonical_class"].value_counts()
    N_total = len(train_df)
    C = len(class_to_index)
    
    raw_weights = np.zeros(C, dtype=np.float32)
    for cls_name, idx in class_to_index.items():
        nc = counts.get(cls_name, 0)
        if nc == 0:
            raise ValueError(f"Class '{cls_name}' has 0 samples in training set!")
        raw_weights[idx] = np.sqrt(N_total / (C * nc))
        
    mean_w = np.mean(raw_weights)
    normalized_weights = raw_weights / mean_w
    return torch.tensor(normalized_weights, dtype=torch.float32)
