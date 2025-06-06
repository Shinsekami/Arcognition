"""Reverse image search using the hosted API."""

from __future__ import annotations

import os
import sys
from typing import List

import requests
from dotenv import load_dotenv


class ReverseSearch:
    """Interface to the local reverse image search API."""

    def __init__(self, endpoint: str | None = None) -> None:
        load_dotenv()
        self.endpoint = endpoint or os.getenv("REVERSE_SEARCH_ENDPOINT")
        if not self.endpoint:
            print("❌ REVERSE_SEARCH_ENDPOINT is missing from .env")
            sys.exit(1)

    def search(self, image_path: str) -> List[str]:
        """Submit image and return product links."""
        with open(image_path, "rb") as f:
            files = {"image": f}
            response = requests.post(self.endpoint, files=files, timeout=60)
        response.raise_for_status()
        data = response.json()
        links = data.get("links") or []
        return links[:10]
