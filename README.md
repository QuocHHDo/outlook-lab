# Outlook Lab

Scored AI forecast ranges for S&P 500, QQQ, SMH, IWM, all eleven SPDR sector ETFs (XLK, XLF, XLE, XLV, XLY, XLP, XLI, XLB, XLU, XLRE, XLC), TLT and GLD, compared against a no-view volatility baseline. Every prediction is kept and scored when it comes due, including misses.

This is an evaluation project, not a trading signal and not financial advice.

## How it works

```
Weekly run (Claude + Robinhood MCP, read-only tools)
   prices, at-the-money implied vol, earnings dates, news
        |
        v
   scripts/baseline.py  -> baseline range (no view)
   AI range + catalysts -> written by the model, with sources
        |
        v
   data/predictions.json   (committed)
        |
        v
GitHub Actions, weekdays after the close (free)
   fetch_prices.py -> data/prices.json   (raw closes, yfinance)
   validate.py     -> rejects malformed predictions
   score.py        -> resolves due predictions, writes data/summary.json
        |
        v
   site/index.html on GitHub Pages
```

Running cost: $0. The model step is run by you inside Claude on your own subscription and its output is committed; nothing in the pipeline calls a paid API.

## Setup

1. Create a GitHub repo (public is fine; Pages on private repos needs a paid plan) and push this folder to `main`.
2. Settings > Pages > Source: **GitHub Actions**.
3. Run the workflow once from the Actions tab (**Update scores and deploy site**).

## Scoring

- **Coverage:** share of predictions where the close landed inside the range. An 80% range should land near 80% over many predictions. Far above: too wide to be useful. Far below: overconfident.
- **Interval score** (Winkler, lower is better): range width plus a penalty for each dollar outside it, divided by the starting price so symbols are comparable. This rewards narrow ranges that still hold.
- **Brier (up):** squared error of `ai.prob_up` against whether the close beat the starting price. The baseline has no view and uses 0.5.
- The AI-vs-baseline comparison is shown only after **10** resolved predictions. Even then it is a small sample.
- Closes are raw (not dividend-adjusted) because `price_at_prediction` is a raw quote.

## Layout

| Path | Purpose |
|---|---|
| `RUNBOOK.md` | Step-by-step for the weekly prediction run |
| `data/predictions.json` | All predictions, open and resolved |
| `data/prices.json` | Daily closes used for scoring |
| `data/summary.json` | Generated track-record summary |
| `docs/example_prediction.json` | Shape of one prediction (illustrative numbers, not a real forecast) |
| `scripts/` | `baseline.py`, `fetch_prices.py`, `validate.py`, `score.py` |
| `site/index.html` | The public page |
| `tests/test_score.py` | `python -m unittest discover tests` |

## Known limits

- yfinance is an unofficial Yahoo wrapper and can break or throttle. When a close is missing after its due date, the prediction is listed under `needs_price` in `summary.json` instead of silently skipped. You can add a close to `data/prices.json` by hand.
- Early results will be noisy. Several months of weekly and monthly predictions are needed before coverage means much.
- Implied vol tends to run above realized vol, so implied-vol baselines are a little wide. That is expected and worth stating alongside any results.
