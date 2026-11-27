import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import baseline  # noqa: E402
import score  # noqa: E402
import validate  # noqa: E402


def make_pred(pid="p1", low=100, high=110, blow=95, bhigh=115, start=105, resolves="2026-12-04", prob=0.6):
    return {
        "id": pid, "symbol": "SPY", "made_at": "2026-11-25", "horizon": "1w",
        "resolves_on": resolves, "price_at_prediction": start,
        "ai": {"low": low, "high": high, "level": 0.8, "prob_up": prob},
        "baseline": {"low": blow, "high": bhigh, "level": 0.8, "method": "implied_vol"},
    }


class BaselineTests(unittest.TestCase):
    def test_matches_spy_example(self):
        low, high = baseline.baseline_range(711.23, 0.272, 9, 0.8)
        self.assertAlmostEqual(low, 673.2, delta=0.6)
        self.assertAlmostEqual(high, 751.3, delta=0.6)

    def test_wider_with_more_days_and_level(self):
        a = baseline.baseline_range(100, 0.2, 7, 0.8)
        b = baseline.baseline_range(100, 0.2, 30, 0.8)
        c = baseline.baseline_range(100, 0.2, 7, 0.95)
        self.assertGreater(b[1] - b[0], a[1] - a[0])
        self.assertGreater(c[1] - c[0], a[1] - a[0])

    def test_rejects_bad_input(self):
        with self.assertRaises(ValueError):
            baseline.baseline_range(100, 0, 7)


class ScoreTests(unittest.TestCase):
    def test_classify(self):
        self.assertEqual(score.classify(100, 110, 105), "held")
        self.assertEqual(score.classify(100, 110, 100), "held")
        self.assertEqual(score.classify(100, 110, 99.9), "missed_below")
        self.assertEqual(score.classify(100, 110, 111), "missed_above")

    def test_interval_score(self):
        self.assertEqual(score.interval_score(100, 110, 105, 0.8), 10)
        # 5 below the range at 80%: width 10 + (2/0.2)*5 = 60
        self.assertAlmostEqual(score.interval_score(100, 110, 95, 0.8), 60)

    def test_resolve_close_weekend_uses_friday(self):
        prices = {"2026-12-03": 1.0, "2026-12-04": 2.0, "2026-12-07": 3.0}
        self.assertEqual(score.resolve_close(prices, "2026-12-05"), ("2026-12-04", 2.0))

    def test_resolve_close_waits_until_date_reached(self):
        self.assertIsNone(score.resolve_close({"2026-12-03": 1.0}, "2026-12-04"))

    def test_resolve_close_gap_too_big(self):
        self.assertIsNone(score.resolve_close({"2026-11-20": 1.0, "2026-12-20": 2.0}, "2026-12-04"))

    def test_run_resolves_and_summarizes(self):
        now = datetime(2026, 12, 10, tzinfo=timezone.utc)
        preds = [make_pred("a"), make_pred("b", low=120, high=130, resolves="2026-12-04"),
                 make_pred("c", resolves="2027-03-01")]
        prices = {"SPY": {"2026-12-04": 108.0, "2026-12-07": 109.0}}
        preds, summary = score.run(preds, prices, now=now)
        self.assertEqual(summary["n_resolved"], 2)
        self.assertEqual(summary["n_open"], 1)
        self.assertEqual(preds[0]["result"]["ai"]["result"], "held")
        self.assertEqual(preds[1]["result"]["ai"]["result"], "missed_below")
        self.assertEqual(summary["overall"]["ai"]["coverage"], 0.5)
        self.assertEqual(summary["overall"]["baseline"]["coverage"], 1.0)
        self.assertFalse(summary["comparison_ready"])
        self.assertEqual(summary["needs_price"], [])

    def test_flags_missing_price_after_due_date(self):
        now = datetime(2026, 12, 10, tzinfo=timezone.utc)
        _, summary = score.run([make_pred("a")], {"SPY": {"2026-12-01": 100.0}}, now=now)
        self.assertEqual(summary["needs_price"], ["a"])

    def test_brier_uses_half_for_baseline(self):
        res = score.score_one(make_pred(prob=0.8, start=105), "2026-12-04", 108.0)
        self.assertAlmostEqual(res["ai"]["brier_up"], 0.04)
        self.assertAlmostEqual(res["baseline"]["brier_up"], 0.25)


