"""Fetch recent daily closes into data/prices.json (free, via yfinance).

Raw (unadjusted) closes are used on purpose: price_at_prediction is a raw quote,
so scoring against dividend-adjusted closes would bias results.

yfinance is an unofficial Yahoo wrapper and can break or throttle. If a symbol
fails, this script warns and moves on; score.py lists any prediction it could not
score under "needs_price" so a missing close is visible. A close can also be
added by hand to data/prices.json (see RUNBOOK.md).
"""
import math

from common import DEFAULT_SYMBOLS, load, save

# Yahoo writes share-class tickers with a dash; data files and the site keep the dotted form.
YF_ALIASES = {"BRK.B": "BRK-B"}


def yf_ticker(sym):
    return YF_ALIASES.get(sym, sym)


def _finite(v):
    try:
        return math.isfinite(float(v))
    except (TypeError, ValueError):
        return False


def main():
    try:
        import yfinance as yf
    except ImportError:
        print("WARNING: yfinance not installed; skipping price fetch")
        return

    predictions = load("predictions.json", [])
    symbols = sorted(set(DEFAULT_SYMBOLS) | {p["symbol"] for p in predictions if "symbol" in p})
    prices = load("prices.json", {})
    ohlc = {}

    for sym in symbols:
        try:
            frame = yf.Ticker(yf_ticker(sym)).history(period="5y", auto_adjust=False)
            hist = frame["Close"]
        except Exception as exc:  # network, rate limit, schema change
            print(f"WARNING: could not fetch {sym}: {exc}")
            continue
        if hist.empty:
            print(f"WARNING: no data returned for {sym}")
            continue
        bucket = prices.setdefault(sym, {})
        for d in [d for d, v in bucket.items() if not _finite(v)]:
            del bucket[d]  # purge NaN rows written by earlier runs
        for ts, close in hist.items():
            if not _finite(close):
                continue  # Yahoo returns an empty row for a session still in progress
            bucket[ts.date().isoformat()] = round(float(close), 4)
        # Compact OHLC for the chart's candle view: last ~300 sessions, [date,o,h,l,c].
        tail = frame.tail(300)
        ohlc[sym] = [[ts.date().isoformat(), round(float(r["Open"]), 2), round(float(r["High"]), 2),
                      round(float(r["Low"]), 2), round(float(r["Close"]), 2)] for ts, r in tail.iterrows()
                     if all(_finite(r[k]) for k in ("Open", "High", "Low", "Close"))]
        print(f"{sym}: {len(hist)} closes merged, latest {max(bucket)}")

    save("prices.json", prices)
    if ohlc:
        save("ohlc.json", ohlc)


if __name__ == "__main__":
    main()
