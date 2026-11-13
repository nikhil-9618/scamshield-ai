"""Fast, dependency-light checks for the AI engine's honest failure modes."""

from fastapi.testclient import TestClient

from app.classifier import get_classifier
from app.explanation import generate_explanation
from app.main import app, classify_content_type

client = TestClient(app)


def test_health_reports_metrics_and_capabilities():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["model"].startswith("tfidf-logreg")
    assert body["metrics"]["calibrated"] is False
    assert 0.0 <= body["metrics"]["scam_f1"] <= 1.0


def test_classifier_separates_obvious_examples():
    classifier = get_classifier()
    scam = classifier.predict("Pay Rs 499 registration fee to confirm your work from home internship. Send screenshot on Telegram.")
    benign = classifier.predict("Your OTP is 483920 for the login you requested. It expires in 10 minutes. Do not share it.")
    assert scam.probability > benign.probability
    assert 0.0 <= benign.probability <= 1.0


def test_explanation_without_llm_is_labelled_template():
    result = generate_explanation(
        {
            "scanType": "message",
            "riskScore": 72,
            "riskLevel": "high",
            "category": "fake_job",
            "summary": "A message asks for an upfront fee before a job.",
            "findings": [
                {
                    "title": "Upfront payment requested",
                    "severity": "high",
                    "evidence": "The sender asks for a refundable registration fee.",
                    "recommendedAction": "Do not pay. Verify the employer independently.",
                }
            ],
            "limitations": ["No threat intelligence was available."],
            "coverage": {"level": "limited", "providersUsed": [], "providersUnavailable": ["VirusTotal"]},
        }
    )
    assert result.generator == "template"
    assert "upfront fee" in result.text.lower() or "registration fee" in result.text.lower()
    assert "AI-generated explanation" in result.text
    assert "72/100" in result.text


def test_qr_content_types():
    assert classify_content_type("https://example.com") == "url"
    assert classify_content_type("upi://pay?pa=someone@okhdfcbank&am=500") == "upi"
    assert classify_content_type("plain text payload") == "text"
