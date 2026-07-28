import base64
import io
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
from PIL import Image
from rapidocr import RapidOCR

PORT = int(os.environ.get("BANFULY_OCR_PORT", "8787"))

ocr = RapidOCR()


def recognize(data_url: str):
    encoded = data_url.split(",", 1)[-1]
    image = Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")
    width, height = image.size
    scale = min(1.0, 1800 / max(width, height))
    if scale < 1:
        image = image.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.Resampling.LANCZOS)
    result = ocr(np.asarray(image))
    lines = []
    boxes = getattr(result, "boxes", None)
    texts = getattr(result, "txts", None)
    scores = getattr(result, "scores", None)
    if boxes is not None and texts is not None:
        items = zip(boxes, texts, scores if scores is not None else [0] * len(texts))
    else:
        raw = result[0] if isinstance(result, tuple) else result
        items = ((item[0], item[1], item[2]) for item in (raw or []))
    for polygon, text, score in items:
        polygon = polygon.tolist() if hasattr(polygon, "tolist") else polygon
        xs = [float(point[0]) / scale for point in polygon]
        ys = [float(point[1]) / scale for point in polygon]
        value = str(text).strip()
        confidence = float(score) * 100
        box_width, box_height = max(xs) - min(xs), max(ys) - min(ys)
        useful = re.sub(r"[\s\W_]", "", value, flags=re.UNICODE)
        punctuation_ratio = 1 - len(useful) / max(1, len(value))
        has_cjk = bool(re.search(r"[\u3400-\u9fff]", value))
        if confidence < 60 or box_width < 10 or box_height < 8 or punctuation_ratio > 0.38:
            continue
        if not has_cjk and len(useful) <= 2 and confidence < 90:
            continue
        lines.append({"text": value, "confidence": confidence, "bbox": {"x0": min(xs), "y0": min(ys), "x1": max(xs), "y1": max(ys)}})
    return sorted((line for line in lines if line["text"]), key=lambda line: (line["bbox"]["y0"], line["bbox"]["x0"]))


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.send_json(200, {"ok": True, "model": "RapidOCR_ONNX"}) if self.path == "/health" else self.send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/ocr":
            return self.send_json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            self.send_json(200, {"model": "RapidOCR_ONNX", "lines": recognize(payload["image"])})
        except Exception as error:
            self.send_json(500, {"error": str(error)})

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    print(f"[OCR] RapidOCR ONNX ready on 127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
