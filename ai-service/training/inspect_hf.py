from datasets import load_dataset
import sys

def main():
    try:
        print("Loading mohanty/PlantVillage (default)...")
        dataset = load_dataset("mohanty/PlantVillage", "default")
        print("\nDataset splits:", dataset.keys())
        
        train_features = dataset['train'].features
        print("\nFeatures:")
        print(train_features)
        
        labels = train_features['label'].names
        print("\nLabels found:")
        for idx, name in enumerate(labels):
            print(f"[{idx}] {name}")
            
    except Exception as e:
        print(f"Error loading dataset: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
