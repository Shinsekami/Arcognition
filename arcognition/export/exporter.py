"""Excel report generation utilities."""

from __future__ import annotations

from typing import List, Dict
import logging

import pandas as pd


logger = logging.getLogger(__name__)


class ExcelExporter:
    """Export collected data to an Excel spreadsheet."""

    def __init__(self, output_file: str = "arcognition_report.xlsx") -> None:
        self.output_file = output_file

    def export(self, rows: List[Dict]) -> str:
        if not rows:
            logger.error("No data to export")
            raise ValueError("No data to export")
        logger.info("Exporting %d rows to %s", len(rows), self.output_file)

        df = pd.DataFrame(rows)
        if "Price" in df.columns:
            try:
                df["Price"] = df["Price"].astype(float)
            except ValueError:
                pass
        df = df.sort_values(by="Price", ascending=True)
        df.to_excel(self.output_file, index=False)
        return self.output_file
