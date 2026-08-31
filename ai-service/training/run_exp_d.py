import os
import sys
import json
import time
import datetime
import random
import io
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

class JPEGCompression(object):
    def __init__(self, p=0.20, quality_lower=60, quality_upper=90):
        self.p = p
        self.quality_lower = quality_lower
        self.quality_upper = quality_upper

    def __call__(self, img):
        if random.random() < self.p:
            quality = random.randint(self.quality_lower, self.quality_upper)
            buffer = io.BytesIO()
            img.save(buffer, "JPEG", quality=quality)
            buffer.seek(0)
            img = Image.open(buffer).convert("RGB")
        return img

def load_class_mapping(mapping_path="training/class_mapping.json"):
    if not os.path.exists(mapping_path):
        if os.path.exists(os.path.join("ai-service", mapping_path)):
            mapping_path = os.path.join("ai-service", mapping_path)
    with open(mapping_path, "r") as f:
        data = json.load(f)
    return data["class_to_index"], {int(k): v for k, v in data["index_to_class"].items()}

def get_exp_d_train_transforms():
    return transforms.Compose([
        transforms.RandomResizedCrop(224, scale=(0.65, 1.0), ratio=(0.85, 1.15)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomAffine(degrees=15, translate=(0.05, 0.05), scale=(0.95, 1.05)),
        transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15, hue=0.02),
        transforms.RandomApply([transforms.GaussianBlur(3)], p=0.15),
        JPEGCompression(p=0.20, quality_lower=60, quality_upper=90),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

def get_eval_transforms():
    return transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

class ExpDDataset(Dataset):
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
    model = mobilenet_v3_small(weights=None)
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Linear(in_features, num_classes)
    
    ckpt = torch.load(checkpoint_path, map_location="cpu")
    state_dict = ckpt["state_dict"] if "state_dict" in ckpt else (ckpt["model_state_dict"] if "model_state_dict" in ckpt else ckpt)
    model.load_state_dict(state_dict)
    return model

def configure_exp_d_parameters(model):
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
    metrics = compute_classification_metrics(all_targets, all_preds, index_to_class=index_to_class, active_classes_only=active_classes_only)
    metrics["loss"] = round(float(epoch_loss), 4)
    return metrics, all_targets, all_preds

@torch.no_grad()
def evaluate_ag_negatives(model, dataloader, criterion, device, ag_records, index_to_class):
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
    pred_class_counts = {}
    for idx in range(len(index_to_class)):
        cls_name = index_to_class[idx]
        pred_class_counts[cls_name] = int(sum(1 for p in all_preds if p == idx))
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
    return running_loss / len(dataloader.dataset)

def run_experiment_d():
    base_prefix = "ai-service/" if os.path.exists("ai-service/data/manifests") else ""
    set_seed(42)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("="*80)
    print("PHASE 4B.4D: EXPERIMENT D (FULL MULTI-DOMAIN FIELD ADAPTATION)")
    print(f"Device: {device} | Start Time: {datetime.datetime.now()}")
    print("="*80)
    
    pv_manifest = os.path.join(base_prefix, "data/manifests/dataset_manifest.csv")
    pd_train_manifest = os.path.join(base_prefix, "data/manifests/plantdoc_adapt_train_manifest.csv")
    coco_manifest = os.path.join(base_prefix, "data/manifests/background_manifest.csv")
    ag_train_manifest = os.path.join(base_prefix, "data/manifests/ag_background_train_manifest.csv")
    
    ag_val_manifest = os.path.join(base_prefix, "data/manifests/ag_background_val_manifest.csv")
    pd_val_manifest = os.path.join(base_prefix, "data/manifests/plantdoc_adapt_val_manifest.csv")
    class_mapping_path = os.path.join(base_prefix, "training/class_mapping.json")
    phase3_ckpt_path = os.path.join(base_prefix, "training/checkpoints/best_model.pt")
    
    exp_out_dir = os.path.join(base_prefix, "training/experiments/exp_d_full_multidomain")
    os.makedirs(exp_out_dir, exist_ok=True)
    
    class_to_index, index_to_class = load_class_mapping(class_mapping_path)
    
    print("\n[Step 1: Pre-Training Manifest Validation & Assembly]")
    df_pv = pd.read_csv(pv_manifest)
    df_pv_train = df_pv[df_pv["split"] == "train"].copy()
    df_pv_val = df_pv[df_pv["split"] == "val"].copy()
    
    df_pd_train = pd.read_csv(pd_train_manifest).copy()
    df_pd_val = pd.read_csv(pd_val_manifest).copy()
    
    df_coco = pd.read_csv(coco_manifest)
    df_coco_train = df_coco[df_coco["split"] == "train"].copy()
    df_coco_val = df_coco[df_coco["split"] == "val"].copy()
    
    df_ag_train = pd.read_csv(ag_train_manifest).copy()
    df_ag_val = pd.read_csv(ag_val_manifest).copy()
    
    assert len(df_pv_train) == 4645, f"Expected 4645 PV train rows, got {len(df_pv_train)}"
    assert len(df_pd_train) == 324, f"Expected 324 PD train rows, got {len(df_pd_train)}"
    assert len(df_coco_train) == 525, f"Expected 525 COCO train rows, got {len(df_coco_train)}"
    assert len(df_ag_train) == 301, f"Expected 301 Ag-negative train rows, got {len(df_ag_train)}"
    
    assert len(df_pv_val) == 1004, f"Expected 1004 PV val rows, got {len(df_pv_val)}"
    assert len(df_pd_val) == 81, f"Expected 81 PD val rows, got {len(df_pd_val)}"
    assert len(df_coco_val) == 112, f"Expected 112 COCO val rows, got {len(df_coco_val)}"
    assert len(df_ag_val) == 65, f"Expected 65 Ag val rows, got {len(df_ag_val)}"
    
    train_records = []
    domain_tags = []
    
    def resolve_path(p):
        return p if os.path.exists(p) else os.path.join(base_prefix, p)
        
    for _, row in df_pv_train.iterrows():
        train_records.append({"path": resolve_path(row["original_path"]), "label_idx": class_to_index[row["canonical_class"]], "canonical_class": row["canonical_class"], "domain": "plantvillage"})
        domain_tags.append("plantvillage")
    for _, row in df_pd_train.iterrows():
        train_records.append({"path": resolve_path(row["original_path"]), "label_idx": class_to_index[row["canonical_class"]], "canonical_class": row["canonical_class"], "domain": "plantdoc_field"})
        domain_tags.append("plantdoc_field")
    for _, row in df_coco_train.iterrows():
        train_records.append({"path": resolve_path(row["original_path"]), "label_idx": class_to_index["background"], "canonical_class": "background", "domain": "coco_generic"})
        domain_tags.append("coco_generic")
    for _, row in df_ag_train.iterrows():
        train_records.append({"path": resolve_path(row["original_path"]), "label_idx": class_to_index["background"], "canonical_class": "background", "domain": "ag_hard_negatives"})
        domain_tags.append("ag_hard_negatives")
        
    total_train_rows = len(train_records)
    assert total_train_rows == 5795, f"Expected 5795 unique training rows, got {total_train_rows}"
    
    print(f"  Confirmed Training Dataset Rows (Total: {total_train_rows}):")
    print(f"    - PlantVillage Controlled:     {len(df_pv_train)}")
    print(f"    - PlantDoc Field Crop:         {len(df_pd_train)}")
    print(f"    - COCO Generic Background:     {len(df_coco_train)}")
    print(f"    - Agricultural Hard Negatives: {len(df_ag_train)}")
    
    ctrl_val_records = []
    for _, row in df_pv_val.iterrows(): ctrl_val_records.append({"path": resolve_path(row["original_path"]), "label_idx": class_to_index[row["canonical_class"]], "canonical_class": row["canonical_class"]})
    for _, row in df_coco_val.iterrows(): ctrl_val_records.append({"path": resolve_path(row["original_path"]), "label_idx": class_to_index["background"], "canonical_class": "background"})
    
    ag_val_records = []
    for _, row in df_ag_val.iterrows():
        ag_val_records.append({"path": resolve_path(row["original_path"]), "label_idx": class_to_index["background"], "canonical_class": "background", "category": row.get("category", "unknown"), "species": row.get("species", "unknown")})
        
    field_val_records = []
    for _, row in df_pd_val.iterrows():
        field_val_records.append({"path": resolve_path(row["original_path"]), "label_idx": class_to_index[row["canonical_class"]], "canonical_class": row["canonical_class"]})
        
    print(f"\n  Confirmed Validation Sets:")
    print(f"    - Controlled Validation:        {len(ctrl_val_records)} rows (1,004 PV + 112 COCO)")
    print(f"    - Field Crop Validation:        {len(field_val_records)} rows (81 PlantDoc)")
    print(f"    - Ag Hard-Negative Validation:  {len(ag_val_records)} rows (65 Ag Background)")
    
    # Domain Sampling (70% PV, 15% PD, 7.5% COCO, 7.5% Ag Negatives)
    p_dom = {"plantvillage": 0.70, "plantdoc_field": 0.15, "coco_generic": 0.075, "ag_hard_negatives": 0.075}
    n_dom = {"plantvillage": len(df_pv_train), "plantdoc_field": len(df_pd_train), "coco_generic": len(df_coco_train), "ag_hard_negatives": len(df_ag_train)}
    
    sample_weights = np.array([p_dom[d] / n_dom[d] for d in domain_tags], dtype=np.float64)
    sample_weights = sample_weights / sample_weights.sum()
    
    sampler = WeightedRandomSampler(weights=sample_weights, num_samples=total_train_rows, replacement=True)
    
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
    print("  Target Sampling Rates: PV (70%), PD (15%), COCO (7.5%), AgNeg (7.5%)")
    print(f"  Total Expected Repetitions per Epoch:")
    for d, target_p in p_dom.items():
        exp_samples = total_train_rows * target_p
        print(f"    - {d:<20}: {exp_samples:.1f} samples (Repetition factor: {exp_samples/n_dom[d]:.2f}x)")
    
    print("\n  Class Exposure and Loss Weights:")
    for cls_name, idx in class_to_index.items():
        raw_c = raw_class_counts.get(cls_name, 0)
        exp_c = class_exposure.get(cls_name, 0.0)
        w_c = normalized_loss_weights[idx]
        print(f"    - Class {idx} ({cls_name:<22}): Raw = {raw_c:<4} | Exp Exposure = {exp_c:<7.2f} ({(exp_c/total_train_rows)*100:.2f}%) | Weight = {w_c:.4f}")
        
    criterion = nn.CrossEntropyLoss(weight=class_weights_tensor)
    
    train_dataset = ExpDDataset(train_records, transform=get_exp_d_train_transforms())
    ctrl_val_dataset = ExpDDataset(ctrl_val_records, transform=get_eval_transforms())
    ag_val_dataset = ExpDDataset(ag_val_records, transform=get_eval_transforms())
    field_val_dataset = ExpDDataset(field_val_records, transform=get_eval_transforms())
    
    batch_size = 32
    train_loader = DataLoader(train_dataset, batch_size=batch_size, sampler=sampler, num_workers=0)
    ctrl_val_loader = DataLoader(ctrl_val_dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    ag_val_loader = DataLoader(ag_val_dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    field_val_loader = DataLoader(field_val_dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    
    print("\n[Step 3: Initializing Model for Exp D]")
    model = build_and_load_model(phase3_ckpt_path, num_classes=7).to(device)
    configure_exp_d_parameters(model)
    
    optimizer = torch.optim.AdamW([
        {"params": [p for idx in range(9, len(model.features)) for p in model.features[idx].parameters() if p.requires_grad], "lr": 1e-5, "weight_decay": 1e-4},
        {"params": model.classifier.parameters(), "lr": 3e-4, "weight_decay": 1e-4}
    ])
    max_epochs = 12
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max_epochs, eta_min=1e-6)
    
    print("\n[Step 4: Starting Exp D Training Loop]")
    patience = 5
    best_field_f1 = -1.0
    best_epoch = -1
    best_state_dict = None
    best_ctrl_metrics = None
    best_ag_metrics = None
    best_field_metrics = None
    no_improve_epochs = 0
    history = []
    
    start_time = time.time()
    for epoch in range(1, max_epochs + 1):
        epoch_start = time.time()
        train_loss = train_epoch(model, train_loader, criterion, optimizer, device)
        scheduler.step()
        
        ctrl_metrics, _, _ = evaluate_model(model, ctrl_val_loader, criterion, device, index_to_class, active_classes_only=False)
        ag_metrics, _, _ = evaluate_ag_negatives(model, ag_val_loader, criterion, device, ag_val_records, index_to_class)
        field_metrics, _, _ = evaluate_model(model, field_val_loader, criterion, device, index_to_class, active_classes_only=False)
        
        epoch_dur = time.time() - epoch_start
        ctrl_f1 = ctrl_metrics["macro_f1"]
        field_f1 = field_metrics["macro_f1"]
        ag_corr = ag_metrics["correct_background"]
        
        passes_guardrail = (ctrl_f1 >= 0.94)
        is_best = False
        
        is_safe_ag = (ag_corr >= 40)
        
        if passes_guardrail and is_safe_ag and (field_f1 > best_field_f1 + 1e-4):
            is_best = True
            best_field_f1 = field_f1
            best_epoch = epoch
            best_state_dict = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            best_ctrl_metrics = ctrl_metrics
            best_ag_metrics = ag_metrics
            best_field_metrics = field_metrics
            no_improve_epochs = 0
        elif passes_guardrail and is_safe_ag and abs(field_f1 - best_field_f1) <= 1e-4:
            if best_ag_metrics is not None and ag_corr > best_ag_metrics["correct_background"]:
                is_best = True
                best_field_f1 = field_f1
                best_epoch = epoch
                best_state_dict = {k: v.cpu().clone() for k, v in model.state_dict().items()}
                best_ctrl_metrics = ctrl_metrics
                best_ag_metrics = ag_metrics
                best_field_metrics = field_metrics
                no_improve_epochs = 0
            else:
                no_improve_epochs += 1
        else:
            no_improve_epochs += 1
            
        print(f"Epoch {epoch:02d}/{max_epochs:02d} [{epoch_dur:.1f}s] | "
              f"Train Loss: {train_loss:.4f} | "
              f"Ctrl F1: {ctrl_f1:.4f} (Acc: {ctrl_metrics['accuracy']:.4f}) | "
              f"Field F1: {field_f1:.4f} (Acc: {field_metrics['accuracy']:.4f}) | "
              f"Ag BG Rej: {ag_corr}/65 ({ag_metrics['rejection_accuracy']*100:.1f}%) | "
              f"{'[BEST]' if is_best else ''}")
              
        history.append({
            "epoch": epoch,
            "train_loss": round(float(train_loss), 4),
            "controlled_val_loss": ctrl_metrics["loss"],
            "controlled_val_accuracy": ctrl_metrics["accuracy"],
            "controlled_val_macro_f1": ctrl_metrics["macro_f1"],
            "field_val_loss": field_metrics["loss"],
            "field_val_accuracy": field_metrics["accuracy"],
            "field_val_macro_f1": field_metrics["macro_f1"],
            "ag_val_correct_bg": ag_corr,
            "ag_val_rejection_acc": ag_metrics["rejection_accuracy"],
            "passes_guardrail": passes_guardrail,
            "is_best": is_best
        })
        if no_improve_epochs >= patience:
            print(f"\nEarly stopping triggered.")
            break
            
    print("\n[Step 5: Evaluating & Saving Best Model]")
    best_ckpt_path = os.path.join(exp_out_dir, "best_model.pt")
    torch.save({"state_dict": best_state_dict, "epoch": best_epoch, "class_mapping": class_to_index}, best_ckpt_path)
    
    model.load_state_dict(best_state_dict)
    final_ctrl, c_t, c_p = evaluate_model(model, ctrl_val_loader, criterion, device, index_to_class, active_classes_only=False)
    final_field, f_t, f_p = evaluate_model(model, field_val_loader, criterion, device, index_to_class, active_classes_only=False)
    final_ag, a_t, a_p = evaluate_ag_negatives(model, ag_val_loader, criterion, device, ag_val_records, index_to_class)
    
    classes_7 = [index_to_class[i] for i in range(7)]
    df_cm_ctrl = pd.DataFrame(confusion_matrix(c_t, c_p, labels=range(7)), index=classes_7, columns=classes_7)
    df_cm_field = pd.DataFrame(confusion_matrix(f_t, f_p, labels=range(7)), index=classes_7, columns=classes_7)
    df_cm_ctrl.to_csv(os.path.join(exp_out_dir, "confusion_matrix_controlled_val.csv"))
    df_cm_field.to_csv(os.path.join(exp_out_dir, "confusion_matrix_field_val.csv"))
    
    df_ag_preds = pd.DataFrame(ag_val_records)
    df_ag_preds["predicted_idx"] = a_p
    df_ag_preds["predicted_class"] = [index_to_class[p] for p in a_p]
    df_ag_preds["is_correct"] = df_ag_preds["predicted_idx"] == 0
    df_ag_preds.to_csv(os.path.join(exp_out_dir, "ag_negative_predictions.csv"), index=False)
    
    with open(os.path.join(exp_out_dir, "history.json"), "w") as f: json.dump(history, f, indent=2)
    with open(os.path.join(exp_out_dir, "controlled_val_metrics.json"), "w") as f: json.dump(final_ctrl, f, indent=2)
    with open(os.path.join(exp_out_dir, "field_val_metrics.json"), "w") as f: json.dump(final_field, f, indent=2)
    with open(os.path.join(exp_out_dir, "ag_negative_val_metrics.json"), "w") as f: json.dump(final_ag, f, indent=2)
    with open(os.path.join(exp_out_dir, "domain_sampling_config.json"), "w") as f:
        json.dump({"p_dom": p_dom, "n_dom": n_dom, "raw_class_counts": raw_class_counts, "effective_class_exposure": class_exposure.to_dict(), "class_loss_weights": {cls: float(normalized_loss_weights[class_to_index[cls]]) for cls in class_to_index}}, f, indent=2)
    with open(os.path.join(exp_out_dir, "experiment_metadata.json"), "w") as f:
        json.dump({"experiment": "Exp_D_Full_MultiDomain", "best_epoch": best_epoch, "batch_size": batch_size, "optimizer": "AdamW", "scheduler": "CosineAnnealingLR", "total_train_samples": total_train_rows, "final_ctrl_f1": final_ctrl["macro_f1"], "final_field_f1": final_field["macro_f1"], "final_ag_rejection": final_ag["rejection_accuracy"]}, f, indent=2)
    
    print("\nExperiment D Complete!")

if __name__ == "__main__":
    run_experiment_d()