class ValidateTests(unittest.TestCase):
    def test_good_prediction_passes(self):
        self.assertEqual(validate.validate([make_pred()]), [])

    def test_catches_problems(self):
        bad = make_pred(low=120, high=110)
        bad["horizon"] = "10y"
        errors = validate.validate([bad, make_pred()])
        self.assertTrue(any("low must be below" in e for e in errors))
        self.assertTrue(any("horizon" in e for e in errors))

    def test_events_validation(self):
        good = {"events": [{"type": "scheduled", "kind": "macro", "date": "2026-12-04",
                            "title": "Jobs", "sources": [{"label": "BLS", "url": "https://www.bls.gov/"}]}]}
        self.assertEqual(validate.validate_events(good), [])
        bad = {"events": [{"type": "x", "kind": "macro", "date": "12/04", "title": "Jobs"}]}
        errors = validate.validate_events(bad)
        self.assertTrue(any("type" in e for e in errors))
        self.assertTrue(any("date" in e for e in errors))
        self.assertTrue(any("source" in e for e in errors))

    def test_duplicate_ids(self):
        errors = validate.validate([make_pred("x"), make_pred("x")])
        self.assertTrue(any("duplicate" in e for e in errors))


if __name__ == "__main__":
    unittest.main()


# ---- second baseline, calibration, blind locks ----
import baseline as _bl
import validate as _val


def test_drift_range_shifts_up_and_matches_zero_drift_when_mu_zero():
    lo0, hi0 = _bl.baseline_range(100, 0.2, 365)
    lo1, hi1 = _bl.drift_range(100, 0.2, 365, mu=0.0)
    # mu=0 still has the -vol^2/2 term, so it sits slightly below zero-drift
    assert lo1 < lo0 and hi1 < hi0
    lo2, hi2 = _bl.drift_range(100, 0.2, 365, mu=0.06)
    assert lo2 > lo1 and hi2 > hi1


def test_drift_baseline_added_and_scored():
    pred = {"id": "x", "symbol": "A", "made_at": "2026-01-01", "resolves_on": "2026-01-31",
            "horizon": "1m", "price_at_prediction": 100.0, "status": "open",
            "ai": {"low": 90, "high": 110, "level": 0.8, "prob_up": 0.6},
            "baseline": {"method": "implied_vol", "iv": 0.2, "low": 92, "high": 108, "level": 0.8}}
    preds, summary = score.run([pred], {"A": {"2026-01-31": 104.0}})
    assert "baseline_drift" in preds[0]
    assert "baseline_drift" in preds[0]["result"]
    assert summary["overall"]["baseline_drift"]["n_brier"] == 1
    cal = {(b["lo"], b["hi"]): b for b in summary["calibration"]}
    assert cal[(0.6, 0.7)]["n"] == 1 and cal[(0.6, 0.7)]["freq_up"] == 1.0


def test_blind_requires_matching_lock():
    base = {"id": "x", "symbol": "A", "made_at": "2026-01-01", "resolves_on": "2026-01-08", "horizon": "1w",
            "price_at_prediction": 100.0, "blind": True,
            "ai": {"low": 95, "high": 105, "level": 0.8, "prob_up": 0.5},
            "baseline": {"method": "implied_vol", "low": 96, "high": 104, "level": 0.8}}
    assert any("blind" in e for e in _val.validate([base], {}))
    ok = {"low": 95, "high": 105, "prob_up": 0.5, "locked_at": "2026-01-01T10:00:00Z"}
    assert not _val.validate([base], {"x": ok})
    assert any("locked_at" in e for e in _val.validate([base], {"x": {k: v for k, v in ok.items() if k != "locked_at"}}))
    assert any("differs" in e for e in _val.validate([base], {"x": {"low": 94, "high": 105, "prob_up": 0.5}}))


