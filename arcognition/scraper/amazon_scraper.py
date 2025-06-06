"""Scraper for product details via Apify Amazon actor."""

from __future__ import annotations

import os
from typing import Dict, Optional

import requests
from dotenv import load_dotenv


class AmazonScraper:
    """Scrape product data from an Amazon product page."""

    def __init__(self) -> None:
        load_dotenv()
        self.token = os.getenv("APIFY_TOKEN")
        self.endpoint = (
            "https://api.apify.com/v2/acts/epctex~amazon-scraper/run-sync-get-dataset-items"
        )

    def scrape(self, url: str) -> Optional[Dict]:
        """Scrape an Amazon product page and return key data."""
        if not self.token:
            raise RuntimeError("APIFY_TOKEN not set in .env")

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
