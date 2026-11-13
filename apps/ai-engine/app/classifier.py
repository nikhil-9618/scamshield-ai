"""Statistical scam-text classifier.

Trained at import time on a small, bundled **synthetic** dataset. This is
deliberately modest: it contributes a bounded supporting signal to the
TypeScript rule engine and is never allowed to decide that something is safe.

The evaluation metrics exposed here come from a held-out split of the same
synthetic data. They are not evidence of real-world performance, and the
classifier is not calibrated, so callers must not present its output as a
probability that a message is a scam.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

MODEL_VERSION = "tfidf-logreg-synthetic-2026.11.1"
DATASET_PATH = Path(__file__).parent / "data" / "synthetic_messages.jsonl"
DECISION_THRESHOLD = 0.6  # matches the API's use of the supporting signal
URL_TOKEN = " urltoken "
PHONE_TOKEN = " phonetoken "
MONEY_TOKEN = " moneytoken "


def normalize(text: str) -> str:
    value = text.lower()
    value = re.sub(r"https?://\S+", URL_TOKEN, value)
    value = re.sub(r"\b(?:\+91[\s-]?)?[6-9]\d{9}\b", PHONE_TOKEN, value)
    value = re.sub(r"(?:rs\.?|inr|₹)\s?\d[\d,]*", MONEY_TOKEN, value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


@dataclass
class Prediction:
    label: str
    probability: float
    labels: dict[str, float]
    model: str
    top_features: list[dict[str, Any]]


class Classifier:
    def __init__(self) -> None:
        rows = [json.loads(line) for line in DATASET_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]
        texts = [normalize(row["text"]) for row in rows]
        labels = [row["label"] for row in rows]
        is_scam = [label != "legit" for label in labels]
        self.categories = sorted(set(labels) - {"legit"})

        # Binary scam/legit model: this is the signal the API consumes. A separate
        # category model only labels the type; it never changes the probability.
        train_x, test_x, train_y, test_y = train_test_split(
            texts, is_scam, test_size=0.28, random_state=42, stratify=is_scam
        )
        self.pipeline = Pipeline(
            [
                ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True, max_features=8000)),
                ("clf", LogisticRegression(max_iter=3000, C=4.0, class_weight="balanced")),
            ]
        )
        self.pipeline.fit(train_x, train_y)

        probabilities = self.pipeline.predict_proba(test_x)[:, 1]
        predicted = [probability >= DECISION_THRESHOLD for probability in probabilities]
        self.metrics = {
            "dataset": "synthetic-messages",
            "dataset_size": len(rows),
            "holdout_size": len(test_y),
            "decision_threshold": DECISION_THRESHOLD,
            "scam_precision": round(float(precision_score(test_y, predicted, zero_division=0)), 3),
            "scam_recall": round(float(recall_score(test_y, predicted, zero_division=0)), 3),
            "scam_f1": round(float(f1_score(test_y, predicted, zero_division=0)), 3),
            "calibrated": False,
            "note": "Held-out split of a small synthetic dataset at the product decision threshold. Not a real-world accuracy claim.",
        }

        # Category label model is trained on scam rows only and is intentionally
        # weak; the API treats it as a small vote, never as evidence.
        scam_texts = [text for text, label in zip(texts, labels, strict=True) if label != "legit"]
        scam_labels = [label for label in labels if label != "legit"]
        self.category_pipeline = Pipeline(
            [
                ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True, max_features=8000)),
                ("clf", LogisticRegression(max_iter=3000, C=2.0, class_weight="balanced")),
            ]
        )
        self.category_pipeline.fit(scam_texts, scam_labels)

        self._vectorizer: TfidfVectorizer = self.pipeline.named_steps["tfidf"]
        self._model: LogisticRegression = self.pipeline.named_steps["clf"]
        self._category_model: LogisticRegression = self.category_pipeline.named_steps["clf"]

    def predict(self, text: str) -> Prediction:
        cleaned = normalize(text)
        scam_probability = float(self.pipeline.predict_proba([cleaned])[0][1])
        scam_probability = max(0.0, min(1.0, scam_probability))

        category_probabilities = self.category_pipeline.predict_proba([cleaned])[0]
        categories = list(self._category_model.classes_)
        best_index = int(category_probabilities.argmax())
        label = str(categories[best_index]) if scam_probability >= 0.5 else "legit"

        labels = {str(category): round(float(probability) * scam_probability, 4) for category, probability in zip(categories, category_probabilities, strict=True)}
        labels["legit"] = round(1.0 - scam_probability, 4)
        labels["scam"] = round(scam_probability, 4)

        return Prediction(
            label=label,
            probability=round(scam_probability, 4),
            labels=labels,
            model=MODEL_VERSION,
            top_features=self._top_features(cleaned),
        )

    def _top_features(self, cleaned: str, limit: int = 8) -> list[dict[str, Any]]:
        """Report the binary model's strongest positive token weights.

        These are model-internal features, not an explanation of intent. They
        exist so the UI can show what the classifier reacted to.
        """
        coefficients = self._model.coef_[0]
        present = self._vectorizer.transform([cleaned])
        names = self._vectorizer.get_feature_names_out()
        contributions: list[tuple[str, float]] = []
        for token_index in present.indices:
            contributions.append((str(names[token_index]), float(coefficients[token_index])))
        contributions.sort(key=lambda item: item[1], reverse=True)
        return [
            {"token": token, "weight": round(weight, 3)}
            for token, weight in contributions[:limit]
            if not math.isnan(weight)
        ]


_classifier: Classifier | None = None


def get_classifier() -> Classifier:
    global _classifier
    if _classifier is None:
        _classifier = Classifier()
    return _classifier
