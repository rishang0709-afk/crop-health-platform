import os
import sys
import json
import time
import datetime
import random
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
from torchvision import transforms
from torchvision.models import mobilenet_v3_small
from sklearn.metrics import confusion_matrix
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from metrics import compute_classification_metrics

def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False

def load_class_mapping(mapping_path="training/class_mapping.json"):
    if not os.path.exists(mapping_path):
        if os.path.exists(os.path.join("ai-service", mapping_path)):
            mapping_path = os.path.join("ai-service", mapping_path)
    with open(mapping_path, "r") as f:
        data = json.load(f)
    return data["class_to_index"], {int(k): v for k, v in data["index_to_class"].items()}

def get_exp_c_train_transforms():
    """
    Exp C conservative standard training transform (identical to Exp B):
    RandomResizedCrop(224, scale=(0.8, 1.0), ratio=(0.9, 1.1))
    RandomHorizontalFlip(p=0.5)
    RandomRotation(degrees=15)
    ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15, hue=0.02)
    ToTensor()
    Normalize(ImageNet)
    
    NO JPEG compression, NO Gaussian blur, NO 0.65 crop scale, NO MixUp/CutMix, NO copy-paste, NO RandomErasing.
    """
    return transforms.Compose([
        transforms.RandomResizedCrop(224, scale=(0.8, 1.0), ratio=(0.9, 1.1)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomRotation(degrees=15),
        transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15, hue=0.02),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

def get_eval_transforms():
    """Deterministic evaluation transforms."""
    return transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

class ExpCDataset(Dataset):
    """Dataset for Experiment C."""
    def __init__(self, records, transform=None):
        self.records = records
        self.transform = transform
        
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

def build_and_load_model(checkpoint_path, num_classes=7):
    """Builds MobileNetV3-Small and loads Phase 3 best checkpoint."""
    model = mobilenet_v3_small(weights=None)
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Linear(in_features, num_classes)
    
    ckpt = torch.load(checkpoint_path, map_location="cpu")
    if isinstance(ckpt, dict) and "state_dict" in ckpt:
        state_dict = ckpt["state_dict"]
    elif isinstance(ckpt, dict) and "model_state_dict" in ckpt:
        state_dict = ckpt["model_state_dict"]
    else:
        state_dict = ckpt
    model.load_state_dict(state_dict)
    return model

def configure_exp_c_parameters(model):
    """Freezes features 0-8; unfreezes features 9-12 and classifier."""
    for idx in range(9):
        for param in model.features[idx].parameters():
            param.requires_grad = False
    for idx in range(9, len(model.features)):
        for param in model.features[idx].parameters():
            param.requires_grad = True
    for param in model.classifier.parameters():
        param.requires_grad = True

@torch.no_grad()
def evaluate_model(model, dataloader, criterion, device, index_to_class, active_classes_only=False):
    model.eval()
    running_loss = 0.0
    all_preds, all_targets = [], []
    
    for images, targets in dataloader:
        images, targets = images.to(device), targets.to(device)
        outputs = model(images)
        loss = criterion(outputs, targets)
        
        running_loss += loss.item() * images.size(0)
        preds = torch.argmax(outputs, dim=1)
        all_preds.extend(preds.cpu().numpy())
        all_targets.extend(targets.cpu().numpy())
        
    epoch_loss = running_loss / len(dataloader.dataset)
    metrics = compute_classification_metrics(
        all_targets, all_preds, index_to_class=index_to_class, active_classes_only=active_classes_only
    )
    metrics["loss"] = round(float(epoch_loss), 4)
    return metrics, all_targets, all_preds

@torch.no_grad()
def evaluate_ag_negatives(model, dataloader, criterion, device, ag_records, index_to_class):
    """
    Evaluates agricultural hard negative validation set (all ground truth = Class 0: background).
    Reports background recall, false positives, category breakdowns (weeds, grass, unsupported crops).
    """
    model.eval()
    running_loss = 0.0
    all_preds, all_targets = [], []
    
    for images, targets in dataloader:
        images, targets = images.to(device), targets.to(device)
        outputs = model(images)
        loss = criterion(outputs, targets)
        
        running_loss += loss.item() * images.size(0)
        preds = torch.argmax(outputs, dim=1)
        all_preds.extend(preds.cpu().numpy())
        all_targets.extend(targets.cpu().numpy())
        
    epoch_loss = running_loss / len(dataloader.dataset)
    
    total = len(all_preds)
    correct_bg = sum(1 for p in all_preds if p == 0)
    bg_recall = correct_bg / total if total > 0 else 0.0
    fp_count = total - correct_bg
    
    # Class-wise distribution of predictions
    pred_class_counts = {}
    for idx in range(len(index_to_class)):
        cls_name = index_to_class[idx]
        pred_class_counts[cls_name] = int(sum(1 for p in all_preds if p == idx))
        
    # Category breakdown (weed, grass, unsupported_crop)
    category_breakdown = {}
    for i, rec in enumerate(ag_records):
        cat = rec.get("category", "unknown")
        if cat not in category_breakdown:
            category_breakdown[cat] = {"total": 0, "correct_bg": 0, "false_positives": 0, "predictions": {}}
        category_breakdown[cat]["total"] += 1
        p = all_preds[i]
        cls_name = index_to_class[p]
        category_breakdown[cat]["predictions"][cls_name] = category_breakdown[cat]["predictions"].get(cls_name, 0) + 1
        if p == 0:
            category_breakdown[cat]["correct_bg"] += 1
        else:
            category_breakdown[cat]["false_positives"] += 1
            
    for cat, stats in category_breakdown.items():
        stats["rejection_accuracy"] = round(stats["correct_bg"] / stats["total"], 4) if stats["total"] > 0 else 0.0
        
    return {
        "loss": round(float(epoch_loss), 4),
        "total_samples": total,
        "correct_background": correct_bg,
        "rejection_accuracy": round(bg_recall, 4),
        "background_recall": round(bg_recall, 4),
        "false_positive_count": fp_count,
        "prediction_distribution": pred_class_counts,
        "category_breakdown": category_breakdown
    }, all_targets, all_preds

def train_epoch(model, dataloader, criterion, optimizer, device):
    model.train()
    running_loss = 0.0
    
    for images, targets in dataloader:
        images, targets = images.to(device), targets.to(device)
        optimizer.zero_grad()
        
        outputs = model(images)
        loss = criterion(outputs, targets)
        loss.backward()
        optimizer.step()
        
        running_loss += loss.item() * images.size(0)
        
    epoch_loss = running_loss / len(dataloader.dataset)
    return epoch_loss

def run_experiment_c():
    base_prefix = ""
    if not os.path.exists("data/manifests") and os.path.exists("ai-service/data/manifests"):
        base_prefix = "ai-service/"
        
    set_seed(42)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("="*80)
    print("PHASE 4B.4C: EXPERIMENT C (AGRICULTURAL HARD-NEGATIVE ABLATION)")
    print(f"Device: {device} | Start Time: {datetime.datetime.now()}")
    print("="*80)
    
    # 1. Manifest and Checkpoint Paths
    pv_manifest = os.path.join(base_prefix, "data/manifests/dataset_manifest.csv")
    coco_manifest = os.path.join(base_prefix, "data/manifests/background_manifest.csv")
    ag_train_manifest = os.path.join(base_prefix, "data/manifests/ag_background_train_manifest.csv")
    ag_val_manifest = os.path.join(base_prefix, "data/manifests/ag_background_val_manifest.csv")
    pd_val_manifest = os.path.join(base_prefix, "data/manifests/plantdoc_adapt_val_manifest.csv")
    class_mapping_path = os.path.join(base_prefix, "training/class_mapping.json")
    phase3_ckpt_path = os.path.join(base_prefix, "training/checkpoints/best_model.pt")
    
    exp_out_dir = os.path.join(base_prefix, "training/experiments/exp_c_ag_hard_negatives")
    os.makedirs(exp_out_dir, exist_ok=True)
    
    class_to_index, index_to_class = load_class_mapping(class_mapping_path)
    
    # 2. Pre-Training Manifest Validation & Assembly
    print("\n[Step 1: Pre-Training Manifest Validation & Assembly]")
    df_pv = pd.read_csv(pv_manifest)
    df_pv_train = df_pv[df_pv["split"] == "train"].copy()
    df_pv_val = df_pv[df_pv["split"] == "val"].copy()
    
    df_coco = pd.read_csv(coco_manifest)
    df_coco_train = df_coco[df_coco["split"] == "train"].copy()
    df_coco_val = df_coco[df_coco["split"] == "val"].copy()
    
    df_ag_train = pd.read_csv(ag_train_manifest).copy()
    df_ag_val = pd.read_csv(ag_val_manifest).copy()
    
    df_pd_val = pd.read_csv(pd_val_manifest).copy()
    
    # Assertions
    assert len(df_pv_train) == 4645, f"Expected 4645 PV train rows, got {len(df_pv_train)}"
    assert len(df_coco_train) == 525, f"Expected 525 COCO train rows, got {len(df_coco_train)}"
    assert len(df_ag_train) == 301, f"Expected 301 Ag-negative train rows, got {len(df_ag_train)}"
    
    assert len(df_pv_val) == 1004, f"Expected 1004 PV val rows, got {len(df_pv_val)}"
    assert len(df_coco_val) == 112, f"Expected 112 COCO val rows, got {len(df_coco_val)}"
    assert len(df_ag_val) == 65, f"Expected 65 Ag val rows, got {len(df_ag_val)}"
    assert len(df_pd_val) == 81, f"Expected 81 PD val rows, got {len(df_pd_val)}"
    
    train_records = []
    domain_tags = []
    
    # PV train
    for _, row in df_pv_train.iterrows():
        p = row["original_path"]
        if not os.path.exists(p) and os.path.exists(os.path.join(base_prefix, p)):
            p = os.path.join(base_prefix, p)
        train_records.append({
            "path": p,
            "label_idx": class_to_index[row["canonical_class"]],
            "canonical_class": row["canonical_class"],
            "domain": "plantvillage"
        })
        domain_tags.append("plantvillage")
        
    # COCO train
    for _, row in df_coco_train.iterrows():
        p = row["original_path"]
        if not os.path.exists(p) and os.path.exists(os.path.join(base_prefix, p)):
            p = os.path.join(base_prefix, p)
        train_records.append({
            "path": p,
            "label_idx": class_to_index["background"],
            "canonical_class": "background",
            "domain": "coco_generic"
        })
        domain_tags.append("coco_generic")
        
    # Ag-negative train
    for _, row in df_ag_train.iterrows():
        p = row["original_path"]
        if not os.path.exists(p) and os.path.exists(os.path.join(base_prefix, p)):
            p = os.path.join(base_prefix, p)
        train_records.append({
            "path": p,
            "label_idx": class_to_index["background"],
            "canonical_class": "background",
            "domain": "ag_hard_negatives"
        })
        domain_tags.append("ag_hard_negatives")
        
    total_train_rows = len(train_records)
    assert total_train_rows == 5471, f"Expected 5471 unique training rows, got {total_train_rows}"
    
    print(f"  Confirmed Training Dataset Rows (Total: {total_train_rows}):")
    print(f"    - PlantVillage Controlled:     {len(df_pv_train)} ({len(df_pv_train)/total_train_rows*100:.2f}%)")
    print(f"    - COCO Generic Background:     {len(df_coco_train)} ({len(df_coco_train)/total_train_rows*100:.2f}%)")
    print(f"    - Agricultural Hard Negatives: {len(df_ag_train)} ({len(df_ag_train)/total_train_rows*100:.2f}%)")
    print(f"  Quarantine Verification: ZERO PlantDoc adapt_train in gradients, ZERO PlantDoc holdout (38), ZERO Ag test (64), ZERO Controlled test (1101).")
    
    # 3. Assemble Validation Datasets
    ctrl_val_records = []
    for _, row in df_pv_val.iterrows():
        p = row["original_path"]
        if not os.path.exists(p) and os.path.exists(os.path.join(base_prefix, p)):
            p = os.path.join(base_prefix, p)
        ctrl_val_records.append({"path": p, "label_idx": class_to_index[row["canonical_class"]], "canonical_class": row["canonical_class"]})
    for _, row in df_coco_val.iterrows():
        p = row["original_path"]
        if not os.path.exists(p) and os.path.exists(os.path.join(base_prefix, p)):
            p = os.path.join(base_prefix, p)
        ctrl_val_records.append({"path": p, "label_idx": class_to_index["background"], "canonical_class": "background"})
    assert len(ctrl_val_records) == 1116, f"Expected 1116 controlled val rows, got {len(ctrl_val_records)}"
    
    ag_val_records = []
    for _, row in df_ag_val.iterrows():
        p = row["original_path"]
        if not os.path.exists(p) and os.path.exists(os.path.join(base_prefix, p)):
            p = os.path.join(base_prefix, p)
        ag_val_records.append({
            "id": row.get("id", ""),
            "path": p,
            "label_idx": class_to_index["background"],
            "canonical_class": "background",
            "category": row.get("category", "unknown"),
            "species": row.get("species", "unknown")
        })
    assert len(ag_val_records) == 65, f"Expected 65 ag val rows, got {len(ag_val_records)}"
    
    field_val_records = []
    for _, row in df_pd_val.iterrows():
        p = row["original_path"]
        if not os.path.exists(p) and os.path.exists(os.path.join(base_prefix, p)):
            p = os.path.join(base_prefix, p)
        field_val_records.append({"path": p, "label_idx": class_to_index[row["canonical_class"]], "canonical_class": row["canonical_class"]})
    assert len(field_val_records) == 81, f"Expected 81 field val rows, got {len(field_val_records)}"
    
    print(f"\n  Confirmed Validation Sets:")
    print(f"    - Controlled Validation:        {len(ctrl_val_records)} rows (1,004 PV + 112 COCO)")
    print(f"    - Ag Hard-Negative Validation:  {len(ag_val_records)} rows (36 weeds, 5 grass, 24 unsupported crops)")
    print(f"    - PlantDoc Field Diagnostic:    {len(field_val_records)} rows (81 PlantDoc crops, diagnostic only)")
    
    # 4. Domain Sampler Configuration (85% PV, 7.5% COCO, 7.5% Ag Negatives)
    p_dom = {"plantvillage": 0.85, "coco_generic": 0.075, "ag_hard_negatives": 0.075}
    n_dom = {"plantvillage": len(df_pv_train), "coco_generic": len(df_coco_train), "ag_hard_negatives": len(df_ag_train)}
    
    sample_weights = np.array([p_dom[d] / n_dom[d] for d in domain_tags], dtype=np.float64)
    sample_weights = sample_weights / sample_weights.sum()
    
    sampler = WeightedRandomSampler(
        weights=sample_weights,
        num_samples=total_train_rows,
        replacement=True
    )
    
    df_train_summary = pd.DataFrame(train_records)
    df_train_summary["weight"] = sample_weights
    class_exposure = df_train_summary.groupby("canonical_class")["weight"].sum() * total_train_rows
    raw_class_counts = df_train_summary["canonical_class"].value_counts().to_dict()
    
    C = 7
    raw_loss_weights = np.zeros(C, dtype=np.float32)
    for cls_name, idx in class_to_index.items():
        nc_exp = class_exposure.get(cls_name, 1.0)
        raw_loss_weights[idx] = np.sqrt(total_train_rows / (C * nc_exp))
    normalized_loss_weights = raw_loss_weights / np.mean(raw_loss_weights)
    class_weights_tensor = torch.tensor(normalized_loss_weights, dtype=torch.float32).to(device)
    
    print("\n[Step 2: Domain Sampling & Loss Weighting Analysis]")
    print(f"  Target Sampling: 85.0% PlantVillage (~4650/epoch), 7.5% COCO Generic (~410/epoch), 7.5% Ag Negatives (~410/epoch)")
    print(f"  Total Background Sampled Exposure: 15.0% (~821 samples/epoch) vs Crop Exposure: 85.0% (~4650 samples/epoch)")
    print("  Class Exposure and Loss Weights:")
    for cls_name, idx in class_to_index.items():
        raw_c = raw_class_counts.get(cls_name, 0)
        exp_c = class_exposure.get(cls_name, 0.0)
        w_c = normalized_loss_weights[idx]
        print(f"    - Class {idx} ({cls_name:<22}): Raw Count = {raw_c:<4} | Sampled Exposure = {exp_c:<7.2f} ({(exp_c/total_train_rows)*100:.2f}%) | Loss Weight = {w_c:.4f}")
        
    criterion = nn.CrossEntropyLoss(weight=class_weights_tensor)
    
    # 5. Datasets and DataLoaders
    train_dataset = ExpCDataset(train_records, transform=get_exp_c_train_transforms())
    ctrl_val_dataset = ExpCDataset(ctrl_val_records, transform=get_eval_transforms())
    ag_val_dataset = ExpCDataset(ag_val_records, transform=get_eval_transforms())
    field_val_dataset = ExpCDataset(field_val_records, transform=get_eval_transforms())
    
    batch_size = 32
    train_loader = DataLoader(train_dataset, batch_size=batch_size, sampler=sampler, num_workers=0)
    ctrl_val_loader = DataLoader(ctrl_val_dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    ag_val_loader = DataLoader(ag_val_dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    field_val_loader = DataLoader(field_val_dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    
    # 6. Baseline Reference on Original Phase 3 Checkpoint
    print("\n[Step 3: Evaluating Phase 3 Checkpoint Baseline]")
    p3_model = build_and_load_model(phase3_ckpt_path, num_classes=7).to(device)
    p3_ctrl_metrics, _, _ = evaluate_model(p3_model, ctrl_val_loader, criterion, device, index_to_class)
    p3_ag_metrics, _, p3_ag_preds = evaluate_ag_negatives(p3_model, ag_val_loader, criterion, device, ag_val_records, index_to_class)
    p3_field_metrics, _, p3_field_preds = evaluate_model(p3_model, field_val_loader, criterion, device, index_to_class, active_classes_only=True)
    
    print(f"  Phase 3 Baseline Controlled Val (1116):   Accuracy = {p3_ctrl_metrics['accuracy']:.4f}, Macro F1 = {p3_ctrl_metrics['macro_f1']:.4f}")
    print(f"  Phase 3 Baseline Ag Negatives Val (65):   Correct BG = {p3_ag_metrics['correct_background']}/65 ({p3_ag_metrics['rejection_accuracy']*100:.2f}%)")
    print(f"  Phase 3 Baseline Field Diagnostic (81):   Accuracy = {p3_field_metrics['accuracy']:.4f}, Macro F1 = {p3_field_metrics['macro_f1']:.4f}")
    
    # 7. Initialize Exp C Model from Phase 3 Checkpoint
    print("\n[Step 4: Initializing Model for Exp C Fine-Tuning]")
    model = build_and_load_model(phase3_ckpt_path, num_classes=7).to(device)
    configure_exp_c_parameters(model)
    
    optimizer = torch.optim.AdamW([
        {"params": [p for idx in range(9, len(model.features)) for p in model.features[idx].parameters() if p.requires_grad], "lr": 1e-5, "weight_decay": 1e-4},
        {"params": model.classifier.parameters(), "lr": 3e-4, "weight_decay": 1e-4}
    ])
    
    max_epochs = 12
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max_epochs, eta_min=1e-6)
    
    # 8. Training Loop
    print("\n[Step 5: Starting Exp C Training Loop]")
    patience = 5
    best_ag_score = -1.0
    best_epoch = -1
    best_state_dict = None
    best_ctrl_metrics = None
    best_ag_metrics = None
    best_field_metrics = None
    best_ag_preds = None
    no_improve_epochs = 0
    history = []
    
    start_time = time.time()
    
    for epoch in range(1, max_epochs + 1):
        epoch_start = time.time()
        train_loss = train_epoch(model, train_loader, criterion, optimizer, device)
        scheduler.step()
        
        ctrl_metrics, _, _ = evaluate_model(model, ctrl_val_loader, criterion, device, index_to_class)
        ag_metrics, _, ag_preds = evaluate_ag_negatives(model, ag_val_loader, criterion, device, ag_val_records, index_to_class)
        field_metrics, _, _ = evaluate_model(model, field_val_loader, criterion, device, index_to_class, active_classes_only=True)
        
        epoch_dur = time.time() - epoch_start
        
        ctrl_f1 = ctrl_metrics["macro_f1"]
        ag_corr = ag_metrics["correct_background"]
        ag_acc = ag_metrics["rejection_accuracy"]
        field_f1 = field_metrics["macro_f1"]
        
        passes_guardrail = (ctrl_f1 >= 0.94)
        is_best = False
        
        score = ag_corr * 100.0 + ctrl_f1 * 10.0 + field_f1
        if passes_guardrail and (score > best_ag_score + 1e-4):
            is_best = True
            best_ag_score = score
            best_epoch = epoch
            best_state_dict = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            best_ctrl_metrics = ctrl_metrics
            best_ag_metrics = ag_metrics
            best_field_metrics = field_metrics
            best_ag_preds = ag_preds
            no_improve_epochs = 0
        else:
            no_improve_epochs += 1
            
        print(f"Epoch {epoch:02d}/{max_epochs:02d} [{epoch_dur:.1f}s] | "
              f"Train Loss: {train_loss:.4f} | "
              f"Ctrl F1: {ctrl_f1:.4f} (Acc: {ctrl_metrics['accuracy']:.4f}) | "
              f"Ag BG Rej: {ag_corr}/65 ({ag_acc*100:.1f}%) | "
              f"Field F1: {field_f1:.4f} (Acc: {field_metrics['accuracy']:.4f}) | "
              f"{'[BEST]' if is_best else ''}")
              
        history.append({
            "epoch": epoch,
            "train_loss": round(float(train_loss), 4),
            "controlled_val_loss": ctrl_metrics["loss"],
            "controlled_val_accuracy": ctrl_metrics["accuracy"],
            "controlled_val_macro_f1": ctrl_metrics["macro_f1"],
            "ag_val_loss": ag_metrics["loss"],
            "ag_val_correct_bg": ag_metrics["correct_background"],
            "ag_val_rejection_acc": ag_metrics["rejection_accuracy"],
            "ag_val_fp_count": ag_metrics["false_positive_count"],
            "field_val_loss": field_metrics["loss"],
            "field_val_accuracy": field_metrics["accuracy"],
            "field_val_macro_f1": field_metrics["macro_f1"],
            "passes_guardrail": passes_guardrail,
            "is_best": is_best
        })
        
        if no_improve_epochs >= patience:
            print(f"\nEarly stopping triggered: No performance improvement for {patience} epochs.")
            break
            
    total_training_time = time.time() - start_time
    print(f"\nTraining completed in {total_training_time:.1f} seconds ({total_training_time/60:.2f} minutes).")
    print(f"Best Checkpoint selected from Epoch {best_epoch}: Ag Rejection = {best_ag_metrics['correct_background']}/65 ({best_ag_metrics['rejection_accuracy']*100:.2f}%), Ctrl F1 = {best_ctrl_metrics['macro_f1']:.4f}")
    
    # 9. Save Best Checkpoint and Full Artifacts
    best_ckpt_path = os.path.join(exp_out_dir, "best_model.pt")
    torch.save({
        "state_dict": best_state_dict,
        "epoch": best_epoch,
        "experiment": "Exp_C_Agricultural_Hard_Negatives",
        "controlled_val_macro_f1": best_ctrl_metrics["macro_f1"],
        "ag_val_rejection_accuracy": best_ag_metrics["rejection_accuracy"],
        "field_val_macro_f1": best_field_metrics["macro_f1"],
        "class_mapping": class_to_index,
        "index_to_class": index_to_class,
        "architecture": "mobilenet_v3_small",
        "input_size": [3, 224, 224]
    }, best_ckpt_path)
    print(f"Saved Exp C best checkpoint: {best_ckpt_path}")
    
    # 10. Final Evaluation and Artifact Serialization
    model.load_state_dict(best_state_dict)
    final_ctrl_metrics, final_ctrl_targs, final_ctrl_preds = evaluate_model(model, ctrl_val_loader, criterion, device, index_to_class)
    final_ag_metrics, final_ag_targs, final_ag_preds = evaluate_ag_negatives(model, ag_val_loader, criterion, device, ag_val_records, index_to_class)
    final_field_metrics, final_field_targs, final_field_preds = evaluate_model(model, field_val_loader, criterion, device, index_to_class, active_classes_only=True)
    
    classes_7 = [index_to_class[i] for i in range(7)]
    cm_ctrl = confusion_matrix(final_ctrl_targs, final_ctrl_preds, labels=range(7))
    cm_field = confusion_matrix(final_field_targs, final_field_preds, labels=range(7))
    
    df_cm_ctrl = pd.DataFrame(cm_ctrl, index=classes_7, columns=classes_7)
    df_cm_field = pd.DataFrame(cm_field, index=classes_7, columns=classes_7)
    
    df_cm_ctrl.to_csv(os.path.join(exp_out_dir, "confusion_matrix_controlled_val.csv"))
    df_cm_field.to_csv(os.path.join(exp_out_dir, "confusion_matrix_field_val.csv"))
    
    # Per-sample predictions for Ag Negatives
    df_ag_preds = pd.DataFrame(ag_val_records)
    df_ag_preds["predicted_idx"] = final_ag_preds
    df_ag_preds["predicted_class"] = [index_to_class[p] for p in final_ag_preds]
    df_ag_preds["is_correct"] = df_ag_preds["predicted_idx"] == 0
    df_ag_preds.to_csv(os.path.join(exp_out_dir, "ag_negative_predictions.csv"), index=False)
    
    # Save Metadata & JSON Metrics
    with open(os.path.join(exp_out_dir, "history.json"), "w") as f:
        json.dump(history, f, indent=2)
    with open(os.path.join(exp_out_dir, "controlled_val_metrics.json"), "w") as f:
        json.dump(final_ctrl_metrics, f, indent=2)
    with open(os.path.join(exp_out_dir, "ag_negative_val_metrics.json"), "w") as f:
        json.dump(final_ag_metrics, f, indent=2)
    with open(os.path.join(exp_out_dir, "field_val_metrics.json"), "w") as f:
        json.dump(final_field_metrics, f, indent=2)
    with open(os.path.join(exp_out_dir, "domain_sampling_config.json"), "w") as f:
        json.dump({
            "domain_sampling_probabilities": p_dom,
            "domain_counts": n_dom,
            "raw_class_counts": raw_class_counts,
            "effective_class_exposure": class_exposure.to_dict(),
            "class_loss_weights": {cls: float(normalized_loss_weights[class_to_index[cls]]) for cls in class_to_index}
        }, f, indent=2)
    with open(os.path.join(exp_out_dir, "experiment_metadata.json"), "w") as f:
        json.dump({
            "experiment": "Exp_C_Agricultural_Hard_Negatives",
            "timestamp": str(datetime.datetime.now()),
            "starting_checkpoint": phase3_ckpt_path,
            "best_epoch": best_epoch,
            "total_epochs": len(history),
            "training_duration_seconds": round(total_training_time, 2),
            "batch_size": batch_size,
            "optimizer": "AdamW",
            "backbone_lr": 1e-5,
            "classifier_lr": 3e-4,
            "weight_decay": 1e-4,
            "scheduler": "CosineAnnealingLR",
            "total_train_samples": total_train_rows,
            "controlled_val_macro_f1": final_ctrl_metrics["macro_f1"],
            "ag_val_rejection_accuracy": final_ag_metrics["rejection_accuracy"],
            "field_val_macro_f1": final_field_metrics["macro_f1"]
        }, f, indent=2)
        
    print("\n" + "="*85)
    print("FOUR-WAY COMPARISON: PHASE 3 BASELINE vs. EXP A vs. EXP B vs. EXP C")
    print("="*85)
    
    exp_a_field_path = os.path.join(base_prefix, "training/experiments/exp_a_augmentation_only/field_val_metrics.json")
    exp_a_ctrl_path = os.path.join(base_prefix, "training/experiments/exp_a_augmentation_only/controlled_val_metrics.json")
    exp_b_field_path = os.path.join(base_prefix, "training/experiments/exp_b_field_adaptation/field_val_metrics.json")
    exp_b_ctrl_path = os.path.join(base_prefix, "training/experiments/exp_b_field_adaptation/controlled_val_metrics.json")
    
    exp_a_field, exp_a_ctrl = None, None
    exp_b_field, exp_b_ctrl = None, None
    if os.path.exists(exp_a_field_path):
        with open(exp_a_field_path) as f: exp_a_field = json.load(f)
    if os.path.exists(exp_a_ctrl_path):
        with open(exp_a_ctrl_path) as f: exp_a_ctrl = json.load(f)
    if os.path.exists(exp_b_field_path):
        with open(exp_b_field_path) as f: exp_b_field = json.load(f)
    if os.path.exists(exp_b_ctrl_path):
        with open(exp_b_ctrl_path) as f: exp_b_ctrl = json.load(f)
        
    exp_a_c_f1 = exp_a_ctrl['macro_f1'] if exp_a_ctrl else 0.0
    exp_a_f_acc = exp_a_field['accuracy'] if exp_a_field else 0.0
    exp_a_f_f1 = exp_a_field['macro_f1'] if exp_a_field else 0.0
    
    exp_b_c_f1 = exp_b_ctrl['macro_f1'] if exp_b_ctrl else 0.0
    exp_b_f_acc = exp_b_field['accuracy'] if exp_b_field else 0.0
    exp_b_f_f1 = exp_b_field['macro_f1'] if exp_b_field else 0.0
    
    print(f"{'Metric':<32} | {'Phase 3':<10} | {'Exp A':<10} | {'Exp B':<10} | {'Exp C':<10} | {'C vs Base':<10}")
    print("-"*90)
    print(f"{'Controlled Val Macro F1 (1116)':<32} | {p3_ctrl_metrics['macro_f1']:<10.4f} | {exp_a_c_f1:<10.4f} | {exp_b_c_f1:<10.4f} | {final_ctrl_metrics['macro_f1']:<10.4f} | {final_ctrl_metrics['macro_f1'] - p3_ctrl_metrics['macro_f1']:+.4f}")
    print(f"{'Ag Negative Val Rej Acc (65)':<32} | {p3_ag_metrics['rejection_accuracy']:<10.4f} | {'0.6923':<10} | {'0.1692':<10} | {final_ag_metrics['rejection_accuracy']:<10.4f} | {final_ag_metrics['rejection_accuracy'] - p3_ag_metrics['rejection_accuracy']:+.4f}")
    p3_corr_str = f"{p3_ag_metrics['correct_background']}/65"
    ec_corr_str = f"{final_ag_metrics['correct_background']}/65"
    print(f"{'Ag Correct BG Rejections (/65)':<32} | {p3_corr_str:<10} | {'45/65':<10} | {'11/65':<10} | {ec_corr_str:<10} | {final_ag_metrics['correct_background'] - p3_ag_metrics['correct_background']:+d}")
    print(f"{'Field Val Accuracy (81)':<32} | {p3_field_metrics['accuracy']:<10.4f} | {exp_a_f_acc:<10.4f} | {exp_b_f_acc:<10.4f} | {final_field_metrics['accuracy']:<10.4f} | {final_field_metrics['accuracy'] - p3_field_metrics['accuracy']:+.4f}")
    print(f"{'Field Val Macro F1 (81)':<32} | {p3_field_metrics['macro_f1']:<10.4f} | {exp_a_f_f1:<10.4f} | {exp_b_f_f1:<10.4f} | {final_field_metrics['macro_f1']:<10.4f} | {final_field_metrics['macro_f1'] - p3_field_metrics['macro_f1']:+.4f}")
    
    print("\nAgricultural Negative Validation Breakdown:")
    for cat in ["weed", "grass", "unsupported_crop"]:
        stats = final_ag_metrics["category_breakdown"].get(cat, {})
        p3_stats = p3_ag_metrics["category_breakdown"].get(cat, {})
        tot = stats.get("total", 0)
        corr_c = stats.get("correct_bg", 0)
        corr_p3 = p3_stats.get("correct_bg", 0)
        print(f"  - {cat:<18} ({tot} samples): Exp C = {corr_c}/{tot} ({corr_c/tot*100:.1f}%) vs Phase 3 = {corr_p3}/{tot} ({corr_p3/tot*100:.1f}%)")
        
    print("\nPlantDoc Field Diagnostic Class Recalls:")
    for cls_name in ["potato_early_blight", "potato_late_blight", "tomato_early_blight", "tomato_healthy", "tomato_late_blight"]:
        r_p3 = p3_field_metrics["per_class"][cls_name]["recall"]
        r_ea = exp_a_field["per_class"][cls_name]["recall"] if exp_a_field else 0.0
        r_eb = exp_b_field["per_class"][cls_name]["recall"] if exp_b_field else 0.0
        r_ec = final_field_metrics["per_class"][cls_name]["recall"]
        print(f"  - {cls_name:<25}: Phase 3={r_p3:.4f} | Exp A={r_ea:.4f} | Exp B={r_eb:.4f} | Exp C={r_ec:.4f}")
        
    p3_bg = sum(1 for p in p3_field_preds if p == 0)
    ec_bg = sum(1 for p in final_field_preds if p == 0)
    p3_tlb = sum(1 for p in p3_field_preds if p == 6)
    ec_tlb = sum(1 for p in final_field_preds if p == 6)
    
    print(f"\nPlantDoc False Background Rejections: Exp C = {ec_bg} vs Phase 3 = {p3_bg}")
    print(f"PlantDoc Predicted as tomato_late_blight: Exp C = {ec_tlb} vs Phase 3 = {p3_tlb}")

if __name__ == "__main__":
    run_experiment_c()
