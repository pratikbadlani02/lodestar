#!/usr/bin/env python3
"""Market-regime check: decides whether to lean TREND-FOLLOWING (the saved
MACD 8/26/9 strategy) or BUY & HOLD, based on SPY trend, realized volatility,
and basket breadth.

Rationale (from the MSFT/basket walk-forward): trend-following earns its edge
in flat/choppy/stressed markets, while buy-and-hold wins in calm strong
uptrends. So we go defensive (trend-follow) when risk-off signals stack up.

Uses only public market-data endpoints — no credentials needed.

    python3 scripts/regime_check.py
    QP_API_BASE=https://lodestar-api.onrender.com/api python3 scripts/regime_check.py
"""
import json
import math
import os
import urllib.request

BASE = os.environ.get("QP_API_BASE", "http://localhost:8080/api")
BASKET = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "JPM", "SPY", "AMD"]
VOL_THRESHOLD = 18.0   # annualized %, above = elevated


def get_closes(symbol):
    url = f"{BASE}/market/ohlcv/{symbol}?days=400&timeframe=1d"
    with urllib.request.urlopen(url, timeout=30) as r:
        bars = json.loads(r.read()).get("bars", [])
    bars = sorted(bars, key=lambda b: str(b.get("t")))
    return [float(b["c"]) for b in bars if b.get("c") is not None]


def sma(xs, n):
    return sum(xs[-n:]) / n if len(xs) >= n else None


def realized_vol(closes, n=20):
    if len(closes) < n + 1:
        return None
    rets = [math.log(closes[i] / closes[i - 1]) for i in range(len(closes) - n, len(closes))]
    mean = sum(rets) / len(rets)
    var = sum((x - mean) ** 2 for x in rets) / (len(rets) - 1)
    return math.sqrt(var) * math.sqrt(252) * 100   # annualized %


def above_200dma(symbol):
    c = get_closes(symbol)
    s = sma(c, 200)
    if s is None or not c:
        return None
    return c[-1] > s


def main():
    print(f"Regime check · {BASE}\n")
    spy = get_closes("SPY")
    if len(spy) < 200:
        print(f"Not enough SPY history ({len(spy)} bars) — need 200. Seed data first.")
        return
    last = spy[-1]
    s50, s200 = sma(spy, 50), sma(spy, 200)
    vol = realized_vol(spy, 20)

    # Breadth: % of basket trading above its own 200-day average.
    flags = []
    for s in BASKET:
        try:
            flags.append(above_200dma(s))
        except Exception:
            flags.append(None)
    valid = [f for f in flags if f is not None]
    breadth = (sum(1 for f in valid if f) / len(valid) * 100) if valid else None

    # Score risk-off signals → 2+ means lean defensive (trend-follow).
    signals = []
    score = 0
    def add(cond, label_off, label_on, detail):
        nonlocal score
        if cond:
            score += 1
            signals.append((True, label_off, detail))
        else:
            signals.append((False, label_on, detail))

    add(last < s200, "SPY below 200DMA", "SPY above 200DMA", f"{last:.2f} vs {s200:.2f}")
    add(s50 < s200, "50DMA below 200DMA (death cross)", "50DMA above 200DMA (golden cross)", f"{s50:.2f} vs {s200:.2f}")
    add(vol is not None and vol > VOL_THRESHOLD, "Volatility elevated", "Volatility calm", f"{vol:.1f}% ann. (thr {VOL_THRESHOLD:.0f}%)")
    add(breadth is not None and breadth < 50, "Breadth weak", "Breadth strong", f"{breadth:.0f}% of basket > 200DMA")

    print(f"{'signal':<38}{'reading'}")
    for is_off, label, detail in signals:
        mark = "⚠ risk-off" if is_off else "✓ risk-on"
        print(f"  {mark:<11}{label:<34}{detail}")

    defensive = score >= 2
    print(f"\nRisk-off score: {score}/4")
    if defensive:
        print("REGIME: DEFENSIVE  →  lean TREND-FOLLOWING (run 'MACD Trend (8/26/9)')")
        print("  Trend-following adds value in choppy/stressed tape; it caps drawdowns vs buy&hold.")
    else:
        print("REGIME: RISK-ON  →  lean BUY & HOLD (stay fully invested)")
        print("  In calm strong uptrends, buy&hold beats systematic in-and-out trading.")


if __name__ == "__main__":
    main()
