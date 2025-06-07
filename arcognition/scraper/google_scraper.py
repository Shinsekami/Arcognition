"""Scraper for product details via Apify Google Shopping actor."""

from __future__ import annotations

from typing import Dict, Optional
import logging

import requests


logger = logging.getLogger(__name__)


class GoogleShoppingScraper:
    """Scrape product data from a Google Shopping link."""

    def __init__(self) -> None:
        # Token for the Apify Google Shopping actor. Replace with your own
        # token if you deploy your own instance.
        self.token = "YOUR_APIFY_TOKEN"
        self.endpoint = (
            "https://api.apify.com/v2/acts/apify~google-shopping-scraper/run-sync-get-dataset-items"
        )

    def scrape(self, url: str) -> Optional[Dict]:
        """Scrape product page and return key data."""
        if not self.token:
            logger.error("APIFY token is missing")
            raise RuntimeError("APIFY token is missing")
        logger.info("Scraping Google Shopping URL %s", url)

        payload = {"productUrls": [url], "maxItems": 1}
        params = {"token": self.token}
        response = requests.post(
            self.endpoint, params=params, json=payload, timeout=60
        )
        response.raise_for_status()
        data = response.json()
        if not data:
            logger.warning("No data returned for %s", url)
            return None
        item = data[0]
        return {
            "Item Name": item.get("title"),
            "Price": item.get("price"),
            "Website": item.get("seller"),
            "Product Link": url,
        }
