"""Shared helpers: paths and JSON load/save. Standard library only."""
import json
import pathlib
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# Horizon labels the project uses. Calendar days are only a guide: each
# prediction stores its own resolves_on date (e.g. the matching option expiry).
HORIZONS = {"1w": 7, "1m": 30, "3m": 91, "6m": 182, "1y": 365, "5y": 1826}

DEFAULT_SYMBOLS = ["SPY", "QQQ", "SMH", "IWM", "XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "XLB", "XLU", "XLRE", "XLC", "TLT", "GLD", "EFA", "EEM", "HYG", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "JPM",
                   "BRK.B", "LLY", "JNJ", "XOM", "WMT", "GE", "RTX", "LIN", "NEE", "PLD", "SLV", "IEF", "IBIT", "ORCL", "MU", "AMD", "XBI", "KRE", "ITB", "USO", "UNH", "V"]


def load(name, default):
    path = DATA / name
    if not path.exists():
        return default
    return json.loads(path.read_text())


def save(name, obj):
    DATA.mkdir(exist_ok=True)
    (DATA / name).write_text(json.dumps(obj, indent=2, allow_nan=False) + "\n")


def parse_date(text):
    return date.fromisoformat(text)
