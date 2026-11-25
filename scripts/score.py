"""Score predictions that have come due and write data/summary.json.

For each open prediction whose resolves_on date has passed and whose close is
available, record whether the AI range and the baseline range held, plus:

  interval score  Winkler score for a central interval (lower is better): the
                  range width plus a penalty, scaled by 2/alpha, for every dollar
                  the outcome landed outside it. Divided by the starting price so
                  different symbols are comparable.
  brier (up)      squared error of ai.prob_up vs whether the close beat the
                  starting price. The baseline has no view, so it uses 0.5.

Coverage of an 80% range should be near 80% over many predictions. Far above means
the ranges are too wide to be useful; far below means overconfident.
"""
from datetime import datetime, timezone

from common import load, parse_date, save

MIN_RESOLVED_FOR_COMPARISON = 10
MAX_GAP_DAYS = 4  # allow weekends/holidays between resolves_on and the last close


def resolve_close(symbol_prices, resolves_on):
    """Close on resolves_on, or the last trading day before it (weekend/holiday).

    Returns (date_str, close), or None if prices don't yet reach resolves_on or the
    nearest earlier close is more than MAX_GAP_DAYS away (treated as missing data).
    """
    if not symbol_prices:
        return None
    dates = sorted(symbol_prices)
    if dates[-1] < resolves_on:
        return None  # the horizon date hasn't been reached in our data yet
    on_or_before = [d for d in dates if d <= resolves_on]
    if not on_or_before:
        return None
    chosen = on_or_before[-1]
    if (parse_date(resolves_on) - parse_date(chosen)).days > MAX_GAP_DAYS:
        return None
    return chosen, symbol_prices[chosen]


def classify(low, high, outcome):
    if outcome < low:
        return "missed_below"
    if outcome > high:
        return "missed_above"
    return "held"


def interval_score(low, high, outcome, level):
    alpha = 1.0 - level
    score = high - low
    if outcome < low:
        score += (2.0 / alpha) * (low - outcome)
    elif outcome > high:
        score += (2.0 / alpha) * (outcome - high)
    return score


def score_one(pred, close_date, close):
    start = pred["price_at_prediction"]
    out = {"close": close, "close_date": close_date}
    went_up = 1.0 if close > start else 0.0
    for name in ("ai", "baseline"):
        rng = pred[name]
        entry = {
            "result": classify(rng["low"], rng["high"], close),
            "interval_score": round(interval_score(rng["low"], rng["high"], close, rng["level"]) / start, 6),
            "width_pct": round((rng["high"] - rng["low"]) / start * 100, 3),
        }
        prob = 0.5 if name == "baseline" else rng.get("prob_up")
        if prob is not None:
            entry["brier_up"] = round((prob - went_up) ** 2, 6)
        out[name] = entry
    return out


def _mean(values):
    return round(sum(values) / len(values), 6) if values else None


def summarize_group(resolved):
    summary = {"n": len(resolved)}
    for name in ("ai", "baseline"):
        rows = [p["result"][name] for p in resolved]
        briers = [r["brier_up"] for r in rows if "brier_up" in r]
        summary[name] = {
            "coverage": _mean([1.0 if r["result"] == "held" else 0.0 for r in rows]),
            "mean_width_pct": _mean([r["width_pct"] for r in rows]),
            "mean_interval_score": _mean([r["interval_score"] for r in rows]),
            "mean_brier_up": _mean(briers),
            "n_brier": len(briers),
        }
    return summary


def run(predictions, prices, now=None):
    needs_price = []
    for pred in predictions:
        if pred.get("status") == "resolved":
            continue
        found = resolve_close(prices.get(pred["symbol"]), pred["resolves_on"])
        if found is None:
            today = (now or datetime.now(timezone.utc)).date().isoformat()
            if pred["resolves_on"] < today:
                needs_price.append(pred["id"])
            continue
        pred["result"] = score_one(pred, *found)
        pred["status"] = "resolved"

    resolved = [p for p in predictions if p.get("status") == "resolved"]
    by_horizon = {}
    for horizon in sorted({p["horizon"] for p in resolved}):
        by_horizon[horizon] = summarize_group([p for p in resolved if p["horizon"] == horizon])

    latest = max((max(v) for v in prices.values() if v), default=None)
    summary = {
        "generated_at": (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "latest_price_date": latest,
        "n_total": len(predictions),
        "n_open": len(predictions) - len(resolved),
        "n_resolved": len(resolved),
        "min_resolved_for_comparison": MIN_RESOLVED_FOR_COMPARISON,
        "comparison_ready": len(resolved) >= MIN_RESOLVED_FOR_COMPARISON,
        "overall": summarize_group(resolved),
        "by_horizon": by_horizon,
        "needs_price": needs_price,
    }
    return predictions, summary


def main():
    predictions = load("predictions.json", [])
    prices = load("prices.json", {})
    predictions, summary = run(predictions, prices)
    save("predictions.json", predictions)
    save("summary.json", summary)
    print(f"{summary['n_resolved']} resolved, {summary['n_open']} open, "
          f"{len(summary['needs_price'])} waiting on a price")


if __name__ == "__main__":
    main()
