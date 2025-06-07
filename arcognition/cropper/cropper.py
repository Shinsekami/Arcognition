"""Image cropping utilities using OpenCV."""

from __future__ import annotations

import os
from typing import Tuple

import cv2


class Cropper:
    """Crop detected items from an image."""

    def __init__(self, output_dir: str = "cropped_items") -> None:
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def crop(self, image_path: str, bbox: dict, name: str, index: int) -> str:
        """Crop region from image and save to file.

        Args:
            image_path: Path to the source image.
            bbox: Bounding box dict with keys x, y, w, h.
            name: Detected item name for file naming.
            index: Index for uniqueness.

        Returns:
            Path to the saved cropped image.
        """
        img = cv2.imread(image_path)
        if img is None:
            raise FileNotFoundError(f"Image not found: {image_path}")
        x, y, w, h = (
            int(bbox.get("x", 0)),
            int(bbox.get("y", 0)),
            int(bbox.get("w", 0)),
            int(bbox.get("h", 0)),
        )
        cropped = img[y : y + h, x : x + w]
        filename = f"{index}_{name.replace(' ', '_')}.jpg"
        out_path = os.path.join(self.output_dir, filename)
        cv2.imwrite(out_path, cropped)
        return out_path
