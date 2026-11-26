"""Pre-flight for blind predictions: confirm locks are public on GitHub BEFORE pulling option data.

Usage: python scripts/verify_lock_published.py ID [ID ...] [--repo owner/name] [--branch main]

Fetches data/locks.json from the raw GitHub URL (no auth, bypasses local state) and checks
every ID is present with low, high, prob_up and locked_at. Exit 0 = safe to pull IV;
exit 1 = do NOT pull yet (the lock commit has not landed).
"""
import argparse
import json
import sys
import urllib.request

REQUIRED = ("low", "high", "prob_up", "locked_at")


def check(locks, ids):
    problems = []
    for pid in ids:
        entry = locks.get(pid)
        if not entry:
            problems.append(f"{pid}: not in published locks.json")
            continue
        missing = [k for k in REQUIRED if entry.get(k) is None]
        if missing:
            problems.append(f"{pid}: lock missing {', '.join(missing)}")
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("ids", nargs="+")
    ap.add_argument("--repo", default="QuocHHDo/outlook-lab")
    ap.add_argument("--branch", default="main")
    args = ap.parse_args()
    url = f"https://raw.githubusercontent.com/{args.repo}/{args.branch}/data/locks.json"
    with urllib.request.urlopen(url, timeout=20) as resp:
        locks = json.load(resp)
    problems = check(locks, args.ids)
    for line in problems:
        print("FAIL", line)
    if problems:
        sys.exit(1)
    print(f"OK: {len(args.ids)} lock(s) are published; safe to pull option data.")


if __name__ == "__main__":
    main()
