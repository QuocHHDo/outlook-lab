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
        bad["horizon"] = "5y"
        errors = validate.validate([bad, make_pred()])
        self.assertTrue(any("low must be below" in e for e in errors))
        self.assertTrue(any("horizon" in e for e in errors))

    def test_duplicate_ids(self):
        errors = validate.validate([make_pred("x"), make_pred("x")])
        self.assertTrue(any("duplicate" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
