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

def get_exp_b_train_transforms():
    """
    Exp B ablation training transform:
    Uses standard Phase 3 style augmentation with morphology safety constraint (hue <= 0.02).
    NO JPEG compression, NO Gaussian blur, NO aggressive 0.65 crop scale.
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

class ExpBDataset(Dataset):
    """Multi-domain dataset for Experiment B."""
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

def configure_exp_b_parameters(model):
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
def evaluate_model(model, dataloader, criterion, device, index_to_class):
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
    metrics = compute_classification_metrics(all_targets, all_preds, index_to_class=index_to_class)
    metrics["loss"] = round(float(epoch_loss), 4)
    return metrics, all_targets, all_preds

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

def run_experiment_b():
    base_prefix = ""
    if not os.path.exists("data/manifests") and os.path.exists("ai-service/data/manifests"):
        base_prefix = "ai-service/"
        
    set_seed(42)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("="*75)
    print("PHASE 4B.4B: EXPERIMENT B (PLANTDOC FIELD-DATA ADAPTATION ABLATION)")
    print(f"Device: {device} | Start Time: {datetime.datetime.now()}")
    print("="*75)
    
    # 1. Paths
    pv_manifest = os.path.join(base_prefix, "data/manifests/dataset_manifest.csv")
    pd_train_manifest = os.path.join(base_prefix, "data/manifests/plantdoc_adapt_train_manifest.csv")
    pd_val_manifest = os.path.join(base_prefix, "data/manifests/plantdoc_adapt_val_manifest.csv")
    coco_manifest = os.path.join(base_prefix, "data/manifests/background_manifest.csv")
    class_mapping_path = os.path.join(base_prefix, "training/class_mapping.json")
    phase3_ckpt_path = os.path.join(base_prefix, "training/checkpoints/best_model.pt")
    
    exp_out_dir = os.path.join(base_prefix, "training/experiments/exp_b_field_adaptation")
    os.makedirs(exp_out_dir, exist_ok=True)
    
    class_to_index, index_to_class = load_class_mapping(class_mapping_path)
    
    # 2. Load and Assemble Training Data
    print("\n[Step 1: Assembling Multi-Domain Training Data]")
    df_pv = pd.read_csv(pv_manifest)
    df_pv_train = df_pv[df_pv["split"] == "train"].copy()
    
    df_pd_train = pd.read_csv(pd_train_manifest).copy()
    
    df_coco = pd.read_csv(coco_manifest)
    df_coco_train = df_coco[df_coco["split"] == "train"].copy()
    
    # Verification
    assert len(df_pv_train) == 4645, f"Expected 4645 PV train rows, got {len(df_pv_train)}"
    assert len(df_pd_train) == 324, f"Expected 324 PD train rows, got {len(df_pd_train)}"
    assert len(df_coco_train) == 525, f"Expected 525 COCO train rows, got {len(df_coco_train)}"
    
    train_records = []
    domain_tags = []
    
    # Add PV train
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
        
    # Add PD train
    for _, row in df_pd_train.iterrows():
        p = row["original_path"]
        if not os.path.exists(p) and os.path.exists(os.path.join(base_prefix, p)):
            p = os.path.join(base_prefix, p)
        train_records.append({
            "path": p,
            "label_idx": class_to_index[row["canonical_class"]],
            "canonical_class": row["canonical_class"],
            "domain": "plantdoc_field"
        })
        domain_tags.append("plantdoc_field")
        
    # Add COCO train
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
        
    total_train_rows = len(train_records)
    assert total_train_rows == 5494, f"Expected 5494 total train rows, got {total_train_rows}"
    print(f"  Total Unique Training Rows: {total_train_rows}")
    print(f"    - PlantVillage Controlled: {len(df_pv_train)} (84.5%)")
    print(f"    - PlantDoc Field Adapt:     {len(df_pd_train)}  (5.9%)")
    print(f"    - COCO Generic Negatives:   {len(df_coco_train)}  (9.6%)")
    
    # 3. Assemble Validation Datasets
    # Controlled Val: 1004 PV val + 112 COCO val = 1116
    df_pv_val = df_pv[df_pv["split"] == "val"].copy()
    df_coco_val = df_coco[df_coco["split"] == "val"].copy()
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
    
    # Field Val: 81 PD val
    df_pd_val = pd.read_csv(pd_val_manifest)
    assert len(df_pd_val) == 81, f"Expected 81 field val rows, got {len(df_pd_val)}"
    field_val_records = []
    for _, row in df_pd_val.iterrows():
        p = row["original_path"]
        if not os.path.exists(p) and os.path.exists(os.path.join(base_prefix, p)):
            p = os.path.join(base_prefix, p)
        field_val_records.append({"path": p, "label_idx": class_to_index[row["canonical_class"]], "canonical_class": row["canonical_class"]})
        
    print(f"  Controlled Validation Rows: {len(ctrl_val_records)} (1,004 PV + 112 COCO)")
    print(f"  Field Adaptation Val Rows:  {len(field_val_records)} (81 PlantDoc)")
    
    # 4. Multi-Domain Batch Sampler Configuration (70% PV, 15% PD, 15% COCO)
    p_dom = {"plantvillage": 0.70, "plantdoc_field": 0.15, "coco_generic": 0.15}
    n_dom = {"plantvillage": len(df_pv_train), "plantdoc_field": len(df_pd_train), "coco_generic": len(df_coco_train)}
    
    sample_weights = np.array([p_dom[d] / n_dom[d] for d in domain_tags], dtype=np.float64)
    sample_weights = sample_weights / sample_weights.sum()
    
    sampler = WeightedRandomSampler(
        weights=sample_weights,
        num_samples=total_train_rows,
        replacement=True
    )
    
    # Calculate expected class exposures and square-root inverse-frequency weights
    df_train_summary = pd.DataFrame(train_records)
    df_train_summary["weight"] = sample_weights
    class_exposure = df_train_summary.groupby("canonical_class")["weight"].sum() * total_train_rows
    
    C = 7
    raw_weights = np.zeros(C, dtype=np.float32)
    for cls_name, idx in class_to_index.items():
        nc_exp = class_exposure.get(cls_name, 1.0)
        raw_weights[idx] = np.sqrt(total_train_rows / (C * nc_exp))
    normalized_weights = raw_weights / np.mean(raw_weights)
    class_weights_tensor = torch.tensor(normalized_weights, dtype=torch.float32).to(device)
    
    print("\n[Step 2: Domain Sampling & Effective Class Weights]")
    print(f"  Sampling Allocation: 70% PlantVillage (~3846/epoch), 15% PlantDoc (~824/epoch), 15% COCO (~824/epoch)")
    print("  Effective Class Weights (Square-Root Inverse Frequency over Sampled Exposure):")
    for cls_name, idx in class_to_index.items():
        print(f"    - {cls_name:<22} (idx {idx}): weight = {normalized_weights[idx]:.4f} (exp samples: {class_exposure[cls_name]:.1f})")
        
    criterion = nn.CrossEntropyLoss(weight=class_weights_tensor)
    
    # 5. Datasets and Loaders
    train_dataset = ExpBDataset(train_records, transform=get_exp_b_train_transforms())
    ctrl_val_dataset = ExpBDataset(ctrl_val_records, transform=get_eval_transforms())
    field_val_dataset = ExpBDataset(field_val_records, transform=get_eval_transforms())
    
    batch_size = 32
    train_loader = DataLoader(train_dataset, batch_size=batch_size, sampler=sampler, num_workers=0)
    ctrl_val_loader = DataLoader(ctrl_val_dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    field_val_loader = DataLoader(field_val_dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    
    # 6. Baseline Reference on Phase 3 Checkpoint
    print("\n[Step 3: Evaluating Phase 3 Checkpoint Baseline]")
    p3_model = build_and_load_model(phase3_ckpt_path, num_classes=7).to(device)
    p3_ctrl_metrics, _, _ = evaluate_model(p3_model, ctrl_val_loader, criterion, device, index_to_class)
    p3_field_metrics, _, p3_field_preds = evaluate_model(p3_model, field_val_loader, criterion, device, index_to_class)
    
    print(f"  Phase 3 Baseline Controlled Val: Accuracy = {p3_ctrl_metrics['accuracy']:.4f}, Macro F1 = {p3_ctrl_metrics['macro_f1']:.4f}")
    print(f"  Phase 3 Baseline Field Val:      Accuracy = {p3_field_metrics['accuracy']:.4f}, Macro F1 = {p3_field_metrics['macro_f1']:.4f}")
    
    # 7. Initialize Exp B Model
    print("\n[Step 4: Initializing Model for Exp B Fine-Tuning]")
    model = build_and_load_model(phase3_ckpt_path, num_classes=7).to(device)
    configure_exp_b_parameters(model)
    
    optimizer = torch.optim.AdamW([
        {"params": [p for idx in range(9, len(model.features)) for p in model.features[idx].parameters() if p.requires_grad], "lr": 1e-5, "weight_decay": 1e-4},
        {"params": model.classifier.parameters(), "lr": 3e-4, "weight_decay": 1e-4}
    ])
    
    max_epochs = 12
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max_epochs, eta_min=1e-6)
    
    # 8. Training Loop
    print("\n[Step 5: Starting Exp B Training Loop]")
    patience = 5
    best_field_f1 = -1.0
    best_epoch = -1
    best_state_dict = None
    best_ctrl_metrics = None
    best_field_metrics = None
    no_improve_epochs = 0
    history = []
    
    start_time = time.time()
    
    for epoch in range(1, max_epochs + 1):
        epoch_start = time.time()
        train_loss = train_epoch(model, train_loader, criterion, optimizer, device)
        scheduler.step()
        
        ctrl_metrics, _, _ = evaluate_model(model, ctrl_val_loader, criterion, device, index_to_class)
        field_metrics, _, _ = evaluate_model(model, field_val_loader, criterion, device, index_to_class)
        
        epoch_dur = time.time() - epoch_start
        
        ctrl_f1 = ctrl_metrics["macro_f1"]
        field_f1 = field_metrics["macro_f1"]
        th_recall = field_metrics["per_class"]["tomato_healthy"]["recall"]
        
        passes_guardrail = (ctrl_f1 >= 0.94)
        is_best = False
        
        if passes_guardrail and (field_f1 > best_field_f1 + 0.001):
            is_best = True
            best_field_f1 = field_f1
            best_epoch = epoch
            best_state_dict = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            best_ctrl_metrics = ctrl_metrics
            best_field_metrics = field_metrics
            no_improve_epochs = 0
        else:
            no_improve_epochs += 1
            
        print(f"Epoch {epoch:02d}/{max_epochs:02d} [{epoch_dur:.1f}s] | "
              f"Train Loss: {train_loss:.4f} | "
              f"Ctrl F1: {ctrl_f1:.4f} (Acc: {ctrl_metrics['accuracy']:.4f}) | "
              f"Field F1: {field_f1:.4f} (Acc: {field_metrics['accuracy']:.4f}, th_rec: {th_recall:.2f}) | "
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
            "field_tomato_healthy_recall": th_recall,
            "passes_guardrail": passes_guardrail,
            "is_best": is_best
        })
        
        if no_improve_epochs >= patience:
            print(f"\nEarly stopping triggered: No field validation improvement for {patience} epochs.")
            break
            
    total_training_time = time.time() - start_time
    print(f"\nTraining completed in {total_training_time:.1f} seconds ({total_training_time/60:.2f} minutes).")
    print(f"Best Checkpoint selected from Epoch {best_epoch}: Field Val Macro F1 = {best_field_f1:.4f}")
    
    # 9. Save Best Checkpoint and Artifacts
    best_ckpt_path = os.path.join(exp_out_dir, "best_model.pt")
    torch.save({
        "state_dict": best_state_dict,
        "epoch": best_epoch,
        "experiment": "Exp_B_PlantDoc_Field_Adaptation",
        "controlled_val_macro_f1": best_ctrl_metrics["macro_f1"],
        "field_val_macro_f1": best_field_metrics["macro_f1"],
        "class_mapping": class_to_index,
        "index_to_class": index_to_class,
        "architecture": "mobilenet_v3_small",
        "input_size": [3, 224, 224]
    }, best_ckpt_path)
    print(f"Saved Exp B best checkpoint: {best_ckpt_path}")
    
    # 10. Final Evaluation
    model.load_state_dict(best_state_dict)
    final_ctrl_metrics, final_ctrl_targs, final_ctrl_preds = evaluate_model(model, ctrl_val_loader, criterion, device, index_to_class)
    final_field_metrics, final_field_targs, final_field_preds = evaluate_model(model, field_val_loader, criterion, device, index_to_class)
    
    classes_7 = [index_to_class[i] for i in range(7)]
    cm_ctrl = confusion_matrix(final_ctrl_targs, final_ctrl_preds, labels=range(7))
    cm_field = confusion_matrix(final_field_targs, final_field_preds, labels=range(7))
    
    df_cm_ctrl = pd.DataFrame(cm_ctrl, index=classes_7, columns=classes_7)
    df_cm_field = pd.DataFrame(cm_field, index=classes_7, columns=classes_7)
    
    df_cm_ctrl.to_csv(os.path.join(exp_out_dir, "confusion_matrix_controlled_val.csv"))
    df_cm_field.to_csv(os.path.join(exp_out_dir, "confusion_matrix_field_val.csv"))
    
    # Save Metadata & Metrics
    with open(os.path.join(exp_out_dir, "history.json"), "w") as f:
        json.dump(history, f, indent=2)
    with open(os.path.join(exp_out_dir, "controlled_val_metrics.json"), "w") as f:
        json.dump(final_ctrl_metrics, f, indent=2)
    with open(os.path.join(exp_out_dir, "field_val_metrics.json"), "w") as f:
        json.dump(final_field_metrics, f, indent=2)
    with open(os.path.join(exp_out_dir, "domain_sampling_config.json"), "w") as f:
        json.dump({
            "domain_sampling_probabilities": p_dom,
            "domain_counts": n_dom,
            "effective_class_exposure": class_exposure.to_dict(),
            "class_weights": {cls: float(normalized_weights[class_to_index[cls]]) for cls in class_to_index}
        }, f, indent=2)
        
    # 11. Compare Phase 3 vs Exp A vs Exp B
    # Load Exp A field metrics
    exp_a_field_path = os.path.join(base_prefix, "training/experiments/exp_a_augmentation_only/field_val_metrics.json")
    exp_a_ctrl_path = os.path.join(base_prefix, "training/experiments/exp_a_augmentation_only/controlled_val_metrics.json")
    
    exp_a_field_metrics, exp_a_ctrl_metrics = None, None
    if os.path.exists(exp_a_field_path):
        with open(exp_a_field_path) as f:
            exp_a_field_metrics = json.load(f)
    if os.path.exists(exp_a_ctrl_path):
        with open(exp_a_ctrl_path) as f:
            exp_a_ctrl_metrics = json.load(f)
            
    print("\n" + "="*85)
    print("THREE-WAY COMPARISON: PHASE 3 BASELINE vs. EXP A (AUG ONLY) vs. EXP B (FIELD ADAPT)")
    print("="*85)
    
    exp_a_c_f1 = exp_a_ctrl_metrics['macro_f1'] if exp_a_ctrl_metrics else 0.0
    exp_a_f_acc = exp_a_field_metrics['accuracy'] if exp_a_field_metrics else 0.0
    exp_a_f_f1 = exp_a_field_metrics['macro_f1'] if exp_a_field_metrics else 0.0
    
    print(f"{'Metric':<35} | {'Phase 3 Base':<14} | {'Exp A (Aug)':<14} | {'Exp B (Field)':<14} | {'B vs Base':<10}")
    print("-"*85)
    print(f"{'Controlled Val Macro F1 (1116)':<35} | {p3_ctrl_metrics['macro_f1']:<14.4f} | {exp_a_c_f1:<14.4f} | {final_ctrl_metrics['macro_f1']:<14.4f} | {final_ctrl_metrics['macro_f1'] - p3_ctrl_metrics['macro_f1']:+.4f}")
    print(f"{'Field Val Accuracy (81)':<35} | {p3_field_metrics['accuracy']:<14.4f} | {exp_a_f_acc:<14.4f} | {final_field_metrics['accuracy']:<14.4f} | {final_field_metrics['accuracy'] - p3_field_metrics['accuracy']:+.4f}")
    print(f"{'Field Val Macro F1 (81)':<35} | {p3_field_metrics['macro_f1']:<14.4f} | {exp_a_f_f1:<14.4f} | {final_field_metrics['macro_f1']:<14.4f} | {final_field_metrics['macro_f1'] - p3_field_metrics['macro_f1']:+.4f}")
    
    # Per class recall
    for cls_name in ["potato_early_blight", "potato_late_blight", "tomato_early_blight", "tomato_healthy", "tomato_late_blight"]:
        r_p3 = p3_field_metrics['per_class'][cls_name]['recall']
        r_ea = exp_a_field_metrics['per_class'][cls_name]['recall'] if exp_a_field_metrics else 0.0
        r_eb = final_field_metrics['per_class'][cls_name]['recall']
        print(f"{'  ' + cls_name + ' Recall':<35} | {r_p3:<14.4f} | {r_ea:<14.4f} | {r_eb:<14.4f} | {r_eb - r_p3:+.4f}")
        
    # Confusion predictions
    p3_bg = sum(1 for p in p3_field_preds if p == 0)
    eb_bg = sum(1 for p in final_field_preds if p == 0)
    p3_tlb = sum(1 for p in p3_field_preds if p == 6)
    eb_tlb = sum(1 for p in final_field_preds if p == 6)
    
    print(f"{'Field False Background Rejections':<35} | {p3_bg:<14d} | {'14':<14} | {eb_bg:<14d} | {eb_bg - p3_bg:+d}")
    print(f"{'Field Predicted as tomato_late_blight':<35} | {p3_tlb:<14d} | {'47':<14} | {eb_tlb:<14d} | {eb_tlb - p3_tlb:+d}")

if __name__ == "__main__":
    run_experiment_b()
