import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1]
import sys
import json
import base64
import time
import shutil
import urllib.request
import urllib.error

API_KEY = os.environ.get("LISTENHUB_API_KEY")
if not API_KEY:
    print("Error: LISTENHUB_API_KEY not found in environment")
    sys.exit(1)

BASE_URL = "https://api.marswave.ai/openapi/v1/images/generation"

def encode_image(filepath):
    with open(filepath, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def generate_image(prompt, ref_image_path, output_path):
    print(f"\n[Start] Generating: {output_path}...")
    ref_b64 = encode_image(ref_image_path)
    
    payload = {
        "provider": "google",
        "model": "gemini-3-pro-image-preview",
        "prompt": prompt,
        "imageConfig": {
            "imageSize": "2K",
            "aspectRatio": "3:4"
        },
        "referenceImages": [
            {
                "inlineData": {
                    "data": ref_b64,
                    "mimeType": "image/jpeg"
                }
            }
        ]
    }
    
    req = urllib.request.Request(
        BASE_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
            "X-Source": "skills"
        },
        method="POST"
    )
    
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                b64_data = None
                if "candidates" in data and len(data["candidates"]) > 0:
                    parts = data["candidates"][0].get("content", {}).get("parts", [])
                    if parts and "inlineData" in parts[0]:
                        b64_data = parts[0]["inlineData"]["data"]
                if not b64_data and "data" in data:
                    b64_data = data["data"]
                    
                if not b64_data:
                    print("Failed to find image data in response:", data)
                    return False
                    
                img_bytes = base64.b64decode(b64_data)
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                with open(output_path, "wb") as out_f:
                    out_f.write(img_bytes)
                print(f"[Success] Saved image to {output_path}")
                return True
        except urllib.error.HTTPError as e:
            print(f"HTTP Error {e.code} on attempt {attempt+1}: {e.read().decode('utf-8')}")
            if e.code == 429:
                time.sleep(15)
                continue
            return False
        except Exception as e:
            print(f"Error on attempt {attempt+1}: {e}")
            time.sleep(5)
    return False

tasks = [
    {
        "id": "02",
        "name": "wrong_02_双手暴力抱头下按.jpg",
        "prompt": (
            "Clean modern flat 2D vector line-art illustration, minimalist medical rehabilitation style, "
            "strictly matching the art style and character design of the reference image. "
            "A young Asian male office worker with short dark hair, wearing a casual grey crew-neck t-shirt and dark pants, "
            "seated on an ergonomic office chair. "
            "DANGEROUS MISTAKE POSTURE DEMONSTRATION: Interlaced hands pulling and forcing head downwards violently (双手暴力抱头下按). "
            "Both hands are clasped behind the back of the head, with elbows pulled in, exerting strong, aggressive downward force on the head, "
            "forcing the cervical spine into extreme unnatural forward flexion, chin brutally crushed against upper chest. "
            "Downwards straight arrows indicating aggressive manual force applied to head. "
            "A glaring red-orange stress warning glow on the back of the cervical spine showing dangerous disc posterior tension and nerve impingement risk. "
            "A prominent bold red cross 'X' symbol clearly visible in the upper corner indicating forbidden dangerous error. "
            "Crisp clean vector lines, soft minimal flat shading, clean off-white background."
        ),
        "ref": str(APP_DIR / "public/actions/07_托后脑低头.jpg")
    },
    {
        "id": "03",
        "name": "wrong_03_无支撑悬空极度仰头.jpg",
        "prompt": (
            "Clean modern flat 2D vector line-art illustration, minimalist medical rehabilitation style, "
            "strictly matching the art style and character design of the reference image. "
            "A young Asian male office worker with short dark hair, wearing a casual grey crew-neck t-shirt and dark pants, "
            "seated upright on an ergonomic office chair with hands resting on his thighs (no hands or back support for neck). "
            "DANGEROUS MISTAKE POSTURE DEMONSTRATION: Unsupported extreme neck hyperextension (无支撑悬空极度仰头). "
            "His head is violently bent completely backwards, dangling freely in mid-air with neck severely arched back. "
            "The posterior neck muscles are visibly clamped and severely pinched. "
            "A prominent red-orange warning glow is concentrated at the base of the skull / upper neck (occipital nerve compression). "
            "A prominent bold red cross 'X' symbol clearly visible in the upper corner indicating forbidden dangerous error. "
            "Crisp clean vector lines, soft minimal flat shading, clean off-white background."
        ),
        "ref": str(APP_DIR / "public/actions/07_托后脑低头.jpg")
    },
    {
        "id": "04",
        "name": "wrong_04_站立直腿猛烈压腿压腰.jpg",
        "prompt": (
            "Clean modern flat 2D vector line-art illustration, minimalist medical rehabilitation style, "
            "strictly matching the art style and character design of the reference image. "
            "A young Asian male office worker with short dark hair, wearing a casual grey crew-neck t-shirt and dark pants, standing. "
            "DANGEROUS MISTAKE POSTURE DEMONSTRATION: Standing straight-leg ballistic bouncing forward bend (站立直腿猛烈震颤压腿压腰). "
            "He is standing with legs locked completely straight, upper body suspended in mid-air aggressively bending forward at the waist trying to touch toes with hands unsupported. "
            "Double-ended bouncing motion dashed arrows indicating violent ballistic bouncing and jerking movement. "
            "A fiery red-orange warning stress glow and lightning shear lines on the lower lumbar spine (L4-L5 lumbar disc strain) showing extreme shear force danger. "
            "A prominent bold red cross 'X' symbol clearly visible in the upper corner indicating forbidden dangerous error. "
            "Crisp clean vector lines, soft minimal flat shading, clean off-white background."
        ),
        "ref": str(APP_DIR / "public/actions/09_扶腰后伸.jpg")
    }
]

if __name__ == "__main__":
    out_dir = str(APP_DIR / "public/actions")
    
    # 01 复制测试图
    test_01 = os.path.join(out_dir, "test_wrong_01.jpg")
    target_01 = os.path.join(out_dir, "wrong_01_颈部大回环.jpg")
    if os.path.exists(test_01) and not os.path.exists(target_01):
        shutil.copy2(test_01, target_01)
        print(f"Copied {test_01} to {target_01}")
        
    for t in tasks:
        target_path = os.path.join(out_dir, t["name"])
        ok = generate_image(t["prompt"], t["ref"], target_path)
        if not ok:
            print(f"Failed to generate {t['name']}")
        time.sleep(3)
