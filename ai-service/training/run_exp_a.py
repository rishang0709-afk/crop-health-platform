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
from torch.utils.data import DataLoader
from torchvision.models import mobilenet_v3_small
from sklearn.metrics import classification_report, confusion_matrix

sys.path.insert(0, os.path.dirname(__file__))
from dataset import CropHealthDataset, get_train_transforms, get_eval_transforms, compute_dynamic_class_weights, load_class_mapping
from metrics import compute_classification_metrics

def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False

def build_and_load_model(checkpoint_path, num_classes=7):
    """Builds MobileNetV3-Small and loads existing Phase 3 best checkpoint."""
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

def configure_exp_a_parameters(model):
    """
    Freezes features 0-8.
    Unfreezes features 9-12 (backbone LR: 1e-5).
    Classifier trainable (classifier LR: 3e-4).
    """
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

def run_experiment_a():
    base_prefix = ""
    if not os.path.exists("data/manifests") and os.path.exists("ai-service/data/manifests"):
        base_prefix = "ai-service/"
        
    set_seed(42)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("="*70)
    print("PHASE 4B.4A: EXPERIMENT A (AUGMENTATION-ONLY ABLATION BASELINE)")
    print(f"Device: {device} | Start Time: {datetime.datetime.now()}")
    print("="*70)
    
    # 1. Manifest Paths
    train_manifest = os.path.join(base_prefix, "data/manifests/training_manifest.csv")
    field_val_manifest = os.path.join(base_prefix, "data/manifests/plantdoc_adapt_val_manifest.csv")
    class_mapping_path = os.path.join(base_prefix, "training/class_mapping.json")
    phase3_ckpt_path = os.path.join(base_prefix, "training/checkpoints/best_model.pt")
    
    exp_out_dir = os.path.join(base_prefix, "training/experiments/exp_a_augmentation_only")
    os.makedirs(exp_out_dir, exist_ok=True)
    
    class_to_index, index_to_class = load_class_mapping(class_mapping_path)
    
    # 2. Datasets & Loaders
    print("\n[Step 1: Dataset Composition & Pre-Training Validation]")
    train_dataset = CropHealthDataset(
        manifest_path=train_manifest,
        split="train",
        transform=get_train_transforms(),
        class_mapping_path=class_mapping_path
    )
    controlled_val_dataset = CropHealthDataset(
        manifest_path=train_manifest,
        split="val",
        transform=get_eval_transforms(),
        class_mapping_path=class_mapping_path
    )
    field_val_dataset = CropHealthDataset(
        manifest_path=field_val_manifest,
        split=None,
        transform=get_eval_transforms(),
        class_mapping_path=class_mapping_path
    )
    
    # Verify exact counts
    assert len(train_dataset) == 5170, f"Expected 5170 train images, got {len(train_dataset)}"
    assert len(controlled_val_dataset) == 1116, f"Expected 1116 controlled val images, got {len(controlled_val_dataset)}"
    assert len(field_val_dataset) == 81, f"Expected 81 field val images, got {len(field_val_dataset)}"
    
    # Verify no holdout or ag-negative images in training
    df_train_raw = pd.read_csv(train_manifest)
    df_train_rows = df_train_raw[df_train_raw["split"] == "train"]
    assert "plantdoc_test_holdout" not in str(df_train_rows["source"].unique()), "Holdout present in train!"
    assert "deepweeds" not in str(df_train_rows["source"].unique()), "DeepWeeds present in train!"
    
    print(f"  Exp A Train Dataset:          {len(train_dataset)} images (4,645 PlantVillage + 525 COCO)")
    print(f"  Controlled Val Dataset:       {len(controlled_val_dataset)} images (1,004 PlantVillage + 112 COCO)")
    print(f"  Field Diagnostic Val Dataset: {len(field_val_dataset)} images (81 PlantDoc adapt_val)")
    print("  Pre-training count verification: [PASS]")
    
    # Dataloaders
    batch_size = 32
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=0)
    controlled_val_loader = DataLoader(controlled_val_dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    field_val_loader = DataLoader(field_val_dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    
    # Compute Class Weights strictly from Exp A train rows
    class_weights = compute_dynamic_class_weights(train_manifest, class_mapping_path).to(device)
    print(f"  Class Weights (computed from 5,170 train rows):\n  {class_weights.cpu().numpy()}")
    criterion = nn.CrossEntropyLoss(weight=class_weights)
    
    # 3. Baseline Evaluation of Phase 3 Checkpoint on EXACT same sets
    print("\n[Step 2: Evaluating Frozen Phase 3 Checkpoint on Exact Validation Splits]")
    p3_model = build_and_load_model(phase3_ckpt_path, num_classes=7).to(device)
    p3_ctrl_metrics, p3_ctrl_targs, p3_ctrl_preds = evaluate_model(p3_model, controlled_val_loader, criterion, device, index_to_class)
    p3_field_metrics, p3_field_targs, p3_field_preds = evaluate_model(p3_model, field_val_loader, criterion, device, index_to_class)
    
    print(f"  Phase 3 Baseline Controlled Val: Accuracy = {p3_ctrl_metrics['accuracy']:.4f}, Macro F1 = {p3_ctrl_metrics['macro_f1']:.4f}")
    print(f"  Phase 3 Baseline Field Val:      Accuracy = {p3_field_metrics['accuracy']:.4f}, Macro F1 = {p3_field_metrics['macro_f1']:.4f}")
    print(f"  Phase 3 Baseline Field tomato_healthy recall: {p3_field_metrics['per_class']['tomato_healthy']['recall']:.4f}")
    
    # 4. Initialize Model for Exp A Fine-Tuning
    print("\n[Step 3: Initializing Model for Exp A Fine-Tuning]")
    model = build_and_load_model(phase3_ckpt_path, num_classes=7).to(device)
    configure_exp_a_parameters(model)
    
    trainable_params = [p for p in model.parameters() if p.requires_grad]
    print(f"  Total trainable parameter tensors: {len(trainable_params)}")
    
    optimizer = torch.optim.AdamW([
        {"params": [p for idx in range(9, len(model.features)) for p in model.features[idx].parameters() if p.requires_grad], "lr": 1e-5, "weight_decay": 1e-4},
        {"params": model.classifier.parameters(), "lr": 3e-4, "weight_decay": 1e-4}
    ])
    
    max_epochs = 12
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max_epochs, eta_min=1e-6)
    
    # 5. Training Loop with Dual Validation & Checkpoint Selection
    print("\n[Step 4: Starting Fine-Tuning Loop]")
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
        
        # Dual validation
        ctrl_metrics, _, _ = evaluate_model(model, controlled_val_loader, criterion, device, index_to_class)
        field_metrics, _, _ = evaluate_model(model, field_val_loader, criterion, device, index_to_class)
        
        epoch_dur = time.time() - epoch_start
        
        ctrl_f1 = ctrl_metrics["macro_f1"]
        field_f1 = field_metrics["macro_f1"]
        th_recall = field_metrics["per_class"]["tomato_healthy"]["recall"]
        
        # Selection Rule:
        # Guardrail: controlled_val Macro F1 >= 0.94
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
    
    # 6. Save Experiment A Best Checkpoint & Artifacts
    best_ckpt_path = os.path.join(exp_out_dir, "best_model.pt")
    torch.save({
        "state_dict": best_state_dict,
        "epoch": best_epoch,
        "experiment": "Exp_A_Augmentation_Only",
        "controlled_val_macro_f1": best_ctrl_metrics["macro_f1"],
        "field_val_macro_f1": best_field_metrics["macro_f1"],
        "class_mapping": class_to_index,
        "index_to_class": index_to_class,
        "architecture": "mobilenet_v3_small",
        "input_size": [3, 224, 224]
    }, best_ckpt_path)
    print(f"Saved Exp A best checkpoint: {best_ckpt_path}")
    
    # 7. Final Comprehensive Evaluation with Selected Model
    model.load_state_dict(best_state_dict)
    final_ctrl_metrics, final_ctrl_targs, final_ctrl_preds = evaluate_model(model, controlled_val_loader, criterion, device, index_to_class)
    final_field_metrics, final_field_targs, final_field_preds = evaluate_model(model, field_val_loader, criterion, device, index_to_class)
    
    # Confusion Matrices
    classes_7 = [index_to_class[i] for i in range(7)]
    cm_ctrl = confusion_matrix(final_ctrl_targs, final_ctrl_preds, labels=range(7))
    cm_field = confusion_matrix(final_field_targs, final_field_preds, labels=range(7))
    
    df_cm_ctrl = pd.DataFrame(cm_ctrl, index=classes_7, columns=classes_7)
    df_cm_field = pd.DataFrame(cm_field, index=classes_7, columns=classes_7)
    
    df_cm_ctrl.to_csv(os.path.join(exp_out_dir, "confusion_matrix_controlled_val.csv"))
    df_cm_field.to_csv(os.path.join(exp_out_dir, "confusion_matrix_field_val.csv"))
    
    # Save Metrics & History JSONs
    with open(os.path.join(exp_out_dir, "history.json"), "w") as f:
        json.dump(history, f, indent=2)
    with open(os.path.join(exp_out_dir, "phase3_baseline_metrics.json"), "w") as f:
        json.dump({"controlled_val": p3_ctrl_metrics, "field_val": p3_field_metrics}, f, indent=2)
    with open(os.path.join(exp_out_dir, "controlled_val_metrics.json"), "w") as f:
        json.dump(final_ctrl_metrics, f, indent=2)
    with open(os.path.join(exp_out_dir, "field_val_metrics.json"), "w") as f:
        json.dump(final_field_metrics, f, indent=2)
        
    # Print Comparative Tables
    print("\n" + "="*70)
    print("PHASE 3 BASELINE vs. EXPERIMENT A COMPARISON")
    print("="*70)
    print(f"{'Metric':<35} | {'Phase 3 Baseline':<18} | {'Exp A (Aug Only)':<18} | {'Delta':<10}")
    print("-"*70)
    print(f"{'Controlled Val Accuracy (1116)':<35} | {p3_ctrl_metrics['accuracy']:<18.4f} | {final_ctrl_metrics['accuracy']:<18.4f} | {final_ctrl_metrics['accuracy'] - p3_ctrl_metrics['accuracy']:+.4f}")
    print(f"{'Controlled Val Macro F1 (1116)':<35} | {p3_ctrl_metrics['macro_f1']:<18.4f} | {final_ctrl_metrics['macro_f1']:<18.4f} | {final_ctrl_metrics['macro_f1'] - p3_ctrl_metrics['macro_f1']:+.4f}")
    print(f"{'Field Val Accuracy (81)':<35} | {p3_field_metrics['accuracy']:<18.4f} | {final_field_metrics['accuracy']:<18.4f} | {final_field_metrics['accuracy'] - p3_field_metrics['accuracy']:+.4f}")
    print(f"{'Field Val Macro F1 (81)':<35} | {p3_field_metrics['macro_f1']:<18.4f} | {final_field_metrics['macro_f1']:<18.4f} | {final_field_metrics['macro_f1'] - p3_field_metrics['macro_f1']:+.4f}")
    
    p3_th = p3_field_metrics['per_class']['tomato_healthy']['recall']
    exp_th = final_field_metrics['per_class']['tomato_healthy']['recall']
    print(f"{'Field tomato_healthy Recall':<35} | {p3_th:<18.4f} | {exp_th:<18.4f} | {exp_th - p3_th:+.4f}")
    
    # Background confusion count on field val
    p3_bg_preds = sum(1 for p in p3_field_preds if p == 0)
    exp_bg_preds = sum(1 for p in final_field_preds if p == 0)
    print(f"{'Field Predicted as Background':<35} | {p3_bg_preds:<18d} | {exp_bg_preds:<18d} | {exp_bg_preds - p3_bg_preds:+d}")
    
    print("\nField Validation Per-Class Recall Comparison:")
    for cls_name in ["potato_early_blight", "potato_late_blight", "tomato_early_blight", "tomato_healthy", "tomato_late_blight"]:
        r_p3 = p3_field_metrics['per_class'][cls_name]['recall']
        r_exp = final_field_metrics['per_class'][cls_name]['recall']
        print(f"  - {cls_name:<25}: Phase 3 = {r_p3:.4f} -> Exp A = {r_exp:.4f} ({r_exp - r_p3:+.4f})")

if __name__ == "__main__":
    run_experiment_a()
