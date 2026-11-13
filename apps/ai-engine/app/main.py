"""ScamShield AI engine — NLP classification, OCR, QR decoding and explanations.

Design constraints:
* The engine is an internal service. It never receives raw content for the LLM.
* Every capability degrades independently and reports honestly when unavailable.
* Nothing here decides that something is "safe"; the TypeScript rule engine owns
  the risk score.
"""

from __future__ import annotations

import io
import os
import re
import time
from typing import Any

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .classifier import MODEL_VERSION, get_classifier
from .explanation import AI_DISCLAIMER, generate_explanation

STARTED_AT = time.time()
MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_MAGIC = {
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
}

app = FastAPI(title="ScamShield AI Engine", version="1.0.0", docs_url=None, redoc_url=None)


def require_token(x_internal_token: str | None = Header(default=None)) -> None:
    expected = os.getenv("INTERNAL_SERVICE_TOKEN")
    if expected and x_internal_token != expected:
        raise HTTPException(status_code=401, detail="Invalid internal service token.")


# --------------------------------------------------------------------- models


class ClassifyRequest(BaseModel):
    text: str = Field(min_length=3, max_length=20_000)


class ExplainFinding(BaseModel):
    title: str = Field(max_length=200)
    severity: str = Field(max_length=20)
    evidence: str = Field(max_length=600)
    recommendedAction: str = Field(max_length=400)


class ExplainRequest(BaseModel):
    scanType: str = Field(max_length=30)
    riskScore: int = Field(ge=0, le=100)
    riskLevel: str = Field(max_length=20)
    category: str = Field(max_length=40)
    summary: str = Field(max_length=500)
    findings: list[ExplainFinding] = Field(default_factory=list, max_length=10)
    limitations: list[str] = Field(default_factory=list, max_length=8)
    coverage: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------- capabilities


def _ocr_engine() -> tuple[str | None, str]:
    """Pick the first available OCR backend without importing broken packages."""
    try:
        import pytesseract  # noqa: F401
        import shutil

        if shutil.which("tesseract"):
            return "tesseract", ""
    except Exception:  # pragma: no cover - optional dependency
        pass
    try:
        from rapidocr_onnxruntime import RapidOCR  # noqa: F401

        return "rapidocr", ""
    except Exception:  # pragma: no cover - optional dependency
        pass
    return None, "No OCR engine is installed (install tesseract-ocr or rapidocr-onnxruntime)."


def _qr_engine() -> tuple[str | None, str]:
    try:
        import cv2  # noqa: F401

        return "opencv-qrcode", ""
    except Exception:  # pragma: no cover - optional dependency
        return None, "OpenCV is not installed, so QR decoding is unavailable."


def _read_image(data: bytes) -> str:
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Images must be 5 MB or smaller.")
    for magic, mime in ALLOWED_MAGIC.items():
        if data.startswith(magic):
            return mime
    raise HTTPException(status_code=415, detail="Only PNG and JPEG images are supported.")


def classify_content_type(value: str) -> str:
    lowered = value.strip()
    if re.match(r"^https?://", lowered, flags=re.IGNORECASE):
        return "url"
    if lowered.lower().startswith("upi://") or re.search(
        r"[A-Za-z0-9._-]{2,}@(?:oksbi|okhdfcbank|okicici|okaxis|ybl|ibl|axl|apl|paytm|upi|sbi|hdfcbank|icici|axisbank|kotak|yesbank|airtel)\b",
        lowered,
    ):
        return "upi"
    if lowered:
        return "text"
    return "other"


# ------------------------------------------------------------------ endpoints


@app.get("/health")
def health() -> dict[str, Any]:
    ocr_name, ocr_reason = _ocr_engine()
    qr_name, qr_reason = _qr_engine()
    classifier = get_classifier()
    return {
        "status": "ok",
        "service": "scamshield-ai-engine",
        "version": "1.0.0",
        "uptime_seconds": round(time.time() - STARTED_AT, 1),
        "model": MODEL_VERSION,
        "llm_configured": bool(os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY")),
        "ocr": {"available": ocr_name is not None, "engine": ocr_name, "reason": ocr_reason},
        "qr": {"available": qr_name is not None, "engine": qr_name, "reason": qr_reason},
        "metrics": classifier.metrics,
    }


@app.post("/classify", dependencies=[Depends(require_token)])
def classify(payload: ClassifyRequest) -> dict[str, Any]:
    classifier = get_classifier()
    prediction = classifier.predict(payload.text)
    return {
        "label": prediction.label,
        "probability": prediction.probability,
        "labels": prediction.labels,
        "model": prediction.model,
        "top_features": prediction.top_features,
        "calibrated": False,
        "note": "Supporting statistical signal only; trained and evaluated on synthetic data.",
    }


@app.post("/ocr", dependencies=[Depends(require_token)])
async def ocr(file: UploadFile = File(...)) -> dict[str, Any]:
    data = await file.read()
    _read_image(data)
    engine_name, reason = _ocr_engine()
    if engine_name is None:
        raise HTTPException(status_code=503, detail=reason)

    warnings: list[str] = []
    text = ""
    try:
        from PIL import Image

        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception:
        raise HTTPException(status_code=422, detail="The image could not be decoded.")

    if engine_name == "tesseract":
        import pytesseract

        extracted = pytesseract.image_to_string(image, lang=os.getenv("OCR_LANG", "eng"))
        text = extracted
        warnings.append("OCR output may contain recognition errors; check the extracted text.")
    else:
        from rapidocr_onnxruntime import RapidOCR

        engine = RapidOCR()
        result, _ = engine(image_to_array(image))
        lines = []
        for entry in result or []:
            if len(entry) >= 2 and isinstance(entry[1], str):
                lines.append(entry[1])
        text = "\n".join(lines)
        warnings.append("OCR output may contain recognition errors; check the extracted text.")

    cleaned = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not cleaned:
        raise HTTPException(status_code=422, detail="No readable text was found in the image.")
    return {
        "text": cleaned[:30_000],
        "engine": engine_name,
        "warnings": warnings,
    }


def image_to_array(image):  # pragma: no cover - only used by rapidocr
    import numpy as np

    return np.array(image.convert("RGB"))


@app.post("/qr", dependencies=[Depends(require_token)])
async def qr(file: UploadFile = File(...)) -> dict[str, Any]:
    data = await file.read()
    _read_image(data)
    engine_name, reason = _qr_engine()
    if engine_name is None:
        raise HTTPException(status_code=503, detail=reason)

    import cv2
    import numpy as np

    buffer = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=422, detail="The image could not be decoded.")
    detector = cv2.QRCodeDetector()
    value, points, _ = detector.detectAndDecode(image)
    if not value:
        # Try the multi-code detector once; some screenshots contain several crops.
        ok, values, _, _ = detector.detectAndDecodeMulti(image)
        if ok and values:
            value = next((candidate for candidate in values if candidate), "")
    if not value:
        raise HTTPException(status_code=422, detail="No QR code could be decoded from that image.")

    content_type = classify_content_type(value)
    return {
        "value": value[:4096],
        "content_type": content_type,
        "engine": engine_name,
        "warnings": [
            "Decoded offline. ScamShield does not open this destination automatically.",
            *([] if content_type != "upi" else ["This QR code contains a UPI payment instruction. Approving it moves money out of your account."]),
        ],
    }


@app.post("/explain", dependencies=[Depends(require_token)])
def explain(payload: ExplainRequest) -> dict[str, Any]:
    result = generate_explanation(payload.model_dump())
    return {
        "text": result.text,
        "generator": result.generator,
        "model": result.model,
        "disclaimer": AI_DISCLAIMER,
    }
