"""Baseline range: a forecast with no view, using volatility only.

Two ways to get the volatility:
  implied_vol  at-the-money implied volatility from the options market
               (read from the Robinhood MCP during the weekly run)
  hist_vol     annualized volatility of past daily log returns (free fallback)

The range is log-normal with zero drift (median = today's price), so it never
goes below zero and is slightly wider on the upside than the downside.

Usage:
  python scripts/baseline.py --price 711.23 --vol 0.272 --days 9
  python scripts/baseline.py --price 711.23 --vol 0.272 --days 9 --level 0.9
"""
import argparse
import math
from statistics import NormalDist, stdev


def baseline_range(price, vol, days, level=0.8):
    """Return (low, high) covering `level` probability. vol is annualized (0.27 = 27%)."""
    if price <= 0 or vol <= 0 or days <= 0:
        raise ValueError("price, vol and days must be positive")
    if not 0 < level < 1:
        raise ValueError("level must be between 0 and 1")
    sigma = vol * math.sqrt(days / 365.0)
    z = NormalDist().inv_cdf(0.5 + level / 2)
    return price * math.exp(-z * sigma), price * math.exp(z * sigma)


def hist_vol(closes):
    """Annualized volatility from a list of daily closes (oldest first), 252 trading days."""
    if len(closes) < 21:
        raise ValueError("need at least 21 closes for a usable estimate")
    rets = [math.log(b / a) for a, b in zip(closes, closes[1:])]
    return stdev(rets) * math.sqrt(252)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--price", type=float, required=True)
    ap.add_argument("--vol", type=float, required=True, help="annualized, e.g. 0.272")
    ap.add_argument("--days", type=int, required=True, help="calendar days to the horizon")
    ap.add_argument("--level", type=float, default=0.8)
    args = ap.parse_args()
    low, high = baseline_range(args.price, args.vol, args.days, args.level)
    print(f"{args.level:.0%} range over {args.days} days: {low:.2f} - {high:.2f}")


if __name__ == "__main__":
    main()
