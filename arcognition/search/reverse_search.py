"""Reverse image search using the hosted API."""

from __future__ import annotations

import logging
from typing import List

import requests


logger = logging.getLogger(__name__)


class ReverseSearch:
    """Interface to the deployed reverse image search API."""

    REVERSE_SEARCH_ENDPOINT = "http://localhost:5000/reverse"

    def __init__(self, endpoint: str | None = None) -> None:
        self.endpoint = endpoint or self.REVERSE_SEARCH_ENDPOINT

    def search(self, image_path: str) -> List[dict]:
        """Submit image and return product info dictionaries.

        If the backend returns no results or errors occur, a placeholder item
        is returned so downstream code always has something to display.
        """
        logger.info("Reverse searching %s", image_path)
        try:
            with open(image_path, "rb") as f:
                img_bytes = f.read()
            logger.debug("Uploading %d bytes to %s", len(img_bytes), self.endpoint)
            response = requests.post(
                self.endpoint, files={"image": img_bytes}, timeout=60
            )
            response.raise_for_status()
            data = response.json()
            items = data.get("results") or []
            if not items:
                logger.warning("Reverse search empty; returning placeholder")
                items = [
                    {
                        "site": "example.com",
                        "url": "https://example.com/",  # placeholder link
                        "title": "No match found",
                        "price_eur": None,
                        "thumbnail": None,
                    }
                ]
            logger.info("Reverse search returned %d results", len(items))
            return items
        except Exception as exc:  # pylint: disable=broad-except
            logger.exception("reverse search failed: %s", exc)
            return [
                {
                    "site": "error",
                    "url": "",
                    "title": "Reverse search failed",
                    "price_eur": None,
                    "thumbnail": None,
                }
            ]
