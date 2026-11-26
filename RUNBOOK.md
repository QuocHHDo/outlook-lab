# Weekly run

Run once a week, in Claude, with the Robinhood MCP connected. Do the steps in order.

## Rules

- **Read-only.** Use only data tools: quotes, historicals, option chains, option instruments, option quotes, earnings calendar. Never call order, watchlist-changing, or account tools for this project.
- **Nothing from your account goes in the repo or on the site:** no positions, balances, or orders.
- **Sources for every catalyst claim.** If a claim has no source, mark it as the model's expectation or leave it out.
- **Blind process.** The AI range is written and committed to `data/locks.json` *before* any implied volatility or baseline is looked at. Predictions made this way get `"blind": true`; `validate.py` fails if a blind prediction has no matching lock. Anything written after seeing a baseline must leave `blind` out and say so in `notes`.

## Steps (per symbol: SPY, QQQ, SMH, IWM, XLK, XLF, XLE, XLV, XLY, XLP, XLI, XLB, XLU, XLRE, XLC, TLT, GLD, EFA, EEM, HYG, AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AVGO, JPM, MSTR, plus any others listed in `scripts/common.py`; horizons 1w, 1m, 6m, 1y, 5y)

**Phase 1: lock the AI view (no option data yet)**

1. **Pull the quote.** Record the last trade price and its timestamp (`price_at_prediction`). Do not open option chains yet.
2. **Gather catalysts.** Check recent news and the earnings calendar. Write bull, base, and bear points with sources.
3. **Write the AI range** (`low`, `high`, `level` 0.8) and `prob_up` for every symbol and horizon.
4. **Commit the locks.** Add one entry per prediction id to `data/locks.json`: `{"<id>": {"low": ..., "high": ..., "prob_up": ..., "locked_at": "<ISO time>"}}`. Commit and push it on its own (it does not trigger the workflow), then **verify it is public before Phase 2**: `python scripts/verify_lock_published.py <id> <id> ...` must print OK. If it fails, do not pull option data. Each lock's `locked_at` must be earlier than the prediction's `baseline.iv_updated_at`; `validate.py` enforces this.

**Phase 2: baseline and publish**

5. **Pick the expiry** closest to the horizon (about 7 days for `1w`, 30 for `1m`). For `6m`, `1y` and `5y`, set `resolves_on` to the target trading day and take implied vol from the nearest listed expiry (for `5y` the longest listed one, since no 5-year options exist); say so in `notes`. For short horizons set `resolves_on` to the expiry date.
6. **Read implied vol.** List contracts for that expiry at the strike nearest the current price (calls and puts), fetch their quotes, and average the two `implied_volatility` values. Record the `updated_at` time.
7. **Compute the baseline:**
   ```
   python scripts/baseline.py --price <price> --vol <iv> --days <calendar days to resolves_on> --level 0.8
   ```
   The drift baseline (`baseline_drift`) and the 60-day realized-vol baseline (`baseline_realized`) are added automatically by `score.py`.
8. **Append the predictions** to `data/predictions.json` using the shape in `docs/example_prediction.json`, copying the AI numbers exactly from the locks and setting `"blind": true`. Use the id `YYYY-MM-DD_SYMBOL_horizon`.
9. **Validate and commit:**
   ```
   python scripts/validate.py
   git add data/predictions.json && git commit -m "Predictions <date>" && git push
   ```

## If scoring is missing a close

`summary.json` lists such predictions under `needs_price`. Add the close by hand to `data/prices.json` as `"SYMBOL": {"YYYY-MM-DD": 123.45}` using the raw (unadjusted) close, then run `python scripts/score.py`.

## Resolve checklist (monthly)

- Is coverage drifting far from the stated level?
- Is the AI interval score beating the baseline after 10+ resolved predictions?
- Write down what you got wrong before changing the method. Do not edit past predictions.


## Long horizons (6m, 1y, 5y)

