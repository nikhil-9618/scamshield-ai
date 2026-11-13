"""Evaluate the synthetic classifier and print an honest report.

Run: python scripts/evaluate.py [--json path]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.classifier import get_classifier  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", default="", help="Optional path to write the metrics JSON")
    args = parser.parse_args()

    metrics = get_classifier().metrics
    print("ScamShield AI — synthetic text classifier evaluation")
    print(f"Dataset:              {metrics['dataset']} ({metrics['dataset_size']} rows)")
    print(f"Holdout rows:         {metrics['holdout_size']}")
    print(f"Scam precision:       {metrics['scam_precision']}")
    print(f"Scam recall:          {metrics['scam_recall']}")
    print(f"Scam F1:              {metrics['scam_f1']}")
    print(f"Calibrated:           {metrics['calibrated']}")
    print(f"Note:                 {metrics['note']}")
    print()
    print("These numbers describe a small synthetic dataset only. They are not a claim")
    print("about real-world accuracy and must not be shown to users as confidence.")
    if args.json:
        Path(args.json).write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
