"""Scraper for product details via Apify Amazon actor."""

from __future__ import annotations

from typing import Dict, Optional

import requests


class AmazonScraper:
    """Scrape product data from an Amazon product page."""

    def __init__(self) -> None:
        # Token for the Apify Amazon actor. Replace with your own if required.
        self.token = "YOUR_APIFY_TOKEN"

        self.endpoint = (
            "https://api.apify.com/v2/acts/epctex~amazon-scraper/run-sync-get-dataset-items"
        )

    def scrape(self, url: str) -> Optional[Dict]:
        """Scrape an Amazon product page and return key data."""
        if not self.token:
            raise RuntimeError("APIFY token is missing")


        payload = {
            "startUrls": [{"url": url}],
            "maxItems": 1,
        }
        params = {"token": self.token}
        response = requests.post(self.endpoint, params=params, json=payload, timeout=60)
        response.raise_for_status()
        data = response.json()
        if not data:
            return None
        item = data[0]
        return {
            "Item Name": item.get("title"),
            "Price": item.get("price"),
            "Website": "amazon.com",
            "Product Link": url,
        }
