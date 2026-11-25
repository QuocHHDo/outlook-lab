"""Check data/predictions.json before it is committed. Exit 1 on any problem."""
import sys

from common import HORIZONS, load, parse_date

BASELINE_METHODS = {"implied_vol", "hist_vol"}


def check_range(errors, pid, name, obj):
    if not isinstance(obj, dict):
        errors.append(f"{pid}: {name} missing")
        return
    for key in ("low", "high", "level"):
        if not isinstance(obj.get(key), (int, float)):
            errors.append(f"{pid}: {name}.{key} must be a number")
            return
    if not obj["low"] < obj["high"]:
        errors.append(f"{pid}: {name}.low must be below {name}.high")
    if not 0 < obj["level"] < 1:
        errors.append(f"{pid}: {name}.level must be between 0 and 1")


def validate(predictions):
    errors, seen = [], set()
    for i, p in enumerate(predictions):
        pid = p.get("id", f"#{i}")
        if pid in seen:
            errors.append(f"{pid}: duplicate id")
        seen.add(pid)
        for key in ("symbol", "made_at", "horizon", "resolves_on", "price_at_prediction"):
            if key not in p:
                errors.append(f"{pid}: missing {key}")
        if p.get("horizon") not in HORIZONS:
            errors.append(f"{pid}: horizon must be one of {sorted(HORIZONS)}")
        try:
            if parse_date(p["resolves_on"]) <= parse_date(p["made_at"]):
                errors.append(f"{pid}: resolves_on must be after made_at")
        except (KeyError, ValueError):
            errors.append(f"{pid}: made_at/resolves_on must be YYYY-MM-DD dates")
        if not isinstance(p.get("price_at_prediction"), (int, float)) or p.get("price_at_prediction", 0) <= 0:
            errors.append(f"{pid}: price_at_prediction must be a positive number")
        check_range(errors, pid, "ai", p.get("ai"))
        check_range(errors, pid, "baseline", p.get("baseline"))
        base = p.get("baseline") or {}
        if base.get("method") not in BASELINE_METHODS:
            errors.append(f"{pid}: baseline.method must be one of {sorted(BASELINE_METHODS)}")
        prob = (p.get("ai") or {}).get("prob_up")
        if prob is not None and not (isinstance(prob, (int, float)) and 0 <= prob <= 1):
            errors.append(f"{pid}: ai.prob_up must be between 0 and 1")
    return errors


def main():
    errors = validate(load("predictions.json", []))
    for e in errors:
        print("ERROR:", e)
    if errors:
        sys.exit(1)
    print("predictions.json OK")


if __name__ == "__main__":
    main()
