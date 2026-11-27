"""Fetch the Wall Street analyst consensus into data/ratings.json (free, via yfinance).

Stocks only: ETFs and funds have no analyst coverage, so they are skipped.
Display context, not an input to any forecast or score. Best effort: a symbol
that fails keeps its previous entry, and the script never exits non-zero.
"""
import math
from datetime import date

from common import DEFAULT_SYMBOLS, load, save
from fetch_prices import yf_ticker

ETFS = {"SPY", "QQQ", "SMH", "IWM", "XBI", "KRE", "ITB", "XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "XLB",
        "XLU", "XLRE", "XLC", "TLT", "IEF", "HYG", "GLD", "SLV", "IBIT", "USO", "EFA", "EEM"}


def _num(v, nd=2):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f, nd) if math.isfinite(f) else None


def fetch_one(yf, sym):
    t = yf.Ticker(yf_ticker(sym))
    out = {}
    rec = t.recommendations_summary
    if rec is not None and not rec.empty:
        row = rec.iloc[0]
        counts = {k: int(row[k]) for k in ("strongBuy", "buy", "hold", "sell", "strongSell") if k in rec.columns}
        if sum(counts.values()) > 0:
            out["counts"] = counts
    pt = t.analyst_price_targets or {}
    target = {k: _num(pt.get(k)) for k in ("mean", "median", "high", "low")}
    if target["mean"]:
        out["target"] = target
    return out or None


def main():
    try:
        import yfinance as yf
    except ImportError:
        print("WARNING: yfinance not installed; skipping ratings fetch")
        return
    old = load("ratings.json", {}).get("symbols", {})
    history = load("ratings_history.json", {})
    symbols = {}
    for sym in sorted(set(DEFAULT_SYMBOLS) - ETFS):
        try:
            got = fetch_one(yf, sym)
        except Exception as exc:
            print(f"WARNING: ratings for {sym} failed: {exc}")
            got = None
        if got:
            got["as_of"] = date.today().isoformat()
            symbols[sym] = got
            if got.get("target"):  # dated snapshot, so score.py can use only what was known before a prediction
                history.setdefault(sym, {})[got["as_of"]] = {"mean": got["target"]["mean"]}
            print(f"{sym}: ok")
        elif sym in old:
            symbols[sym] = old[sym]  # keep the last good entry, with its own older as_of
            print(f"{sym}: kept previous")
        else:
            print(f"WARNING: no ratings for {sym}")
    if symbols:
        save("ratings.json", {"source": "Yahoo Finance consensus (via yfinance)", "symbols": symbols})
        save("ratings_history.json", history)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"WARNING: ratings fetch aborted: {exc}")
