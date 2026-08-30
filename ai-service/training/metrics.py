import numpy as np
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix

def compute_classification_metrics(y_true, y_pred, index_to_class=None, active_classes_only=False):
    """
    Computes standard evaluation metrics for classification.
    
    Args:
        y_true (list or np.ndarray): Ground truth labels (integer indices).
        y_pred (list or np.ndarray): Predicted labels (integer indices).
        index_to_class (dict, optional): Mapping from class index to class name.
        active_classes_only (bool): If True (e.g. for PlantDoc field test), averages macro metrics 
                                   only over classes that actually have non-zero ground-truth support.
    
    Returns:
        dict: Summary containing accuracy, macro precision/recall/F1, weighted F1, per-class metrics, and confusion matrix.
    """
    y_true = np.array(y_true)
    y_pred = np.array(y_pred)
    
    # 1. Global Accuracy
    accuracy = float(accuracy_score(y_true, y_pred))
    
    # 2. Per-Class Precision, Recall, F1, Support
    num_classes = len(index_to_class) if index_to_class is not None else int(max(np.max(y_true), np.max(y_pred)) + 1)
    labels = list(range(num_classes))
    
    p, r, f1, sup = precision_recall_fscore_support(
        y_true, y_pred, labels=labels, zero_division=0
    )
    
    per_class = {}
    for idx in range(num_classes):
        cls_name = index_to_class[idx] if index_to_class and idx in index_to_class else str(idx)
        per_class[cls_name] = {
            "index": idx,
            "precision": float(p[idx]),
            "recall": float(r[idx]),
            "f1_score": float(f1[idx]),
            "support": int(sup[idx])
        }
        
    # 3. Macro and Weighted Averages
    if active_classes_only:
        active_mask = sup > 0
        if np.any(active_mask):
            macro_precision = float(np.mean(p[active_mask]))
            macro_recall = float(np.mean(r[active_mask]))
            macro_f1 = float(np.mean(f1[active_mask]))
        else:
            macro_precision, macro_recall, macro_f1 = 0.0, 0.0, 0.0
    else:
        macro_precision = float(np.mean(p))
        macro_recall = float(np.mean(r))
        macro_f1 = float(np.mean(f1))
        
    weighted_p, weighted_r, weighted_f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average="weighted", zero_division=0
    )
    
    # 4. Confusion Matrix
    cm = confusion_matrix(y_true, y_pred, labels=labels).tolist()
    
    return {
        "accuracy": round(accuracy, 4),
        "macro_precision": round(macro_precision, 4),
        "macro_recall": round(macro_recall, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_f1": round(float(weighted_f1), 4),
        "per_class": per_class,
        "confusion_matrix": cm,
        "total_samples": len(y_true)
    }
