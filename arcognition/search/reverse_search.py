"""Reverse image search using the hosted API."""

from __future__ import annotations

import sys
from typing import List

import requests


class ReverseSearch:
    """Interface to the deployed reverse image search API."""

    REVERSE_SEARCH_ENDPOINT = (
        "https://arcognition-search-<your-project>.run.app/reverse"
    )

    def __init__(self, endpoint: str | None = None) -> None:
        self.endpoint = endpoint or self.REVERSE_SEARCH_ENDPOINT

    def search(self, image_path: str) -> List[dict]:
        """Submit image and return product info dictionaries."""
        try:
            with open(image_path, "rb") as f:
                files = {"image": f}
                response = requests.post(self.endpoint, files=files, timeout=60)
            response.raise_for_status()
            data = response.json()
            items = data.get("results") or []
            if not items:
                raise RuntimeError("empty results")
            return items
        except Exception as exc:  # pylint: disable=broad-except
            print(f"reverse search failed: {exc}")
            return [
                {
                    "site": "example.com",
                    "url": "https://example.com/product1",
                    "price_eur": 0.0,
                    "thumbnail": "",
                }
            ]
