import base64
import io
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
from PIL import Image
from paddleocr import PaddleOCR

PORT = int(os.environ.get("BANFULY_OCR_PORT", "8787"))

ocr = PaddleOCR(
    text_detection_model_name="PP-OCRv5_server_det",
    text_recognition_model_name="PP-OCRv5_server_rec",
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
    lang="ch",
    device="cpu",
    enable_mkldnn=False,
)


def recognize(data_url: str):
    encoded = data_url.split(",", 1)[-1]
    image = Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")
    results = ocr.predict(
        np.asarray(image),
        text_det_thresh=0.45,
        text_det_box_thresh=0.72,
        text_det_unclip_ratio=1.55,
        text_rec_score_thresh=0.68,
    )
    lines = []
    for result in results:
        payload = getattr(result, "json", result)
        if callable(payload):
            payload = payload()
        if isinstance(payload, str):
            payload = json.loads(payload)
        payload = payload.get("res", payload) if isinstance(payload, dict) else {}
        texts = payload.get("rec_texts", [])
        scores = payload.get("rec_scores", [])
        polygons = payload.get("rec_polys", payload.get("dt_polys", []))
        for index, text in enumerate(texts):
            polygon = polygons[index].tolist() if hasattr(polygons[index], "tolist") else polygons[index]
            xs = [float(point[0]) for point in polygon]
            ys = [float(point[1]) for point in polygon]
            value = str(text).strip()
            confidence = float(scores[index]) * 100 if index < len(scores) else 0
            width, height = max(xs) - min(xs), max(ys) - min(ys)
            useful = re.sub(r"[\s\W_]", "", value, flags=re.UNICODE)
            punctuation_ratio = 1 - len(useful) / max(1, len(value))
            has_cjk = bool(re.search(r"[\u3400-\u9fff]", value))
            if confidence < 68 or width < 10 or height < 10 or punctuation_ratio > 0.42:
                continue
            if not has_cjk and len(useful) <= 3 and confidence < 92:
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
        self.send_json(200, {"ok": True, "model": "PP-OCRv5_server"}) if self.path == "/health" else self.send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/ocr":
            return self.send_json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            self.send_json(200, {"model": "PP-OCRv5_server", "lines": recognize(payload["image"])})
        except Exception as error:
            self.send_json(500, {"error": str(error)})

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    print(f"[OCR] PP-OCRv5 Server ready on 127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
