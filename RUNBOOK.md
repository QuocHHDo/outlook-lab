# Weekly run

Run once a week, in Claude, with the Robinhood MCP connected. Do the steps in order.

## Rules

- **Read-only.** Use only data tools: quotes, historicals, option chains, option instruments, option quotes, earnings calendar. Never call order, watchlist-changing, or account tools for this project.
- **Nothing from your account goes in the repo or on the site:** no positions, balances, or orders.
- **Sources for every catalyst claim.** If a claim has no source, mark it as the model's expectation or leave it out.
- **Write the AI range before looking at the baseline you compute**, so the comparison stays honest.

## Steps (per symbol: SPY, QQQ, SMH, IWM, XLK, XLF, XLE, XLV, XLY, XLP, XLI, XLB, XLU, XLRE, XLC, TLT, GLD; horizons 1w, 1m, 6m, 1y, 5y)

1. **Pull the quote.** Record the last trade price and its timestamp (`price_at_prediction`).
2. **Pick the expiry** closest to the horizon (about 7 days for `1w`, 30 for `1m`). For `6m`, `1y` and `5y`, set `resolves_on` to the target trading day and take implied vol from the nearest listed expiry (for `5y` the longest listed one, since no 5-year options exist); say so in `notes`. For short horizons set `resolves_on` to the expiry date.
3. **Read implied vol.** List contracts for that expiry at the strike nearest the current price (calls and puts), fetch their quotes, and average the two `implied_volatility` values. Record the `updated_at` time.
4. **Compute the baseline:**
   ```
   python scripts/baseline.py --price <price> --vol <iv> --days <calendar days to resolves_on> --level 0.8
   ```
5. **Gather catalysts.** Check recent news and the earnings calendar. Write bull, base, and bear points with sources.
6. **Write the AI range** (`low`, `high`, `level` 0.8) and `prob_up` (probability the close beats the starting price).
7. **Append the prediction** to `data/predictions.json` using the shape in `docs/example_prediction.json`. Use the id `YYYY-MM-DD_SYMBOL_horizon`.
8. **Validate and commit:**
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

The baseline is zero-drift (median = today's price), which is a weak yardstick over years because stocks tend to drift up. A long-horizon range that tilts upward can beat it without any skill. Read long-horizon results with that in mind, and note that 6m resolves in 2027 and 5y in 2031, so these add nothing to the track record soon.


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
