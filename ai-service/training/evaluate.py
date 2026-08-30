import os
import sys
import json
import argparse
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision.models import mobilenet_v3_small
from tqdm import tqdm

from dataset import CropHealthDataset, get_eval_transforms, load_class_mapping
from metrics import compute_classification_metrics

def load_model_from_checkpoint(checkpoint_path, device):
    """
    Reconstructs model from checkpoint metadata and validates compatibility.
    """
    if not os.path.exists(checkpoint_path):
        raise FileNotFoundError(f"Checkpoint not found at: {checkpoint_path}")
        
    checkpoint = torch.load(checkpoint_path, map_location=device)
    
    # Validate required metadata keys
    required_keys = ["state_dict", "class_mapping", "architecture", "dataset_version"]
    for k in required_keys:
        if k not in checkpoint:
            raise ValueError(f"Corrupt checkpoint! Missing required metadata key: '{k}'")
            
    if checkpoint["architecture"] != "mobilenet_v3_small":
        raise ValueError(f"Incompatible architecture: {checkpoint['architecture']}")
        
    class_mapping = checkpoint["class_mapping"]
    num_classes = len(class_mapping)
    
    # Instantiate architecture
    model = mobilenet_v3_small(weights=None)
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Linear(in_features, num_classes)
    
    model.load_state_dict(checkpoint["state_dict"])
    model.to(device)
    model.eval()
    
    return model, checkpoint

@torch.no_grad()
def run_evaluation(mode="controlled", checkpoint_path="training/checkpoints/best_model.pt", batch_size=32):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Loading checkpoint from: {checkpoint_path}")
    model, checkpoint = load_model_from_checkpoint(checkpoint_path, device)
    
    class_mapping_path = "training/class_mapping.json"
    class_to_index, index_to_class = load_class_mapping(class_mapping_path)
    
    if mode == "controlled":
        manifest_path = "data/manifests/training_manifest.csv"
        dataset = CropHealthDataset(manifest_path, split="test", transform=get_eval_transforms(), class_mapping_path=class_mapping_path)
        active_only = False
        title = "CONTROLLED TEST SPLIT EVALUATION (1,101 Images)"
    elif mode == "field":
        manifest_path = "data/manifests/field_eval_manifest.csv"
        dataset = CropHealthDataset(manifest_path, split=None, transform=get_eval_transforms(), class_mapping_path=class_mapping_path)
        active_only = True
        title = "SCREENED FIELD-DOMAIN EVALUATION (448 Images - PlantDoc)"
    else:
        raise ValueError(f"Invalid mode: '{mode}'. Must be 'controlled' or 'field'.")
        
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    
    print(f"\n{'='*60}\n{title}\n{'='*60}")
    print(f"Evaluating {len(dataset)} images on {device}...")
    
    all_targets = []
    all_preds = []
    
    for images, targets in tqdm(loader, desc=f"Evaluating ({mode})"):
        images = images.to(device)
        outputs = model(images)
        preds = torch.argmax(outputs, dim=1)
        all_preds.extend(preds.cpu().numpy())
        all_targets.extend(targets.numpy())
        
    metrics = compute_classification_metrics(all_targets, all_preds, index_to_class=index_to_class, active_classes_only=active_only)
    
    print("\n--- Summary Metrics ---")
    print(f"Accuracy:        {metrics['accuracy']:.4f}")
    print(f"Macro Precision: {metrics['macro_precision']:.4f}")
    print(f"Macro Recall:    {metrics['macro_recall']:.4f}")
    print(f"Macro F1-Score:  {metrics['macro_f1']:.4f}")
    print(f"Weighted F1:     {metrics['weighted_f1']:.4f}")
    
    print("\n--- Per-Class Metrics ---")
    for cls_name, pcm in metrics["per_class"].items():
        if mode == "field" and pcm["support"] == 0:
            print(f"  {cls_name:20} | Support: {pcm['support']:4d} (ABSENT IN FIELD BENCHMARK)")
        else:
            print(f"  {cls_name:20} | P: {pcm['precision']:.4f} | R: {pcm['recall']:.4f} | F1: {pcm['f1_score']:.4f} | Support: {pcm['support']:4d}")
            
    print("\n--- Confusion Matrix (7x7) ---")
    for row in metrics["confusion_matrix"]:
        print("  " + " ".join(f"{val:4d}" for val in row))
        
    return metrics

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate Crop Health Model")
    parser.add_argument("--mode", type=str, choices=["controlled", "field"], default="controlled", help="Evaluation mode")
    parser.add_argument("--checkpoint", type=str, default="training/checkpoints/best_model.pt", help="Path to checkpoint")
    parser.add_argument("--batch_size", type=int, default=32, help="Batch size")
    
    if len(sys.argv) == 1:
        print("evaluate.py module loaded successfully. Run with '--mode controlled' or '--mode field' to evaluate.")
    else:
        args = parser.parse_args()
        run_evaluation(mode=args.mode, checkpoint_path=args.checkpoint, batch_size=args.batch_size)