The volatility baseline is zero-drift (median = today's price), which is a weak yardstick over years because stocks tend to drift up. A long-horizon range that tilts upward can beat it without any skill. The drift baseline (6% a year, same for every symbol) is the fairer comparison there. Read long-horizon results with that in mind, and note that 6m resolves in 2027 and 5y in 2031, so these add nothing to the track record soon.


## Gathering news (bull and bear)

1. **Search each side separately.** Run at least one search aimed at the bull case and one at the bear case for each symbol, so the cards do not just mirror that day's headlines.
2. **Aim for at least two sourced items per case.** If a side has fewer, say so in `notes` (for example "bull case is thin: only one sourced item") rather than filling it with reasoning. Items with no link must carry `kind: "model_expectation"` or a `note`.
3. **Prefer hard data over commentary:** earnings guidance and revisions, rate-futures pricing, positioning, and official calendars.
4. **Never edit catalysts after a prediction is committed.** Adding news afterward would rationalize a range that is already locked and would undermine the scoring.
5. **Update `data/events.json`** (upcoming events and recent shocks). A change to that file alone does not trigger a rebuild, so commit it together with `data/predictions.json` or start the workflow by hand.


## Notes on the non-equity ETFs

- **TLT and GLD** are priced in raw closes. TLT pays a monthly dividend (roughly 0.4%), which drops the raw price on the ex-date, so a 1-week or 1-month range that spans an ex-date should account for it.
- **TLT** option quotes sometimes return a usable implied vol for only one side (call or put) at far expiries; use the side that has one and say so in `notes`.
- **XLRE** lists only four expiries (nothing past May 2027): use Dec 18 for 1w/1m and May 21 for the longer horizons, and say so in the notes.
- **XLY, XLU** long-dated chains can miss the strike nearest the price: use the closest listed strike and note it.
- **XLE, XLV, XLF** long-dated chains list fewer strikes; if the strike nearest the price is missing, use the closest listed one and note it.

## Weekly: refresh earnings dates

Before predicting, pull the next ~60 days of earnings for the single stocks with `get_earnings_calendar` (31-day windows, so two calls) and update `data/earnings.json`. The site flags any prediction window that contains a report date. Commit it with the lock commit; it does not trigger a workflow run.

## Weekly: update the watchlist (rumors and unconfirmed risks)

Add items to `data/events.json` with `"type": "watch"` for things that could move markets but are not confirmed, such as a reported tariff plan. Each needs `status` (`rumor`, `reported` or `disputed`), `direction` (`bull`, `bear`, `mixed`), `prob` (your chance it actually happens), `by` (the date it is judged on), `date` (first reported) and a source link or a note. Search for current coverage first and cite it. Never write an item from memory. Retire items by deleting them once `by` passes, and record whether each one happened in your weekly notes so the probabilities can be scored later. Each item should also carry, where you can support them:
- `resolves_if`: one sentence saying exactly what counts as yes.
- `market_prob` (0 to 1) and `market_prob_bound` (`max` when it is only a ceiling, such as a futures price leaving at most 2%): the market-implied chance, only when a market price exists. Otherwise leave both out and the page says "No market price".
- `impact`: `ranges` as percent moves if it happens, beyond what is priced in, as `[low, high]` with an 80% range for `SPY` plus any ticker you want a pilot for (META uses SPY's range times 1.6); `confidence` (`low` or `medium`); `basis` saying which past event it is anchored to; and `sources` linking that past event. Search for the analogue first and never write a range from memory.
- `short` (a chart label up to about 12 characters) and `checked` (the date you last verified it).

`scripts/validate.py` checks these fields. Impact ranges are judgment and are not scored yet; once a few items resolve, compare each range with SPY's actual move over the same window and say how rough that comparison is. Edits to `events.json` do not trigger a workflow run: run the workflow from Actions to publish them, or publish them together with a `site/` change.