def test_lock_must_precede_iv_pull():
    base = {"id": "x", "symbol": "A", "made_at": "2026-01-01", "resolves_on": "2026-01-08", "horizon": "1w",
            "price_at_prediction": 100.0, "blind": True,
            "ai": {"low": 95, "high": 105, "level": 0.8, "prob_up": 0.5},
            "baseline": {"method": "implied_vol", "iv_updated_at": "2026-01-01T10:05:00Z",
                         "low": 96, "high": 104, "level": 0.8}}
    lock = {"low": 95, "high": 105, "prob_up": 0.5, "locked_at": "2026-01-01T10:00:00Z"}
    assert not _val.validate([base], {"x": lock})
    late = dict(lock, locked_at="2026-01-01T10:10:00Z")
    assert any("earlier" in e for e in _val.validate([base], {"x": late}))


def test_realized_baseline_added_from_history_and_scored():
    import math
    closes = {}
    d0 = __import__("datetime").date(2025, 10, 1)
    for i in range(100):
        d = d0 + __import__("datetime").timedelta(days=i)
        if d.weekday() < 5:
            closes[d.isoformat()] = 100 * math.exp(0.01 * math.sin(i))
    closes["2026-01-08"] = 101.0
    pred = {"id": "x", "symbol": "A", "made_at": "2026-01-01", "resolves_on": "2026-01-08",
            "horizon": "1w", "price_at_prediction": 100.0, "status": "open",
            "ai": {"low": 95, "high": 105, "level": 0.8, "prob_up": 0.5},
            "baseline": {"method": "implied_vol", "low": 96, "high": 104, "level": 0.8}}
    preds, summary = score.run([pred], {"A": closes})
    br = preds[0]["baseline_realized"]
    assert br["low"] < 100.0 < br["high"]
    assert "baseline_realized" in preds[0]["result"]
    assert summary["by_blind"]["not_blind"]["n"] == 1
    # no history -> no baseline, no crash
    p2 = dict(pred, id="y"); p2.pop("baseline_realized", None)
    preds2, _ = score.run([p2], {"A": {"2026-01-08": 101.0}})
    assert "baseline_realized" not in preds2[0]


def test_verify_lock_published_check():
    import verify_lock_published as v
    locks = {"a": {"low": 1, "high": 2, "prob_up": 0.5, "locked_at": "t"}, "b": {"low": 1}}
    assert v.check(locks, ["a"]) == []
    assert len(v.check(locks, ["b", "c"])) == 2


def test_nan_close_is_ignored_when_resolving():
    nan = float("nan")
    # NaN on the due date must not be used as the close; the prior real close is within the gap rule
    got = score.resolve_close({"2026-12-03": 100.0, "2026-12-04": nan}, "2026-12-04")
    assert got is None or got[1] == 100.0
    assert score.resolve_close({"2026-12-04": nan}, "2026-12-04") is None


def test_watch_items_need_status_prob_and_by_date():
    base = {"type": "watch", "kind": "politics", "date": "2026-11-20", "title": "Tariff talk",
            "status": "rumor", "direction": "bear", "prob": 0.3, "by": "2026-12-31",
            "sources": [{"label": "x", "url": "https://example.com/"}]}
    assert validate.validate_events({"events": [base]}) == []
    bad = dict(base, status="confirmed", prob=1.5, by="soon", direction="up")
    errors = validate.validate_events({"events": [bad]})
    assert len(errors) == 4


def test_watch_impact_fields_are_checked():
    base = {"type": "watch", "kind": "politics", "date": "2026-11-20", "title": "Tariff talk",
            "status": "rumor", "direction": "bear", "prob": 0.3, "by": "2026-12-31",
            "sources": [{"label": "x", "url": "https://example.com/"}],
            "market_prob": 0.02, "market_prob_bound": "max", "resolves_if": "It happens.",
            "checked": "2026-11-26", "short": "Tariffs",
            "impact": {"confidence": "low", "basis": "Analogue.", "ranges": {"SPY": [-3.0, -0.3], "META": [-4.8, -0.5]},
                       "sources": [{"label": "y", "url": "https://example.com/y"}]}}
    assert validate.validate_events({"events": [base]}) == []
    bad = dict(base, market_prob=2, resolves_if=" ", checked="soon",
               impact={"confidence": "high", "basis": "", "ranges": {"SPY": [1, -1]}, "sources": [{"url": "http://x"}]})
    assert len(validate.validate_events({"events": [bad]})) == 7
    no_spy = dict(base, impact=dict(base["impact"], ranges={"META": [-1, 0]}))
    assert len(validate.validate_events({"events": [no_spy]})) == 1


