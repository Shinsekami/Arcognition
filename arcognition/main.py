"""Command line interface for the Arcognition pipeline."""

from __future__ import annotations



import argparse
from typing import List

from arcognition.detectors import FurnitureDetector
from arcognition.cropper import Cropper
from arcognition.search import ReverseSearch
from arcognition.scraper import ProductScraper
from arcognition.export import ExcelExporter


def process_image(image_path: str) -> str:
    """Run full pipeline on the given image."""
    detector = FurnitureDetector()
    cropper = Cropper()
    searcher = ReverseSearch()
    scraper = ProductScraper()
    exporter = ExcelExporter()

    detections = detector.detect(image_path)
    rows: List[dict] = []

    for idx, det in enumerate(detections):
        bbox = det.get("bbox")
        name = det.get("name", f"item_{idx}")
        if not bbox:
            continue
        cropped_path = cropper.crop(image_path, bbox, name, idx)
        items = searcher.search(cropped_path)
        for item in items:
            link = item.get("url")
            try:
                data = scraper.scrape(link)
                if data:
                    rows.append(data)
            except Exception as exc:  # pylint: disable=broad-except
                print(f"Failed to scrape {link}: {exc}")

    output_file = exporter.export(rows)
    return output_file


def main() -> None:
    parser = argparse.ArgumentParser(description="Process a room image")
    parser.add_argument("image", help="Path to input image")
    args = parser.parse_args()

    try:
        output = process_image(args.image)
        print(f"Report saved to {output}")
    except Exception as exc:  # pylint: disable=broad-except
        print(f"Processing failed: {exc}")


if __name__ == "__main__":
    main()
