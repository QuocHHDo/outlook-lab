"""Check data/predictions.json before it is committed. Exit 1 on any problem."""
import sys

from common import HORIZONS, load, parse_date

BASELINE_METHODS = {"implied_vol", "hist_vol"}


def check_range(errors, pid, name, obj):
    if not isinstance(obj, dict):
        errors.append(f"{pid}: {name} missing")
        return
    for key in ("low", "high", "level"):
        if not isinstance(obj.get(key), (int, float)):
            errors.append(f"{pid}: {name}.{key} must be a number")
            return
    if not obj["low"] < obj["high"]:
        errors.append(f"{pid}: {name}.low must be below {name}.high")
    if not 0 < obj["level"] < 1:
        errors.append(f"{pid}: {name}.level must be between 0 and 1")


def validate(predictions, locks=None):
    errors, seen = [], set()
    locks = locks or {}
    for i, p in enumerate(predictions):
        pid = p.get("id", f"#{i}")
        if pid in seen:
            errors.append(f"{pid}: duplicate id")
        seen.add(pid)
        for key in ("symbol", "made_at", "horizon", "resolves_on", "price_at_prediction"):
            if key not in p:
                errors.append(f"{pid}: missing {key}")
        if p.get("horizon") not in HORIZONS:
            errors.append(f"{pid}: horizon must be one of {sorted(HORIZONS)}")
        try:
            if parse_date(p["resolves_on"]) <= parse_date(p["made_at"]):
                errors.append(f"{pid}: resolves_on must be after made_at")
        except (KeyError, ValueError):
            errors.append(f"{pid}: made_at/resolves_on must be YYYY-MM-DD dates")
        if not isinstance(p.get("price_at_prediction"), (int, float)) or p.get("price_at_prediction", 0) <= 0:
            errors.append(f"{pid}: price_at_prediction must be a positive number")
        check_range(errors, pid, "ai", p.get("ai"))
        check_range(errors, pid, "baseline", p.get("baseline"))
        base = p.get("baseline") or {}
        if base.get("method") not in BASELINE_METHODS:
            errors.append(f"{pid}: baseline.method must be one of {sorted(BASELINE_METHODS)}")
        if p.get("blind"):
            lock = locks.get(pid)
            ai = p.get("ai") or {}
            if not lock:
                errors.append(f"{pid}: blind=true needs an entry in data/locks.json committed before the baseline")
            elif any(lock.get(k) != ai.get(k) for k in ("low", "high", "prob_up")):
                errors.append(f"{pid}: ai range differs from its lock in data/locks.json")
            else:
                locked_at = lock.get("locked_at")
                pulled = (p.get("baseline") or {}).get("iv_updated_at")
                if not locked_at:
                    errors.append(f"{pid}: lock has no locked_at timestamp")
                elif pulled and locked_at >= pulled:
                    errors.append(f"{pid}: lock ({locked_at}) must be earlier than the IV pull ({pulled})")
        prob = (p.get("ai") or {}).get("prob_up")
        if prob is not None and not (isinstance(prob, (int, float)) and 0 <= prob <= 1):
            errors.append(f"{pid}: ai.prob_up must be between 0 and 1")
    return errors


EVENT_TYPES = {"scheduled", "shock", "watch"}
WATCH_STATUS = {"rumor", "reported", "disputed"}
WATCH_DIRECTION = {"bull", "bear", "mixed"}
EVENT_KINDS = {"fed", "macro", "earnings", "market", "shock", "politics"}