def test_shock_cause_and_move_are_checked():
    base = {"type": "shock", "kind": "shock", "date": "2026-11-16", "title": "Nasdaq-100 fell",
            "sources": [{"label": "x", "url": "https://example.com/"}],
            "cause": "stocks", "scope": "tech", "move": {"label": "QQQ -2.7%", "tone": "bad"}}
    assert validate.validate_events({"events": [base]}) == []
    bad = dict(base, cause="vibes", move={"label": " ", "tone": "red"})
    assert len(validate.validate_events({"events": [bad]})) == 2
    no_scope = {k: v for k, v in base.items() if k != "scope"}
    assert len(validate.validate_events({"events": [no_scope]})) == 1


def test_share_class_tickers_map_to_yahoo_and_symbols_are_unique():
    import fetch_prices, common
    assert fetch_prices.yf_ticker("BRK.B") == "BRK-B" and fetch_prices.yf_ticker("SPY") == "SPY"
    assert len(common.DEFAULT_SYMBOLS) == len(set(common.DEFAULT_SYMBOLS)) == 45


def test_drift_baseline_brier_uses_its_implied_chance_up():
    low, high = _bl.drift_range(100, 0.2, 365, mu=0.06)
    pred = {"price_at_prediction": 100.0,
            "ai": {"low": 90, "high": 110, "level": 0.8, "prob_up": 0.6},
            "baseline": {"low": 80, "high": 120, "level": 0.8},
            "baseline_drift": {"low": low, "high": high, "level": 0.8},
            "baseline_realized": {"low": 85, "high": 118, "level": 0.8}}
    res = score.score_one(pred, "2027-01-01", 110.0)
    p = res["baseline_drift"]["prob_up"]
    assert 0.5 < p < 0.7  # a 6% yearly drift tilts the chance of finishing up above a coin flip
    assert abs(res["baseline_drift"]["brier_up"] - (p - 1.0) ** 2) < 1e-3
    assert res["baseline"]["brier_up"] == 0.25 and res["baseline_realized"]["brier_up"] == 0.25
    assert score.implied_prob_up({"low": 80, "high": 125, "level": 0.8}, 100.0) is not None


def _analyst_pred(made="2026-12-01"):
    return {"id": "z", "symbol": "A", "made_at": made, "resolves_on": "2026-12-31", "horizon": "1m",
            "price_at_prediction": 100.0, "status": "open",
            "ai": {"low": 95, "high": 108, "level": 0.8, "prob_up": 0.55},
            "baseline": {"method": "implied_vol", "low": 92, "high": 108, "level": 0.8}}


def test_analyst_baseline_uses_only_earlier_snapshots_and_shifts_range():
    import math
    hist = {"A": {"2026-11-27": {"mean": 120.0}, "2026-12-01": {"mean": 999.0}}}
    preds, _ = score.run([_analyst_pred()], {"A": {"2026-12-31": 105.0}}, ratings_history=hist)
    b = preds[0]["baseline_analyst"]
    assert b["target_date"] == "2026-11-27" and b["target_mean"] == 120.0  # not the same-day 999
    shift = math.exp(math.log(1.2) * 30 / 365)
    assert abs(b["low"] - 92 * shift) < 0.01 and abs(b["high"] - 108 * shift) < 0.01
    assert "baseline_analyst" in preds[0]["result"]
    assert preds[0]["result"]["baseline_analyst"]["brier_up"] < 0.25  # bullish target, close went up


def test_analyst_baseline_skipped_without_fresh_prior_snapshot():
    assert "baseline_analyst" not in score.run([_analyst_pred()], {}, ratings_history={"A": {"2026-12-01": {"mean": 120}}})[0][0]
    assert "baseline_analyst" not in score.run([_analyst_pred()], {}, ratings_history={"A": {"2026-11-01": {"mean": 120}}})[0][0]
    assert "baseline_analyst" not in score.run([_analyst_pred()], {})[0][0]
