"""Furniture detection using Google Cloud Vision API."""

from __future__ import annotations

import base64
import os
import sys
from typing import List, Dict

import cv2
import requests
from dotenv import load_dotenv

load_dotenv()


class FurnitureDetector:
    """Detect furniture items in an image using Google Vision API."""

    def __init__(self) -> None:
        self.api_key = os.getenv("GOOGLE_VISION_API_KEY")
        if not self.api_key:
            print("❌ GOOGLE_VISION_API_KEY is missing from .env")
            sys.exit(1)
        self.endpoint = (
            f"https://vision.googleapis.com/v1/images:annotate?key={self.api_key}"
        )

    def _encode_image(self, image_path: str) -> str:
        """Read and base64 encode an image file."""
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode()

    def detect(self, image_path: str) -> List[Dict]:
        """Return detected furniture items with bounding boxes."""
        img = cv2.imread(image_path)
        if img is None:
            raise FileNotFoundError(f"Image not found: {image_path}")
        height, width = img.shape[:2]

        content = self._encode_image(image_path)
        payload = {
            "requests": [
                {
                    "image": {"content": content},
                    "features": [{"type": "OBJECT_LOCALIZATION"}],
                }
            ]
        }
        response = requests.post(self.endpoint, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()

        results: List[Dict] = []
        annotations = (
            data.get("responses", [{}])[0].get("localizedObjectAnnotations", [])
        )
        for ann in annotations:
            name = ann.get("name", "unknown").lower()
            vertices = ann.get("boundingPoly", {}).get("normalizedVertices") or []
            if not vertices:
                continue
            xs = [v.get("x", 0.0) for v in vertices]
            ys = [v.get("y", 0.0) for v in vertices]
            x_min, y_min = max(min(xs), 0.0), max(min(ys), 0.0)
            x_max, y_max = min(max(xs), 1.0), min(max(ys), 1.0)
            x = int(x_min * width)
            y = int(y_min * height)
            w = int((x_max - x_min) * width)
            h = int((y_max - y_min) * height)
            results.append({"name": name, "bbox": {"x": x, "y": y, "w": w, "h": h}})
        return results
