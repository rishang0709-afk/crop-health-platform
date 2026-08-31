import os
import sys
import json
import hashlib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from torchvision.models import mobilenet_v3_small
from PIL import Image
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix

sys.path.insert(0, os.path.dirname(__file__))

def get_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()

class EvalDataset(Dataset):
    def __init__(self, records, transform=None):
        self.records = records
        self.transform = transform

    def __len__(self):
        return len(self.records)

    def __getitem__(self, idx):
        rec = self.records[idx]
        with Image.open(rec["path"]) as img:
            img = img.convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, torch.tensor(rec["label_idx"], dtype=torch.long), idx

def get_eval_transforms():
    return transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

def build_model(checkpoint_path, num_classes=7):
    model = mobilenet_v3_small(weights=None)
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Linear(in_features, num_classes)
    ckpt = torch.load(checkpoint_path, map_location="cpu")
    state_dict = ckpt["state_dict"] if "state_dict" in ckpt else (ckpt["model_state_dict"] if "model_state_dict" in ckpt else ckpt)
    model.load_state_dict(state_dict)
    return model, ckpt

@torch.no_grad()
def run_evaluation():
    base_prefix = "ai-service/" if os.path.exists("ai-service/data/manifests") else ""
    ckpt_rel_path = "training/experiments/exp_d_full_multidomain/best_model.pt"
    ckpt_path = os.path.join(base_prefix, ckpt_rel_path)
    out_dir = os.path.join(base_prefix, "training/experiments/exp_d_full_multidomain/final_evaluation")
    os.makedirs(out_dir, exist_ok=True)

    print("=" * 80)
    print("PHASE 4B.5: LOCKED FINAL EVALUATION OF SELECTED EXP D CHECKPOINT")
    print("=" * 80)

    # 1. Checkpoint Identity & Verification
    file_size = os.path.getsize(ckpt_path)
    sha256_hash = get_sha256(ckpt_path)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, ckpt_data = build_model(ckpt_path, num_classes=7)
    model = model.to(device)
    model.eval()

    epoch = ckpt_data.get("epoch", 8)
    class_mapping = ckpt_data.get("class_mapping", {
        "background": 0,
        "potato_early_blight": 1,
        "potato_healthy": 2,
        "potato_late_blight": 3,
        "tomato_early_blight": 4,
        "tomato_healthy": 5,
        "tomato_late_blight": 6
    })
    index_to_class = {v: k for k, v in class_mapping.items()}
    class_names_7 = [index_to_class[i] for i in range(7)]

    print("\n[Step 1: Checkpoint Lock & Identity]")
    print(f"  Checkpoint Path:      {ckpt_path}")
    print(f"  File Size:            {file_size} bytes ({file_size / (1024*1024):.2f} MB)")
    print(f"  SHA256 Checksum:      {sha256_hash}")
    print(f"  Architecture:         MobileNetV3-Small (7 classes)")
    print(f"  Selected Epoch:       {epoch}")
    print(f"  Class Mapping:        {class_mapping}")
    print(f"  Device:               {device}")

    eval_transform = get_eval_transforms()

    def resolve_path(p):
        return p if os.path.exists(p) else os.path.join(base_prefix, p)

    # -------------------------------------------------------------
    # 2. FINAL TEST 1: FROZEN CONTROLLED TEST (1,101 images)
    # -------------------------------------------------------------
    print("\n[Step 2: Evaluating Frozen Controlled Test (n=1,101)]")
    pv_df = pd.read_csv(os.path.join(base_prefix, "data/manifests/dataset_manifest.csv"))
    coco_df = pd.read_csv(os.path.join(base_prefix, "data/manifests/background_manifest.csv"))
    pv_test = pv_df[pv_df["split"] == "test"].copy()
    coco_test = coco_df[coco_df["split"] == "test"].copy()

    ctrl_records = []
    for _, r in pv_test.iterrows():
        ctrl_records.append({
            "path": resolve_path(r["original_path"]),
            "canonical_class": r["canonical_class"],
            "label_idx": class_mapping[r["canonical_class"]],
            "source": "PlantVillage"
        })
    for _, r in coco_test.iterrows():
        ctrl_records.append({
            "path": resolve_path(r["original_path"]),
            "canonical_class": "background",
            "label_idx": class_mapping["background"],
            "source": "COCO"
        })

    assert len(ctrl_records) == 1101, f"Expected 1101 controlled test samples, got {len(ctrl_records)}"
    ctrl_loader = DataLoader(EvalDataset(ctrl_records, transform=eval_transform), batch_size=32, shuffle=False)

    all_preds = []
    all_targets = []
    all_probs = []

    for images, targets, _ in ctrl_loader:
        images = images.to(device)
        logits = model(images)
        probs = torch.softmax(logits, dim=1)
        preds = torch.argmax(probs, dim=1)
        all_preds.extend(preds.cpu().numpy().tolist())
        all_targets.extend(targets.numpy().tolist())
        all_probs.extend(probs.cpu().numpy().tolist())

    acc = float(accuracy_score(all_targets, all_preds))
    p_macro, r_macro, f1_macro, _ = precision_recall_fscore_support(all_targets, all_preds, average="macro", zero_division=0)
    p_wt, r_wt, f1_wt, _ = precision_recall_fscore_support(all_targets, all_preds, average="weighted", zero_division=0)
    p_cls, r_cls, f1_cls, s_cls = precision_recall_fscore_support(all_targets, all_preds, labels=range(7), zero_division=0)

    cm_ctrl = confusion_matrix(all_targets, all_preds, labels=range(7))
    df_cm_ctrl = pd.DataFrame(cm_ctrl, index=class_names_7, columns=class_names_7)
    df_cm_ctrl.to_csv(os.path.join(out_dir, "controlled_test_confusion_matrix.csv"))

    per_class_ctrl = {}
    for idx in range(7):
        cname = index_to_class[idx]
        per_class_ctrl[cname] = {
            "index": idx,
            "precision": round(float(p_cls[idx]), 4),
            "recall": round(float(r_cls[idx]), 4),
            "f1_score": round(float(f1_cls[idx]), 4),
            "support": int(s_cls[idx]),
            "correct": int(cm_ctrl[idx, idx])
        }

    p3_baseline_ctrl = {
        "accuracy": 0.9846,
        "macro_f1": 0.9821,
        "weighted_f1": 0.9846
    }
    ctrl_metrics = {
        "total_samples": len(ctrl_records),
        "accuracy": round(acc, 4),
        "macro_precision": round(float(p_macro), 4),
        "macro_recall": round(float(r_macro), 4),
        "macro_f1": round(float(f1_macro), 4),
        "weighted_f1": round(float(f1_wt), 4),
        "per_class": per_class_ctrl,
        "phase3_comparison": {
            "phase3_accuracy": p3_baseline_ctrl["accuracy"],
            "phase3_macro_f1": p3_baseline_ctrl["macro_f1"],
            "phase3_weighted_f1": p3_baseline_ctrl["weighted_f1"],
            "delta_accuracy": round(acc - p3_baseline_ctrl["accuracy"], 4),
            "delta_macro_f1": round(float(f1_macro) - p3_baseline_ctrl["macro_f1"], 4),
            "delta_weighted_f1": round(float(f1_wt) - p3_baseline_ctrl["weighted_f1"], 4)
        }
    }

    with open(os.path.join(out_dir, "controlled_test_metrics.json"), "w") as f:
        json.dump(ctrl_metrics, f, indent=2)

    print(f"  Controlled Test Accuracy:    {acc:.4f} (Phase 3: 0.9846 | Delta: {acc - 0.9846:+.4f})")
    print(f"  Controlled Test Macro F1:    {f1_macro:.4f} (Phase 3: 0.9821 | Delta: {f1_macro - 0.9821:+.4f})")
    print(f"  Controlled Test Weighted F1: {f1_wt:.4f} (Phase 3: 0.9846 | Delta: {f1_wt - 0.9846:+.4f})")

    # -------------------------------------------------------------
    # 3. FINAL TEST 2: PLANTDOC ORIGINAL TEST HOLDOUT (38 images)
    # -------------------------------------------------------------
    print("\n[Step 3: Evaluating PlantDoc Original Test Holdout (n=38)]")
    pd_holdout_df = pd.read_csv(os.path.join(base_prefix, "data/manifests/plantdoc_test_holdout.csv"))
    assert len(pd_holdout_df) == 38, f"Expected 38 holdout samples, got {len(pd_holdout_df)}"

    pd_records = []
    for _, r in pd_holdout_df.iterrows():
        pd_records.append({
            "path": resolve_path(r["original_path"]),
            "canonical_class": r["canonical_class"],
            "label_idx": class_mapping[r["canonical_class"]]
        })

    pd_loader = DataLoader(EvalDataset(pd_records, transform=eval_transform), batch_size=32, shuffle=False)

    pd_preds = []
    pd_targets = []
    pd_probs = []

    for images, targets, _ in pd_loader:
        images = images.to(device)
        logits = model(images)
        probs = torch.softmax(logits, dim=1)
        preds = torch.argmax(probs, dim=1)
        pd_preds.extend(preds.cpu().numpy().tolist())
        pd_targets.extend(targets.numpy().tolist())
        pd_probs.extend(probs.cpu().numpy().tolist())

    pd_acc = float(accuracy_score(pd_targets, pd_preds))
    # 7-class macro
    pd_p_macro, pd_r_macro, pd_f1_macro, _ = precision_recall_fscore_support(pd_targets, pd_preds, average="macro", zero_division=0)
    pd_p_wt, pd_r_wt, pd_f1_wt, _ = precision_recall_fscore_support(pd_targets, pd_preds, average="weighted", zero_division=0)
    pd_p_cls, pd_r_cls, pd_f1_cls, pd_s_cls = precision_recall_fscore_support(pd_targets, pd_preds, labels=range(7), zero_division=0)

    # Active classes only macro (5 classes present in holdout)
    active_mask = pd_s_cls > 0
    pd_active_p_macro = float(np.mean(pd_p_cls[active_mask]))
    pd_active_r_macro = float(np.mean(pd_r_cls[active_mask]))
    pd_active_f1_macro = float(np.mean(pd_f1_cls[active_mask]))

    cm_pd = confusion_matrix(pd_targets, pd_preds, labels=range(7))
    df_cm_pd = pd.DataFrame(cm_pd, index=class_names_7, columns=class_names_7)
    df_cm_pd.to_csv(os.path.join(out_dir, "plantdoc_holdout_confusion_matrix.csv"))

    # False background count: true class != background (all 38 are crops), pred == background
    false_bg_count = sum(1 for p in pd_preds if p == 0)
    # Count predicted tomato_late_blight (idx 6)
    pred_tlb_count = sum(1 for p in pd_preds if p == 6)

    per_class_pd = {}
    for idx in range(7):
        cname = index_to_class[idx]
        per_class_pd[cname] = {
            "index": idx,
            "precision": round(float(pd_p_cls[idx]), 4),
            "recall": round(float(pd_r_cls[idx]), 4),
            "f1_score": round(float(pd_f1_cls[idx]), 4),
            "support": int(pd_s_cls[idx]),
            "correct": int(cm_pd[idx, idx])
        }

    # Save detailed predictions CSV
    df_pd_preds = pd.DataFrame({
        "image_path": [r["path"] for r in pd_records],
        "true_class": [r["canonical_class"] for r in pd_records],
        "true_idx": pd_targets,
        "predicted_class": [index_to_class[p] for p in pd_preds],
        "predicted_idx": pd_preds,
        "confidence": [round(float(probs[p]), 4) for probs, p in zip(pd_probs, pd_preds)],
        "is_correct": [t == p for t, p in zip(pd_targets, pd_preds)]
    })
    df_pd_preds.to_csv(os.path.join(out_dir, "plantdoc_holdout_predictions.csv"), index=False)

    pd_metrics = {
        "disclaimer": "SMALL FIELD HOLDOUT INDICATOR (n=38). Not a definitive real-world accuracy estimate. Do not extrapolate to all farms/crops.",
        "total_samples": len(pd_records),
        "accuracy": round(pd_acc, 4),
        "macro_precision_7class": round(float(pd_p_macro), 4),
        "macro_recall_7class": round(float(pd_r_macro), 4),
        "macro_f1_7class": round(float(pd_f1_macro), 4),
        "macro_precision_active_5class": round(pd_active_p_macro, 4),
        "macro_recall_active_5class": round(pd_active_r_macro, 4),
        "macro_f1_active_5class": round(pd_active_f1_macro, 4),
        "weighted_f1": round(float(pd_f1_wt), 4),
        "false_background_count": false_bg_count,
        "predicted_tomato_late_blight_count": pred_tlb_count,
        "per_class": per_class_pd
    }

    with open(os.path.join(out_dir, "plantdoc_holdout_metrics.json"), "w") as f:
        json.dump(pd_metrics, f, indent=2)

    print(f"  PlantDoc Holdout Accuracy:            {pd_acc:.4f} ({sum(df_pd_preds['is_correct'])}/38)")
    print(f"  PlantDoc Holdout 7-Class Macro F1:    {pd_f1_macro:.4f}")
    print(f"  PlantDoc Holdout 5-Active Macro F1:   {pd_active_f1_macro:.4f}")
    print(f"  PlantDoc Holdout Weighted F1:         {pd_f1_wt:.4f}")
    print(f"  False Background Rejections:          {false_bg_count}/38 ({false_bg_count/38*100:.1f}%)")
    print(f"  Predicted tomato_late_blight:         {pred_tlb_count}/38")

    # -------------------------------------------------------------
    # 4. FINAL TEST 3: AGRICULTURAL NEGATIVE DIAGNOSTIC TEST (64 images)
    # -------------------------------------------------------------
    print("\n[Step 4: Evaluating Agricultural Negative Diagnostic Test (n=64)]")
    ag_test_df = pd.read_csv(os.path.join(base_prefix, "data/manifests/ag_background_test_manifest.csv"))
    assert len(ag_test_df) == 64, f"Expected 64 ag test samples, got {len(ag_test_df)}"

    ag_records = []
    for _, r in ag_test_df.iterrows():
        ag_records.append({
            "path": resolve_path(r["original_path"]),
            "canonical_class": "background",
            "label_idx": class_mapping["background"],
            "category": r.get("category", "unknown"),
            "species": r.get("species", "unknown")
        })

    ag_loader = DataLoader(EvalDataset(ag_records, transform=eval_transform), batch_size=32, shuffle=False)

    ag_preds = []
    ag_targets = []
    ag_probs = []

    for images, targets, _ in ag_loader:
        images = images.to(device)
        logits = model(images)
        probs = torch.softmax(logits, dim=1)
        preds = torch.argmax(probs, dim=1)
        ag_preds.extend(preds.cpu().numpy().tolist())
        ag_targets.extend(targets.numpy().tolist())
        ag_probs.extend(probs.cpu().numpy().tolist())

    correct_bg = sum(1 for p in ag_preds if p == 0)
    rej_acc = correct_bg / len(ag_records)
    false_crop_count = len(ag_records) - correct_bg

    failed_pred_classes = {}
    for p in ag_preds:
        if p != 0:
            cname = index_to_class[p]
            failed_pred_classes[cname] = failed_pred_classes.get(cname, 0) + 1

    # Category breakdown
    cat_breakdown = {}
    for i, r in enumerate(ag_records):
        cat = r["category"]
        if cat not in cat_breakdown:
            cat_breakdown[cat] = {
                "total": 0,
                "correct_bg": 0,
                "false_crops": 0,
                "false_crop_predictions": {}
            }
        cat_breakdown[cat]["total"] += 1
        p = ag_preds[i]
        if p == 0:
            cat_breakdown[cat]["correct_bg"] += 1
        else:
            cat_breakdown[cat]["false_crops"] += 1
            cname = index_to_class[p]
            cat_breakdown[cat]["false_crop_predictions"][cname] = cat_breakdown[cat]["false_crop_predictions"].get(cname, 0) + 1

    for cat, stats in cat_breakdown.items():
        stats["rejection_accuracy"] = round(stats["correct_bg"] / stats["total"], 4)

    # Save detailed predictions CSV
    df_ag_preds = pd.DataFrame({
        "image_path": [r["path"] for r in ag_records],
        "category": [r["category"] for r in ag_records],
        "species": [r["species"] for r in ag_records],
        "predicted_class": [index_to_class[p] for p in ag_preds],
        "predicted_idx": ag_preds,
        "confidence": [round(float(probs[p]), 4) for probs, p in zip(ag_probs, ag_preds)],
        "is_correct_background": [p == 0 for p in ag_preds]
    })
    df_ag_preds.to_csv(os.path.join(out_dir, "ag_diagnostic_predictions.csv"), index=False)

    ag_metrics = {
        "total_samples": len(ag_records),
        "correct_background": correct_bg,
        "rejection_accuracy": round(rej_acc, 4),
        "false_crop_count": false_crop_count,
        "false_crop_rate": round(false_crop_count / len(ag_records), 4),
        "false_crop_predicted_distribution": failed_pred_classes,
        "category_breakdown": cat_breakdown
    }

    with open(os.path.join(out_dir, "ag_diagnostic_test_metrics.json"), "w") as f:
        json.dump(ag_metrics, f, indent=2)

    print(f"  Ag Test Rejection Accuracy:    {rej_acc*100:.2f}% ({correct_bg}/64)")
    print(f"  False Crop Diagnosis Count:    {false_crop_count}/64")
    print(f"  False Predictions Distribution: {failed_pred_classes}")
    for cat, stats in cat_breakdown.items():
        print(f"    - {cat:<20}: {stats['correct_bg']}/{stats['total']} ({stats['rejection_accuracy']*100:.1f}%)")

    # -------------------------------------------------------------
    # 5. SUMMARY AND COMPARISONS
    # -------------------------------------------------------------
    summary = {
        "checkpoint": {
            "path": ckpt_path,
            "epoch": epoch,
            "sha256": sha256_hash,
            "size_bytes": file_size,
            "architecture": "MobileNetV3-Small"
        },
        "selection_validation_metrics": {
            "controlled_val_macro_f1": 0.9786,
            "field_val_macro_f1": 0.3608,
            "ag_val_rejection": "61/65 (93.85%)"
        },
        "authoritative_validation_history": {
            "Phase_3": {"controlled_val_f1": 0.9783, "field_val_f1": 0.1118, "ag_val_rejection": "47/65 (72.31%)"},
            "Exp_A": {"controlled_val_f1": 0.9827, "field_val_f1": 0.1374, "ag_val_rejection": "45/65 (69.23%)"},
            "Exp_B": {"controlled_val_f1": 0.9702, "field_val_f1": 0.3726, "ag_val_rejection": "11/65 (16.92%)"},
            "Exp_C": {"controlled_val_f1": 0.9788, "field_val_f1": 0.1183, "ag_val_rejection": "64/65 (98.46%)"},
            "Exp_D": {"controlled_val_f1": 0.9786, "field_val_f1": 0.3608, "ag_val_rejection": "61/65 (93.85%)"}
        },
        "final_test_results": {
            "controlled_test_1101": {
                "accuracy": ctrl_metrics["accuracy"],
                "macro_f1": ctrl_metrics["macro_f1"],
                "weighted_f1": ctrl_metrics["weighted_f1"],
                "delta_vs_phase3_acc": ctrl_metrics["phase3_comparison"]["delta_accuracy"],
                "delta_vs_phase3_f1": ctrl_metrics["phase3_comparison"]["delta_macro_f1"]
            },
            "plantdoc_holdout_38": {
                "accuracy": pd_metrics["accuracy"],
                "macro_f1_7class": pd_metrics["macro_f1_7class"],
                "macro_f1_active_5class": pd_metrics["macro_f1_active_5class"],
                "weighted_f1": pd_metrics["weighted_f1"],
                "false_background_count": pd_metrics["false_background_count"],
                "predicted_tomato_late_blight_count": pd_metrics["predicted_tomato_late_blight_count"]
            },
            "ag_diagnostic_test_64": {
                "rejection_accuracy": ag_metrics["rejection_accuracy"],
                "correct_background": ag_metrics["correct_background"],
                "false_crop_count": ag_metrics["false_crop_count"],
                "category_breakdown": {k: v["rejection_accuracy"] for k, v in cat_breakdown.items()}
            }
        },
        "validation_vs_test_generalization": {
            "field_crops": {
                "validation_adapt_81_macro_f1": 0.3608,
                "validation_adapt_81_accuracy": 0.4938,
                "test_holdout_38_macro_f1_7class": pd_metrics["macro_f1_7class"],
                "test_holdout_38_macro_f1_active": pd_metrics["macro_f1_active_5class"],
                "test_holdout_38_accuracy": pd_metrics["accuracy"]
            },
            "ag_negatives": {
                "validation_65_rejection_rate": 0.9385,
                "test_64_rejection_rate": ag_metrics["rejection_accuracy"]
            }
        }
    }

    with open(os.path.join(out_dir, "final_evaluation_summary.json"), "w") as f:
        json.dump(summary, f, indent=2)

    print("\n[Step 5: Final Evaluation Complete - Artifacts Saved Successfully]")

if __name__ == "__main__":
    run_evaluation()
