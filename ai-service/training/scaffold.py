import os

dirs = [
    "data/raw/plantvillage",
    "data/raw/plantdoc",
    "data/raw/background",
    "data/processed",
    "data/manifests",
]

for d in dirs:
    os.makedirs(d, exist_ok=True)

print("Directories created successfully.")
