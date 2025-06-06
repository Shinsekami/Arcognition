import base64
import os
from io import BytesIO
from typing import List

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from arcognition.detectors import FurnitureDetector
from arcognition.cropper import Cropper
from arcognition.search import ReverseSearch
from arcognition.export import ExcelExporter

app = FastAPI()

def process_image_file(temp_path: str) -> str:
    detector = FurnitureDetector()
    cropper = Cropper()
    searcher = ReverseSearch(
        "https://arcognition-search-<your-project>.run.app/reverse"
    )
    exporter = ExcelExporter()

    detections = detector.detect(temp_path)
    rows: List[dict] = []
    for idx, det in enumerate(detections):
        bbox = det.get("bbox")
        if not bbox:
            continue
        cropped = cropper.crop(temp_path, bbox, det.get("name", f"item_{idx}"), idx)
        links = searcher.search(cropped)
        for link in links:
            rows.append(
                {
                    "Item Name": det.get("name", f"item_{idx}"),
                    "Price": "0",
                    "Website": "example.com",
                    "Product Link": link,
                }
            )
    if not rows:
        raise HTTPException(status_code=400, detail="No items detected")
    output_file = exporter.export(rows)
    return output_file

class ImageRequest(BaseModel):
    image_base64: str

@app.post("/process")
async def process(image: UploadFile = File(None), payload: ImageRequest | None = None):
    if image is None and payload is None:
        raise HTTPException(status_code=400, detail="No image provided")

    if image is not None:
        contents = await image.read()
    else:
        if not payload or not payload.image_base64:
            raise HTTPException(status_code=400, detail="No image provided")
        contents = base64.b64decode(payload.image_base64)

    temp_path = "temp_input.jpg"
    with open(temp_path, "wb") as f:
        f.write(contents)

    try:
        output_path = process_image_file(temp_path)
    finally:
        os.remove(temp_path)

    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="arcognition_report.xlsx",
    )
