"""Furniture detection using the hosted Supabase function."""

from __future__ import annotations

import base64
from typing import List, Dict

import cv2
import requests


class FurnitureDetector:
    """Detect furniture items in an image using Supabase Edge Functions."""

    DETECT_ENDPOINT = (
        "https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1/detect"
    )

    def __init__(self, endpoint: str | None = None) -> None:
        self.endpoint = endpoint or self.DETECT_ENDPOINT

    def _encode_image(self, image_path: str) -> str:
        """Read and base64 encode an image file."""
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode()

    def detect(self, image_path: str) -> List[Dict]:
        """Return detected furniture items with bounding boxes."""
        img = cv2.imread(image_path)
        if img is None:
            raise FileNotFoundError(f"Image not found: {image_path}")

        content = self._encode_image(image_path)
        response = requests.post(
            self.endpoint,
            json={"base64": content},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        if not data.get("ok"):
            detail = data.get("detail", "unknown error")
            raise RuntimeError(f"Detection failed: {detail}")

        annotations = data.get("annotations", [])

        results: List[Dict] = []
        if annotations:
            img = cv2.imread(image_path)
            height, width = img.shape[:2]
            for ann in annotations:
                vertices = (
                    ann.get("boundingPoly", {}).get("normalizedVertices") or []
                )
                if not vertices:
                    continue
                xs = [v.get("x", 0.0) for v in vertices]
                ys = [v.get("y", 0.0) for v in vertices]
                x_min, y_min = max(min(xs), 0.0), max(min(ys), 0.0)
                x_max, y_max = min(max(xs), 1.0), min(max(ys), 1.0)
                bbox = {
                    "x": int(x_min * width),
                    "y": int(y_min * height),
                    "w": int((x_max - x_min) * width),
                    "h": int((y_max - y_min) * height),
                }
                results.append({"name": ann.get("name", "unknown"), "bbox": bbox})
        return results
