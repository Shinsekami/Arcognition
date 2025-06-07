"""Scraper package aggregating different sources."""

import logging

from .google_scraper import GoogleShoppingScraper
from .amazon_scraper import AmazonScraper

logger = logging.getLogger(__name__)


class ProductScraper:
    """Select appropriate scraper based on URL."""

    def __init__(self) -> None:
        self.google = GoogleShoppingScraper()
        self.amazon = AmazonScraper()

    def scrape(self, url: str):
        logger.info("Selecting scraper for %s", url)
        if "amazon." in url:
            return self.amazon.scrape(url)
        return self.google.scrape(url)

__all__ = ["ProductScraper"]
