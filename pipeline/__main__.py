"""CLI entry point for WARDLINE INDIA pipeline."""
import argparse
import json

from .acquire import acquire_raw_archive
from .analyze import run_analytics
from .forecast import run_forecasts
from .normalize import normalize_hmis
from .publish import publish_bundle, run_all
from .validate import validate_and_reconcile


def main() -> None:
    parser = argparse.ArgumentParser(description="WARDLINE INDIA reproducible data pipeline")
    parser.add_argument(
        "command",
        choices=["acquire", "normalize", "validate", "analyze", "forecast", "publish", "all"],
        help="Pipeline stage to execute",
    )
    args = parser.parse_args()

    if args.command == "acquire":
        res = acquire_raw_archive()
    elif args.command == "normalize":
        res = normalize_hmis()
    elif args.command == "validate":
        res = validate_and_reconcile()
    elif args.command == "analyze":
        res = run_analytics()
    elif args.command == "forecast":
        res = run_forecasts()
    elif args.command == "publish":
        res = publish_bundle()
    else:
        res = run_all()

    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
