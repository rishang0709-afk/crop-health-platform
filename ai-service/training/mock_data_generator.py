import os
import random
from PIL import Image

def create_image(path, color, size=(224, 224)):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img = Image.new('RGB', size, color=color)
    img.save(path)

# Mappings mapped to realistic names
# We will create a small number of images per class.
# Some will be exact duplicates, some near duplicates.

DATA = {
    "plantvillage": {
        "Tomato___healthy": 20,
        "Tomato___Early_blight": 15,
        "Tomato___Late_blight": 25,
        "Potato___healthy": 5,
        "Potato___Early_blight": 10,
        "Potato___Late_blight": 10,
        "Apple___Apple_scab": 5, # Should be ignored by filter
    },
    "plantdoc": {
        "Tomato leaf": 10,
        "Tomato Early blight leaf": 8,
        "Tomato leaf late blight": 12,
        "Potato leaf": 3,
        "Potato leaf early blight": 6,
        "Potato leaf late blight": 7,
    },
    "background": {
        "coco_negatives": 30
    }
}

base_dir = "data/raw"
os.makedirs(base_dir, exist_ok=True)

for source, classes in DATA.items():
    for cls, count in classes.items():
        cls_dir = os.path.join(base_dir, source, cls)
        for i in range(count):
            img_path = os.path.join(cls_dir, f"img_{i}.jpg")
            
            # Make color vary slightly for near duplicates
            base_color = (
                (hash(cls) % 256), 
                (hash(cls + "g") % 256), 
                (hash(cls + "b") % 256)
            )
            
            # Introduce exact duplicates (i % 5 == 0 will match i % 5 == 1)
            if i > 0 and i % 5 == 1:
                color = base_color
            else:
                color = (base_color[0], base_color[1], min(255, base_color[2] + i))
                
            create_image(img_path, color)

print("Mock raw data generated.")
