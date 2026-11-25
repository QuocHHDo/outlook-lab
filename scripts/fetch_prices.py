"""Fetch recent daily closes into data/prices.json (free, via yfinance).

Raw (unadjusted) closes are used on purpose: price_at_prediction is a raw quote,
so scoring against dividend-adjusted closes would bias results.

yfinance is an unofficial Yahoo wrapper and can break or throttle. If a symbol
fails, this script warns and moves on; score.py lists any prediction it could not
score under "needs_price" so a missing close is visible. A close can also be
added by hand to data/prices.json (see RUNBOOK.md).
"""
from common import DEFAULT_SYMBOLS, load, save


def main():
    try:
        import yfinance as yf
    except ImportError:
        print("WARNING: yfinance not installed; skipping price fetch")
        return

    predictions = load("predictions.json", [])
    symbols = sorted(set(DEFAULT_SYMBOLS) | {p["symbol"] for p in predictions if "symbol" in p})
    prices = load("prices.json", {})

    for sym in symbols:
        try:
            hist = yf.Ticker(sym).history(period="5y", auto_adjust=False)["Close"]
        except Exception as exc:  # network, rate limit, schema change
            print(f"WARNING: could not fetch {sym}: {exc}")
            continue
        if hist.empty:
            print(f"WARNING: no data returned for {sym}")
            continue
        bucket = prices.setdefault(sym, {})
        for ts, close in hist.items():
            bucket[ts.date().isoformat()] = round(float(close), 4)
        print(f"{sym}: {len(hist)} closes merged, latest {max(bucket)}")

    save("prices.json", prices)


if __name__ == "__main__":
    main()
