import os
import sys
import json
import base64
import urllib.request
import urllib.error
from PIL import Image, ImageDraw

API_KEY = os.environ.get("LISTENHUB_API_KEY")
if not API_KEY:
    print("Error: LISTENHUB_API_KEY not found in environment")
    sys.exit(1)

BASE_URL = "https://api.marswave.ai/openapi/v1/images/generation"

def encode_image(filepath):
    with open(filepath, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def generate_wrong_action_image(prompt, ref_image_path, output_path):
    print(f"Generating: {output_path}...")
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
            print(f"Successfully saved raw image to {output_path}")
            return True
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.read().decode('utf-8')}")
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    prompt_01 = (
        "Clean modern flat 2D vector line-art illustration, minimalist medical rehabilitation style, "
        "strictly matching the art style and character design of the reference image. "
        "A young Asian male office worker with short dark hair, wearing a casual grey crew-neck t-shirt and dark pants, "
        "seated on an ergonomic office chair. "
        "DANGEROUS MISTAKE POSTURE DEMONSTRATION: Neck circular rolling / dramatic head roll (颈部大回环). "
        "His head is violently tilted backward and swirling around in a wide circular loop. "
        "Circular dashed swirl arrows around his neck show rapid uncontrolled rotation. "
        "A red-orange warning stress glow is shown on the cervical spine and vertebral artery indicating extreme compression. "
        "In the top corner or overlaying the posture, there is a prominent, clean red 'X' symbol marking this as an unsafe, forbidden error. "
        "Crisp clean vector lines, soft minimal flat shading, clean off-white background."
    )
    ref_img = "/Users/longhai/Projects/居家办公插件/public/actions/07_托后脑低头.jpg"
    test_out = "/Users/longhai/Projects/居家办公插件/public/actions/test_wrong_01.jpg"
    success = generate_wrong_action_image(prompt_01, ref_img, test_out)
    print("Done:", success)
