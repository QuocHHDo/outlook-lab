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
import math
from datetime import datetime, timezone

from baseline import baseline_range, drift_range, hist_vol
from common import load, parse_date, save

MIN_RESOLVED_FOR_COMPARISON = 10
MAX_GAP_DAYS = 4  # allow weekends/holidays between resolves_on and the last close


def resolve_close(symbol_prices, resolves_on):
    """Close on resolves_on, or the last trading day before it (weekend/holiday).

    Returns (date_str, close), or None if prices don't yet reach resolves_on or the
    nearest earlier close is more than MAX_GAP_DAYS away (treated as missing data).
    """
    symbol_prices = {d: v for d, v in (symbol_prices or {}).items()
                     if isinstance(v, (int, float)) and math.isfinite(v)}
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


def add_drift_baseline(pred):
    """Attach baseline_drift (zero view, assumed drift) to a prediction that has an IV."""
    base = pred.get("baseline") or {}
    iv = base.get("iv")
    if not iv or "baseline_drift" in pred:
        return
    try:
        days = (parse_date(pred["resolves_on"]) - parse_date(pred["made_at"])).days
        low, high = drift_range(pred["price_at_prediction"], iv, days, base.get("level", 0.8))
    except (KeyError, ValueError):
        return
    pred["baseline_drift"] = {"method": "implied_vol_drift", "iv": iv, "low": round(low, 2),
                              "high": round(high, 2), "level": base.get("level", 0.8)}


def add_realized_baseline(pred, symbol_prices):
    """Attach baseline_realized: zero drift, vol from the 60 closes up to made_at.

    A third yardstick that needs no options data. Skipped if history is too short
    or doesn't cover made_at. Uses only closes dated on or before made_at.
    """
    if "baseline_realized" in pred or not symbol_prices:
        return
    base = pred.get("baseline") or {}
    try:
        dates = [d for d in sorted(symbol_prices) if d <= pred["made_at"]]
        closes = [symbol_prices[d] for d in dates][-61:]
        if len(closes) < 21 or (parse_date(pred["made_at"]) - parse_date(dates[-1])).days > MAX_GAP_DAYS:
            return
        vol = hist_vol(closes)
        days = (parse_date(pred["resolves_on"]) - parse_date(pred["made_at"])).days
        low, high = baseline_range(pred["price_at_prediction"], vol, days, base.get("level", 0.8))
    except (KeyError, ValueError, IndexError):
        return
    pred["baseline_realized"] = {"method": "hist_vol_60d", "vol": round(vol, 4), "low": round(low, 2),
                                 "high": round(high, 2), "level": base.get("level", 0.8)}


def score_one(pred, close_date, close):
    start = pred["price_at_prediction"]
    out = {"close": close, "close_date": close_date}
    went_up = 1.0 if close > start else 0.0
    for name in ("ai", "baseline", "baseline_drift", "baseline_realized"):
        rng = pred.get(name)
        if rng is None:
            continue
        entry = {
            "result": classify(rng["low"], rng["high"], close),
            "interval_score": round(interval_score(rng["low"], rng["high"], close, rng["level"]) / start, 6),
            "width_pct": round((rng["high"] - rng["low"]) / start * 100, 3),
        }
        prob = rng.get("prob_up") if name == "ai" else 0.5
        if prob is not None:
            entry["brier_up"] = round((prob - went_up) ** 2, 6)
        out[name] = entry
    return out


def _mean(values):
    return round(sum(values) / len(values), 6) if values else None


def summarize_group(resolved):
    summary = {"n": len(resolved)}
    for name in ("ai", "baseline", "baseline_drift", "baseline_realized"):
        rows = [p["result"][name] for p in resolved if name in p["result"]]
        if not rows:
            continue
        briers = [r["brier_up"] for r in rows if "brier_up" in r]
        summary[name] = {
            "coverage": _mean([1.0 if r["result"] == "held" else 0.0 for r in rows]),
            "mean_width_pct": _mean([r["width_pct"] for r in rows]),
            "mean_interval_score": _mean([r["interval_score"] for r in rows]),
            "mean_brier_up": _mean(briers),
            "n_brier": len(briers),
        }
    return summary


PROB_BINS = [(0.0, 0.4), (0.4, 0.5), (0.5, 0.6), (0.6, 0.7), (0.7, 1.0001)]


def calibration(resolved):
    """Reliability of ai.prob_up: in each probability bin, how often did the close beat the start?"""
    bins = []
    for lo, hi in PROB_BINS:
        rows = [p for p in resolved if p["ai"].get("prob_up") is not None and lo <= p["ai"]["prob_up"] < hi]
        ups = [1.0 if p["result"]["close"] > p["price_at_prediction"] else 0.0 for p in rows]
        bins.append({"lo": lo, "hi": min(hi, 1.0), "n": len(rows),
                     "mean_prob": _mean([p["ai"]["prob_up"] for p in rows]),
                     "freq_up": _mean(ups)})
    return bins


def run(predictions, prices, now=None):
    needs_price = []
    for pred in predictions:
        add_drift_baseline(pred)
        add_realized_baseline(pred, prices.get(pred["symbol"]))
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
        "n_blind": sum(1 for p in predictions if p.get("blind")),
        "overall": summarize_group(resolved),
        "calibration": calibration(resolved),
        "by_horizon": by_horizon,
        "by_blind": {"blind": summarize_group([p for p in resolved if p.get("blind")]),
                     "not_blind": summarize_group([p for p in resolved if not p.get("blind")])},
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