IMPACT_CONFIDENCE = {"low", "medium"}


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def validate_watch_extras(eid, e):
    errors = []
    if "market_prob" in e:
        mp = e["market_prob"]
        if not (_num(mp) and 0 <= mp <= 1):
            errors.append(f"{eid}: market_prob must be a number between 0 and 1")
        if e.get("market_prob_bound", "max") not in ("max", "exact"):
            errors.append(f"{eid}: market_prob_bound must be max or exact")
    for key in ("resolves_if", "short"):
        if key in e and not (isinstance(e[key], str) and e[key].strip()):
            errors.append(f"{eid}: {key} must be a non-empty string")
    if "checked" in e:
        try:
            parse_date(e["checked"])
        except (TypeError, ValueError):
            errors.append(f"{eid}: checked must be a YYYY-MM-DD date")
    imp = e.get("impact")
    if imp is None:
        return errors
    if not isinstance(imp, dict):
        return errors + [f"{eid}: impact must be an object"]
    if imp.get("confidence") not in IMPACT_CONFIDENCE:
        errors.append(f"{eid}: impact.confidence must be one of {sorted(IMPACT_CONFIDENCE)}")
    if not (isinstance(imp.get("basis"), str) and imp["basis"].strip()):
        errors.append(f"{eid}: impact.basis must say where the range comes from")
    ranges = imp.get("ranges")
    if not isinstance(ranges, dict) or "SPY" not in ranges:
        errors.append(f"{eid}: impact.ranges must be an object that includes SPY")
    else:
        for sym, r in ranges.items():
            ok = isinstance(r, list) and len(r) == 2 and all(_num(x) for x in r) and r[0] <= r[1] and all(-50 <= x <= 50 for x in r)
            if not ok:
                errors.append(f"{eid}: impact.ranges.{sym} must be [low, high] in percent, low <= high")
    for s in imp.get("sources", []):
        if not str(s.get("url", "")).startswith("https://"):
            errors.append(f"{eid}: every impact source needs an https url")
    return errors


def validate_events(doc):
    errors = []
    events = doc.get("events", []) if isinstance(doc, dict) else None
    if events is None:
        return ["events.json must be an object with an events list"]
    for i, e in enumerate(events):
        eid = f"event #{i} ({e.get('title', '?')})"
        if e.get("type") not in EVENT_TYPES:
            errors.append(f"{eid}: type must be one of {sorted(EVENT_TYPES)}")
        if e.get("kind") not in EVENT_KINDS:
            errors.append(f"{eid}: kind must be one of {sorted(EVENT_KINDS)}")
        if not e.get("title"):
            errors.append(f"{eid}: missing title")
        for key in ("date", "end_date"):
            if key in e:
                try:
                    parse_date(e[key])
                except (TypeError, ValueError):
                    errors.append(f"{eid}: {key} must be a YYYY-MM-DD date")
        for src in e.get("sources", []):
            if not str(src.get("url", "")).startswith("https://"):
                errors.append(f"{eid}: every source needs an https url")
        if e.get("type") == "watch":
            if e.get("status") not in WATCH_STATUS:
                errors.append(f"{eid}: status must be one of {sorted(WATCH_STATUS)}")
            if e.get("direction") not in WATCH_DIRECTION:
                errors.append(f"{eid}: direction must be one of {sorted(WATCH_DIRECTION)}")
            prob = e.get("prob")
            if not (isinstance(prob, (int, float)) and not isinstance(prob, bool) and 0 <= prob <= 1):
                errors.append(f"{eid}: prob must be a number between 0 and 1")
            try:
                parse_date(e.get("by"))
            except (TypeError, ValueError):
                errors.append(f"{eid}: by must be a YYYY-MM-DD date the item is judged on")
        if e.get("type") == "watch":
            errors += validate_watch_extras(eid, e)
        if not e.get("sources") and not e.get("note"):
            errors.append(f"{eid}: needs a source link or a note saying where the date came from")
    return errors


def main():
    errors = validate(load("predictions.json", []), load("locks.json", {}))
    errors += validate_events(load("events.json", {"events": []}))
    for e in errors:
        print("ERROR:", e)
    if errors:
        sys.exit(1)
    print("predictions.json and events.json OK")


if __name__ == "__main__":
    main()
