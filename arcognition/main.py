"""Command line interface for the Arcognition pipeline."""

from __future__ import annotations

import argparse
import logging
from typing import List

logging.basicConfig(level=logging.INFO, format='[Arcognition] %(message)s')
logger = logging.getLogger(__name__)

from arcognition.detectors import FurnitureDetector
from arcognition.cropper import Cropper
from arcognition.search import ReverseSearch
from arcognition.scraper import ProductScraper
from arcognition.export import ExcelExporter


def process_image(image_path: str) -> str:
    """Run full pipeline on the given image."""
    logger.info("Processing image %s", image_path)
    detector = FurnitureDetector()
    cropper = Cropper()
    searcher = ReverseSearch()
    scraper = ProductScraper()
    exporter = ExcelExporter()

    detections = detector.detect(image_path)
    logger.info("%d detections found", len(detections))
    rows: List[dict] = []

    for idx, det in enumerate(detections):
        bbox = det.get("bbox")
        name = det.get("name", f"item_{idx}")
        if not bbox:
            continue
        logger.info("Cropping %s at %s", name, bbox)
        cropped_path = cropper.crop(image_path, bbox, name, idx)
        logger.info("Cropped image saved to %s", cropped_path)
        items = searcher.search(cropped_path)
        logger.info("Reverse search returned %d items", len(items))
        for item in items:
            link = item.get("url")
            try:
                data = scraper.scrape(link)
                if data:
                    rows.append(data)
            except Exception as exc:  # pylint: disable=broad-except
                logger.exception("Failed to scrape %s: %s", link, exc)

    logger.info("Exporting %d rows", len(rows))
    output_file = exporter.export(rows)
    return output_file


def main() -> None:
    parser = argparse.ArgumentParser(description="Process a room image")
    parser.add_argument("image", help="Path to input image")
    args = parser.parse_args()

    try:
        output = process_image(args.image)
        logger.info("Report saved to %s", output)
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Processing failed: %s", exc)


if __name__ == "__main__":
    main()
