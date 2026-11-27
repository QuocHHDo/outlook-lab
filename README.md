# Outlook Lab

Scored AI forecast ranges for 51 symbols: SPY, QQQ, SMH, IWM, XBI, KRE, ITB, all eleven SPDR sector ETFs (XLK, XLF, XLE, XLV, XLY, XLP, XLI, XLB, XLU, XLRE, XLC), TLT, IEF, HYG, GLD, SLV, IBIT, USO, EFA, EEM and 24 large stocks (AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AVGO, AMD, ORCL, MU, JPM, plus the leading name in each remaining sector: BRK.B, LLY, JNJ, UNH, V, XOM, WMT, GE, RTX, LIN, NEE, PLD), compared against no-view baselines. Every prediction is kept and scored when it comes due, including misses. MSTR, SCCO, WELL, SO, CVX and COST were retired from the list: no new forecasts, but their open ones still resolve and score.

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

## What the site shows

- **Overview:** a treemap of every symbol (color is the AI chance of finishing up; size is range width, market value, or equal), a card view with sorting and filters, what changed since the last update, and a calibration panel.
- **Scorecard (`#scorecard`):** progress toward the 10-resolved unlock, AI vs three baselines, coverage by horizon, a reliability diagram for the chance-up number, blind vs not blind, and when predictions come due.
- **Symbol pages:** a TradingView-style chart (self-hosted Lightweight Charts) with the forecast cone, zoom from 1 month to 5 years, log scale, optional layers (earlier forecasts, events, resolved outcomes, candles), plus ranges, catalysts with sources, events and past predictions.
- `site/methodology.html` explains the method and its limits.

Three baselines are scored: zero-drift implied-vol, a drift baseline (6% a year), and a realized-vol baseline (60-day history, no options). Predictions marked blind were locked in `data/locks.json` before any baseline was computed; `scripts/verify_lock_published.py` confirms the lock is public before option data is pulled, and `validate.py` requires the lock to predate the IV read.

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
| `data/ohlc.json` | Generated: last ~300 sessions of OHLC for the candle view |
| `data/meta.json` | Market value per symbol for the map's size option (refreshed by hand) |
| `data/events.json`, `data/locks.json` | Dated events; blind-prediction locks |
| `docs/example_prediction.json` | Shape of one prediction (illustrative numbers, not a real forecast) |
| `scripts/` | `baseline.py`, `fetch_prices.py`, `validate.py`, `score.py`, `verify_lock_published.py` |
| `site/index.html`, `site/lightweight-charts.js` | The public page and its self-hosted chart library |
| `tests/test_score.py` | `python -m pytest tests` |

## Known limits

- yfinance is an unofficial Yahoo wrapper and can break or throttle. When a close is missing after its due date, the prediction is listed under `needs_price` in `summary.json` instead of silently skipped. You can add a close to `data/prices.json` by hand.
- Early results will be noisy. Several months of weekly and monthly predictions are needed before coverage means much.
- Implied vol tends to run above realized vol, so implied-vol baselines are a little wide. That is expected and worth stating alongside any results.
