import os
import sys
import json
import base64
import time
import urllib.request
import urllib.error
from PIL import Image

API_KEY = os.environ.get("LISTENHUB_API_KEY")
if not API_KEY:
    print("Error: LISTENHUB_API_KEY not found in environment")
    sys.exit(1)

BASE_URL = "https://api.marswave.ai/openapi/v1/images/generation"

def encode_image(filepath):
    with open(filepath, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def generate_image(prompt, ref_image_path, output_path, aspect_ratio="3:4"):
    print(f"\n[Start] Generating: {output_path} (Aspect: {aspect_ratio})...")
    ref_b64 = encode_image(ref_image_path)
    
    payload = {
        "provider": "google",
        "model": "gemini-3-pro-image-preview",
        "prompt": prompt,
        "imageConfig": {
            "imageSize": "2K",
            "aspectRatio": aspect_ratio
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
            
            # 优化为高质量 JPEG
            im = Image.open(output_path).convert('RGB')
            im.save(output_path, 'JPEG', quality=90, optimize=True)
            print(f"[Success] Saved and optimized image to {output_path} ({os.path.getsize(output_path)//1024} KB)")
            return True
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    prompt = (
        "Clean modern flat 2D vector line-art illustration, minimalist medical rehabilitation and fitness guide style, "
        "strictly matching the art style, line thickness, and character design of the reference image. "
        "A young Asian male with short dark hair, wearing a casual grey crew-neck t-shirt, dark pants, and sneakers. "
        "TWO-PHASE SEQUENCE ACTION ILLUSTRATION FOR JUMPING JACKS (开合跳两段式动作说明): "
        "Showing two figures side-by-side on the same clean off-white background demonstrating the complete movement cycle: "
        "Left figure (Phase 1 / Starting position): Standing upright at attention, feet together, arms straight down naturally by the sides. "
        "Right figure (Phase 2 / Open jumping position): In mid-air/landing position with legs jumped wide apart (wider than shoulders), knees slightly springy, "
        "both arms swung upwards and outwards to form an overhead high clap above head. "
        "Between the two figures are sleek, elegant curved bidirectional dashed arrows indicating the dynamic jumping rhythm back and forth. "
        "Crisp clean vector outlines, soft subtle flat shading, minimal color palette, pure off-white background."
    )
    ref = "/Users/longhai/Projects/居家办公插件/public/actions/01_举手翻掌.jpg"
    out = "/Users/longhai/Projects/居家办公插件/public/actions/16_活力开合跳.jpg"
    ok = generate_image(prompt, ref, out, aspect_ratio="3:4")
    print("Done:", ok)
