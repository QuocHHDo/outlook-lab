# Weekly run

Run once a week, in Claude, with the Robinhood MCP connected. Do the steps in order.

## Rules

- **Read-only.** Use only data tools: quotes, historicals, option chains, option instruments, option quotes, earnings calendar. Never call order, watchlist-changing, or account tools for this project.
- **Nothing from your account goes in the repo or on the site:** no positions, balances, or orders.
- **Sources for every catalyst claim.** If a claim has no source, mark it as the model's expectation or leave it out.
- **Write the AI range before looking at the baseline you compute**, so the comparison stays honest.

## Steps (per symbol: SPY, QQQ, SMH; horizons 1w, 1m, 6m, 1y, 5y)

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
