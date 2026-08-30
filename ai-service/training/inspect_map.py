import json
import os

d = json.load(open('training/plantvillage_repo/leaf-map.json'))
print("Keys count:", len(d))

# Find some examples for tomato
count = 0
for k, v in d.items():
    if "Tomato___healthy" in str(v):
        print(f"Key: {k}, Value: {v}")
        count += 1
        if count > 5:
            break
