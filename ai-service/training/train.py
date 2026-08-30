import os
import json
import random
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights
from tqdm import tqdm

from dataset import CropHealthDataset, get_train_transforms, get_eval_transforms, compute_dynamic_class_weights, load_class_mapping
from metrics import compute_classification_metrics

def set_seed(seed=42):
    """Sets deterministic seeds across Python, NumPy, and PyTorch."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False

def build_model(num_classes=7, pretrained=True):
    """
    Builds MobileNetV3-Small with a 7-class linear classification head.
    """
    weights = MobileNet_V3_Small_Weights.DEFAULT if pretrained else None
    model = mobilenet_v3_small(weights=weights)
    
    # Replace final linear layer in classifier
    in_features = model.classifier[3].in_features # 1024
    model.classifier[3] = nn.Linear(in_features, num_classes)
    return model

def configure_stage1_parameters(model):
    """
    Stage 1: Freeze all backbone feature extractor layers (features 0-12).
    Train only the classifier head.
    """
    for param in model.features.parameters():
        param.requires_grad = False
    for param in model.classifier.parameters():
        param.requires_grad = True

def configure_stage2_parameters(model):
    """
    Stage 2: Keep early low-level feature extraction blocks frozen (features 0-8).
    Unfreeze later semantic feature blocks (features 9-12) and classifier head.
    """
    for idx in range(9):
        for param in model.features[idx].parameters():
            param.requires_grad = False
    for idx in range(9, len(model.features)):
        for param in model.features[idx].parameters():
            param.requires_grad = True
    for param in model.classifier.parameters():
        param.requires_grad = True

def train_one_epoch(model, dataloader, criterion, optimizer, device):
    model.train()
    running_loss = 0.0
    all_preds, all_targets = [], []
    
    for images, targets in tqdm(dataloader, desc="Training", leave=False):
        images, targets = images.to(device), targets.to(device)
        optimizer.zero_grad()
        
        outputs = model(images)
        loss = criterion(outputs, targets)
        loss.backward()
        optimizer.step()
        
        running_loss += loss.item() * images.size(0)
        preds = torch.argmax(outputs, dim=1)
        all_preds.extend(preds.cpu().numpy())
        all_targets.extend(targets.cpu().numpy())
        
    epoch_loss = running_loss / len(dataloader.dataset)
    return epoch_loss, all_targets, all_preds

@torch.no_grad()
def evaluate_epoch(model, dataloader, criterion, device, index_to_class):
    model.eval()
    running_loss = 0.0
    all_preds, all_targets = [], []
    
    for images, targets in tqdm(dataloader, desc="Evaluating", leave=False):
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
    return metrics

def run_training(config_path="training/training_config.json"):
    import time
    start_time = time.time()
    
    with open(config_path, "r") as f:
        config = json.load(f)

        
    set_seed(config["seed"])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using compute device: {device}")
    
    # 1. Load Datasets
    manifest_path = config["training_manifest_path"]
    class_mapping_path = config["class_mapping_path"]
    class_to_index, index_to_class = load_class_mapping(class_mapping_path)
    num_classes = config["num_classes"]
    
    train_dataset = CropHealthDataset(manifest_path, split="train", transform=get_train_transforms(), class_mapping_path=class_mapping_path)
    val_dataset = CropHealthDataset(manifest_path, split="val", transform=get_eval_transforms(), class_mapping_path=class_mapping_path)
    
    print(f"Loaded datasets: Train={len(train_dataset)}, Val={len(val_dataset)}")
    
    train_loader = DataLoader(
        train_dataset, 
        batch_size=config["batch_size"], 
        shuffle=True, 
        num_workers=config["num_workers"],
        pin_memory=(device.type == "cuda")
    )
    val_loader = DataLoader(
        val_dataset, 
        batch_size=config["batch_size"], 
        shuffle=False, 
        num_workers=config["num_workers"],
        pin_memory=(device.type == "cuda")
    )
    
    # 2. Compute Class Weights & Criterion
    class_weights = compute_dynamic_class_weights(manifest_path, class_mapping_path).to(device)
    print("\nDynamic Square-Root Inverse Class Weights:")
    for idx, w in enumerate(class_weights):
        print(f"  {idx}: {index_to_class[idx]:20} -> {w.item():.4f}")
    criterion = nn.CrossEntropyLoss(weight=class_weights)
    val_criterion = nn.CrossEntropyLoss() # unweighted for unbiased evaluation
    
    # 3. Build Model
    model = build_model(num_classes=num_classes, pretrained=True).to(device)
    
    # Checkpoint tracking
    os.makedirs(config["checkpoint_dir"], exist_ok=True)
    best_checkpoint_path = os.path.join(config["checkpoint_dir"], config["checkpoint_file"]).replace("\\", "/")
    best_val_macro_f1 = -1.0
    epochs_without_improvement = 0
    patience = config["early_stopping_patience"]
    min_delta = config["early_stopping_min_delta"]
    
    history = []
    
    # =========================================================================
    # STAGE 1: Classifier Warmup (Backbone Frozen)
    # =========================================================================
    warmup_epochs = config["warmup_epochs"]
    print(f"\n{'='*50}\nSTARTING STAGE 1: Classifier Head Warmup ({warmup_epochs} epochs)\n{'='*50}")
    configure_stage1_parameters(model)
    
    s1_trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Stage 1 Trainable parameters: {s1_trainable:,} / {sum(p.numel() for p in model.parameters()):,}")
    
    optimizer = torch.optim.AdamW(
        filter(lambda p: p.requires_grad, model.parameters()), 
        lr=config["warmup_lr"], 
        weight_decay=config["weight_decay"]
    )
    
    for epoch in range(1, warmup_epochs + 1):
        train_loss, y_true, y_pred = train_one_epoch(model, train_loader, criterion, optimizer, device)
        train_metrics = compute_classification_metrics(y_true, y_pred, index_to_class=index_to_class)
        val_metrics = evaluate_epoch(model, val_loader, val_criterion, device, index_to_class)
        
        val_f1 = val_metrics["macro_f1"]
        print(f"[Stage 1 - Epoch {epoch}/{warmup_epochs}] Train Loss: {train_loss:.4f} | Val Loss: {val_metrics['loss']:.4f} | Val Acc: {val_metrics['accuracy']:.4f} | Val Macro F1: {val_f1:.4f}")
        
        epoch_log = {
            "epoch": epoch,
            "stage": 1,
            "train_loss": round(train_loss, 4),
            "train_accuracy": train_metrics["accuracy"],
            "train_macro_f1": train_metrics["macro_f1"],
            "val_loss": val_metrics["loss"],
            "val_accuracy": val_metrics["accuracy"],
            "val_macro_precision": val_metrics["macro_precision"],
            "val_macro_recall": val_metrics["macro_recall"],
            "val_macro_f1": val_f1,
            "val_weighted_f1": val_metrics["weighted_f1"],
            "val_per_class": val_metrics["per_class"]
        }
        history.append(epoch_log)

        
        # Checkpoint if improved
        if val_f1 > best_val_macro_f1 + min_delta:
            best_val_macro_f1 = val_f1
            epochs_without_improvement = 0
            torch.save({
                "state_dict": model.state_dict(),
                "class_mapping": class_to_index,
                "index_to_class": index_to_class,
                "architecture": config["architecture"],
                "input_size": config["input_size"],
                "normalization": config["normalization"],
                "val_macro_f1": best_val_macro_f1,
                "dataset_version": config["dataset_version"],
                "training_config": config,
                "epoch": epoch,
                "stage": 1
            }, best_checkpoint_path)
            print(f"  --> Saved new best model checkpoint (Val Macro F1: {val_f1:.4f})")
            
    # =========================================================================
    # STAGE 2: Fine-Tuning (Later Backbone Blocks + Head)
    # =========================================================================
    finetune_epochs = config["finetune_epochs"]
    print(f"\n{'='*50}\nSTARTING STAGE 2: Fine-Tuning ({finetune_epochs} epochs)\n{'='*50}")
    configure_stage2_parameters(model)
    
    s2_trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Stage 2 Trainable parameters: {s2_trainable:,} / {sum(p.numel() for p in model.parameters()):,}")
    
    # Differential learning rates
    backbone_params = [p for idx in range(9, len(model.features)) for p in model.features[idx].parameters() if p.requires_grad]
    classifier_params = [p for p in model.classifier.parameters() if p.requires_grad]
    
    optimizer = torch.optim.AdamW([
        {"params": backbone_params, "lr": config["backbone_lr"]},
        {"params": classifier_params, "lr": config["classifier_lr"]}
    ], weight_decay=config["weight_decay"])
    
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=finetune_epochs, eta_min=1e-6)
    
    for epoch in range(1, finetune_epochs + 1):
        global_epoch = warmup_epochs + epoch
        train_loss, y_true, y_pred = train_one_epoch(model, train_loader, criterion, optimizer, device)
        train_metrics = compute_classification_metrics(y_true, y_pred, index_to_class=index_to_class)
        val_metrics = evaluate_epoch(model, val_loader, val_criterion, device, index_to_class)
        scheduler.step()
        
        val_f1 = val_metrics["macro_f1"]
        print(f"[Stage 2 - Epoch {epoch}/{finetune_epochs} (Total {global_epoch})] Train Loss: {train_loss:.4f} | Val Loss: {val_metrics['loss']:.4f} | Val Acc: {val_metrics['accuracy']:.4f} | Val Macro F1: {val_f1:.4f}")
        
        epoch_log = {
            "epoch": global_epoch,
            "stage": 2,
            "train_loss": round(train_loss, 4),
            "train_accuracy": train_metrics["accuracy"],
            "train_macro_f1": train_metrics["macro_f1"],
            "val_loss": val_metrics["loss"],
            "val_accuracy": val_metrics["accuracy"],
            "val_macro_precision": val_metrics["macro_precision"],
            "val_macro_recall": val_metrics["macro_recall"],
            "val_macro_f1": val_f1,
            "val_weighted_f1": val_metrics["weighted_f1"],
            "val_per_class": val_metrics["per_class"]
        }
        history.append(epoch_log)

        
        # Checkpoint and Early Stopping Check
        if val_f1 > best_val_macro_f1 + min_delta:
            best_val_macro_f1 = val_f1
            epochs_without_improvement = 0
            torch.save({
                "state_dict": model.state_dict(),
                "class_mapping": class_to_index,
                "index_to_class": index_to_class,
                "architecture": config["architecture"],
                "input_size": config["input_size"],
                "normalization": config["normalization"],
                "val_macro_f1": best_val_macro_f1,
                "dataset_version": config["dataset_version"],
                "training_config": config,
                "epoch": global_epoch,
                "stage": 2
            }, best_checkpoint_path)
            print(f"  --> Saved new best model checkpoint (Val Macro F1: {val_f1:.4f})")
        else:
            epochs_without_improvement += 1
            print(f"  No improvement for {epochs_without_improvement}/{patience} epochs.")
            if epochs_without_improvement >= patience:
                print(f"\nEarly stopping triggered after {epochs_without_improvement} epochs without val macro F1 improvement.")
                break
                
    # Save training history
    total_duration = time.time() - start_time
    history_meta = {
        "dataset_version": config["dataset_version"],
        "architecture": config["architecture"],
        "device": str(device),
        "total_duration_seconds": round(total_duration, 2),
        "warmup_epochs_planned": warmup_epochs,
        "finetune_epochs_planned": finetune_epochs,
        "best_val_macro_f1": best_val_macro_f1,
        "early_stopping_triggered": epochs_without_improvement >= patience,
        "class_weights": {index_to_class[idx]: round(float(w.item()), 4) for idx, w in enumerate(class_weights)},
        "epochs": history
    }
    
    os.makedirs("training/artifacts", exist_ok=True)
    history_path1 = "training/artifacts/training_history.json"
    history_path2 = os.path.join(config["checkpoint_dir"], "training_history.json").replace("\\", "/")
    
    with open(history_path1, "w") as f:
        json.dump(history_meta, f, indent=2)
    with open(history_path2, "w") as f:
        json.dump(history_meta, f, indent=2)
        
    print(f"\nTraining completed in {total_duration:.1f}s. Best Val Macro F1: {best_val_macro_f1:.4f}")
    print(f"Training history saved to {history_path1}")
    print(f"Best model checkpoint saved to: {best_checkpoint_path}")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--run":
        run_training()
    else:
        print("train.py module loaded successfully. Run with '--run' to start training.")
