import os
import json
import torch
import numpy as np
import pandas as pd

from dataset import CropHealthDataset, get_train_transforms, get_eval_transforms, compute_dynamic_class_weights, load_class_mapping
from train import build_model, configure_stage1_parameters, configure_stage2_parameters
from metrics import compute_classification_metrics
from evaluate import load_model_from_checkpoint

def run_dry_validation():
    print("==================================================")
    print("PHASE 3B: DRY VALIDATION & INTEGRATION SMOKE TESTS")
    print("==================================================")
    
    # 1. Environment & Package Versions
    import torchvision
    import sklearn
    print(f"Discovered Environment:")
    print(f"  PyTorch:     {torch.__version__}")
    print(f"  Torchvision: {torchvision.__version__}")
    print(f"  Scikit-Learn:{sklearn.__version__}")
    cuda_detected = torch.cuda.is_available()
    print(f"  CUDA Detected: {cuda_detected}")
    
    # 2. Class Mapping Verification
    class_mapping_path = "training/class_mapping.json"
    class_to_index, index_to_class = load_class_mapping(class_mapping_path)
    assert len(class_to_index) == 7
    print(f"\n[1/7] Class Mapping: Validated 7 classes.")
    for idx in range(7):
        print(f"   Index {idx} -> {index_to_class[idx]}")
        
    # 3. Dataset Lengths & Split Isolation Verification
    manifest_path = "data/manifests/training_manifest.csv"
    field_manifest_path = "data/manifests/field_eval_manifest.csv"
    
    ds_train = CropHealthDataset(manifest_path, split="train", transform=get_train_transforms(), class_mapping_path=class_mapping_path)
    ds_val = CropHealthDataset(manifest_path, split="val", transform=get_eval_transforms(), class_mapping_path=class_mapping_path)
    ds_test = CropHealthDataset(manifest_path, split="test", transform=get_eval_transforms(), class_mapping_path=class_mapping_path)
    ds_field = CropHealthDataset(field_manifest_path, split=None, transform=get_eval_transforms(), class_mapping_path=class_mapping_path)
    
    print(f"\n[2/7] Dataset Manifests & Lengths:")
    print(f"  Train Set:       {len(ds_train)} (Expected: 5170)")
    print(f"  Val Set:         {len(ds_val)} (Expected: 1116)")
    print(f"  Controlled Test: {len(ds_test)} (Expected: 1101)")
    print(f"  Field Eval (PD): {len(ds_field)} (Expected: 448)")
    
    assert len(ds_train) == 5170
    assert len(ds_val) == 1116
    assert len(ds_test) == 1101
    assert len(ds_field) == 448
    
    # Check that PlantDoc paths never appear in training dataset
    train_paths = set(rec["path"] for rec in ds_train.records)
    val_paths = set(rec["path"] for rec in ds_val.records)
    field_paths = set(rec["path"] for rec in ds_field.records)
    
    assert len(train_paths & field_paths) == 0
    assert len(val_paths & field_paths) == 0
    print("  --> Isolation: Zero PlantDoc samples in training/val splits.")
    
    # 4. Transform & Forward Pass Smoke Test
    print(f"\n[3/7] Transform & Image Pipeline Smoke Test:")
    sample_img, sample_lbl = ds_train[0]
    print(f"  Sample transformed image shape: {sample_img.shape} (dtype={sample_img.dtype})")
    assert sample_img.shape == (3, 224, 224)
    assert isinstance(sample_lbl, torch.Tensor)
    
    # 5. Class Weights Calculation Verification
    weights = compute_dynamic_class_weights(manifest_path, class_mapping_path)
    print(f"\n[4/7] Dynamic Square-Root Inverse Class Weights:")
    expected_approx = [0.978, 0.847, 2.197, 0.847, 0.846, 0.672, 0.614]
    for idx, w in enumerate(weights):
        w_val = round(float(w), 4)
        print(f"   Class {idx} ({index_to_class[idx]:20}): {w_val:.4f} (Expected ~{expected_approx[idx]})")
        assert abs(w_val - expected_approx[idx]) < 0.01, f"Weight discrepancy for class {idx}"
        
    # 6. Model Architecture & Layer Freezing Smoke Test
    print(f"\n[5/7] Model Architecture & Stage Freezing:")
    model = build_model(num_classes=7, pretrained=False)
    
    # Dummy forward pass
    dummy_input = torch.randn(2, 3, 224, 224)
    dummy_output = model(dummy_input)
    print(f"  Dummy input shape:  {dummy_input.shape}")
    print(f"  Dummy output shape: {dummy_output.shape} (Expected: (2, 7))")
    assert dummy_output.shape == (2, 7)
    
    total_params = sum(p.numel() for p in model.parameters())
    
    # Stage 1 Freezing Test
    configure_stage1_parameters(model)
    s1_trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"  Stage 1: {s1_trainable:,} trainable / {total_params:,} total (features[0:13] frozen, classifier trainable)")
    assert s1_trainable == 598023
    
    # Stage 2 Freezing Test
    configure_stage2_parameters(model)
    s2_trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"  Stage 2: {s2_trainable:,} trainable / {total_params:,} total (features[0:9] frozen, features[9:13] + classifier trainable)")
    assert s2_trainable == 1334511
    
    # 7. Metrics & Confusion Matrix Smoke Test
    print(f"\n[6/7] Metrics Suite Smoke Test:")
    y_true_mock = [0, 1, 2, 3, 4, 5, 6, 1, 2, 4]
    y_pred_mock = [0, 1, 2, 3, 4, 5, 6, 1, 1, 4]
    metrics = compute_classification_metrics(y_true_mock, y_pred_mock, index_to_class=index_to_class)
    print(f"  Mock Accuracy:   {metrics['accuracy']}")
    print(f"  Mock Macro F1:   {metrics['macro_f1']}")
    print(f"  Mock Weighted F1:{metrics['weighted_f1']}")
    assert "per_class" in metrics
    assert "confusion_matrix" in metrics
    
    # 8. Checkpoint Metadata Validation Logic Test (Dummy Checkpoint)
    print(f"\n[7/7] Checkpoint Metadata Compatibility Test:")
    dummy_ckpt_path = "training/checkpoints/dummy_test_ckpt.pt"
    os.makedirs("training/checkpoints", exist_ok=True)
    
    torch.save({
        "state_dict": model.state_dict(),
        "class_mapping": class_to_index,
        "architecture": "mobilenet_v3_small",
        "input_size": [3, 224, 224],
        "normalization": {"mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225]},
        "dataset_version": "crop-health-v1",
        "val_macro_f1": 0.95
    }, dummy_ckpt_path)
    
    loaded_model, loaded_meta = load_model_from_checkpoint(dummy_ckpt_path, torch.device("cpu"))
    assert loaded_meta["dataset_version"] == "crop-health-v1"
    os.remove(dummy_ckpt_path)
    print("  Dummy checkpoint saved, successfully validated, and removed. No permanent weights created.")
    
    print("\nALL PHASE 3B DRY TESTS PASSED SUCCESSFULLY.")

if __name__ == "__main__":
    run_dry_validation()
