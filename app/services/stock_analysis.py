"""
Holistic stock analysis service.

Combines price history (Alpaca bars), fundamentals (yfinance), and analyst
data into a single payload covering returns, technicals, risk, factor scoring,
seasonality, and earnings track record.

Math:
  - Returns:    pct change between trailing horizons
  - Volatility: annualised stdev of daily returns (sqrt(252))
  - Sharpe:    mean_daily_return / std * sqrt(252), rf=0
  - Sortino:   mean_daily_return / downside_std * sqrt(252)
  - Drawdown:  min((cummax - close) / cummax)
  - Beta:      cov(stock, SPY) / var(SPY) on daily returns
  - RSI:       Wilder's smoothed 14-period
  - MACD:      EMA12 - EMA26; signal = EMA9 of MACD
  - Score:     5-factor composite (value/growth/momentum/quality/stability)
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.core.logging import get_logger
from app.services import fundamentals as fund
from app.core.markets import benchmark_for

logger = get_logger(__name__)

BENCHMARK = "SPY"
TRADING_DAYS = 252


# ── Peer-group map ────────────────────────────────────────────────
# Curated by sector. Used as the universe for percentile ranking.
SECTOR_PEERS: dict[str, list[str]] = {
    "Technology": [
        "AAPL", "MSFT", "NVDA", "AVGO", "ORCL", "CRM", "ADBE", "AMD", "INTC",
        "CSCO", "QCOM", "TXN", "IBM", "NOW", "INTU", "PANW", "MU", "AMAT", "ADI",
    ],
    "Consumer Cyclical": [
        "AMZN", "TSLA", "HD", "MCD", "NKE", "LOW", "SBUX", "BKNG", "TJX", "CMG",
        "F", "GM", "LULU", "ABNB", "DRI",
    ],
    "Communication Services": [
        "GOOGL", "GOOG", "META", "NFLX", "DIS", "CMCSA", "TMUS", "VZ", "T", "CHTR",
        "EA", "TTWO", "WBD",
    ],
    "Financial Services": [
        "JPM", "BAC", "WFC", "GS", "MS", "BLK", "C", "AXP", "SCHW", "V", "MA",
        "PYPL", "COF", "USB", "PNC", "TFC",
    ],
    "Healthcare": [
        "UNH", "JNJ", "LLY", "PFE", "ABBV", "MRK", "TMO", "ABT", "DHR", "BMY",
        "AMGN", "GILD", "CVS", "ELV", "ISRG",
    ],
    "Consumer Defensive": [
        "WMT", "PG", "KO", "PEP", "COST", "MDLZ", "PM", "CL", "MO", "TGT",
        "KMB", "GIS", "SYY",
    ],
    "Energy": ["XOM", "CVX", "COP", "SLB", "EOG", "PSX", "MPC", "VLO", "OXY", "WMB"],
    "Industrials": [
        "CAT", "BA", "HON", "GE", "UPS", "RTX", "LMT", "UNP", "DE", "MMM",
        "NOC", "GD", "ETN", "ITW", "EMR",
    ],
    "Utilities": ["NEE", "SO", "DUK", "AEP", "SRE", "D", "EXC", "XEL", "PCG"],
    "Real Estate": ["PLD", "AMT", "EQIX", "CCI", "O", "PSA", "SPG", "WELL"],
    "Basic Materials": ["LIN", "SHW", "APD", "FCX", "NEM", "DOW", "ECL", "CTVA"],
}


# Metrics used for peer ranking. `higher_is_better` controls percentile direction.
PEER_METRICS = [
    ("trailingPE",                       "P/E (TTM)",       False),
    ("forwardPE",                        "P/E (Fwd)",       False),
    ("priceToBook",                      "P/B",             False),
    ("priceToSalesTrailing12Months",     "P/S",             False),
    ("pegRatio",                         "PEG",             False),
    ("dividendYield",                    "Div Yield",       True),
    ("profitMargins",                    "Profit Margin",   True),
    ("operatingMargins",                 "Op Margin",       True),
    ("returnOnEquity",                   "ROE",             True),
    ("returnOnAssets",                   "ROA",             True),
    ("revenueGrowth",                    "Rev Growth",      True),
    ("earningsGrowth",                   "EPS Growth",      True),
    ("debtToEquity",                     "D/E",             False),
    ("beta",                             "Beta",            False),
]


def _clean(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if hasattr(v, "item"):
        try:
            x = v.item()
            if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
                return None
            return x
        except Exception:
            pass
    return v


async def _fetch_bars(symbol: str, days: int = 365 * 6, market=None) -> pd.DataFrame:
    """Pull daily bars (market-aware: Alpaca for US, yfinance for IN)."""
    from app.services.market_data import get_price_bars
    bars = await get_price_bars(symbol, days=days, timeframe="1Day", market=market)
    if not bars:
        return pd.DataFrame()
    df = pd.DataFrame(bars)
    df["t"] = pd.to_datetime(df["t"], utc=True)
    df = df.sort_values("t").set_index("t")
    df = df.rename(columns={"o": "open", "h": "high", "l": "low", "c": "close", "v": "volume"})
    df = df[["open", "high", "low", "close", "volume"]].astype(float)
    return df


# ── Returns ───────────────────────────────────────────────────────
def _returns_table(close: pd.Series) -> dict[str, float | None]:
    if close.empty:
        return {}
    today = close.iloc[-1]

    def pct(n: int) -> float | None:
        if len(close) <= n:
            return None
        prev = close.iloc[-1 - n]
        if prev == 0 or not np.isfinite(prev):
            return None
        return float((today - prev) / prev * 100)

    ytd: float | None = None
    if not close.empty:
        year = close.index[-1].year
        in_year = close[close.index.year == year]
        if len(in_year) > 1:
            first_open = in_year.iloc[0]
            if first_open and np.isfinite(first_open):
                ytd = float((today - first_open) / first_open * 100)

    max_ret: float | None = None
    if len(close) > 1:
        first = close.iloc[0]
        if first and np.isfinite(first):
            max_ret = float((today - first) / first * 100)

    return {
        "1d": pct(1),
        "5d": pct(5),
        "1m": pct(21),
        "3m": pct(63),
        "6m": pct(126),
        "ytd": ytd,
        "1y": pct(252),
        "3y": pct(252 * 3),
        "5y": pct(252 * 5),
        "max": max_ret,
    }


# ── Technicals ────────────────────────────────────────────────────
def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    # Wilder's smoothing
    avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _macd(close: pd.Series) -> tuple[pd.Series, pd.Series, pd.Series]:
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    hist = macd - signal
    return macd, signal, hist


def _bollinger(close: pd.Series, period: int = 20, mult: float = 2.0) -> tuple[pd.Series, pd.Series, pd.Series]:
    sma = close.rolling(period).mean()
    std = close.rolling(period).std()
    upper = sma + mult * std
    lower = sma - mult * std
    return upper, sma, lower


def _technicals(close: pd.Series, volume: pd.Series) -> dict[str, Any]:
    if len(close) < 50:
        return {}
    sma20 = close.rolling(20).mean()
    sma50 = close.rolling(50).mean()
    sma200 = close.rolling(200).mean() if len(close) >= 200 else pd.Series(dtype=float)
    rsi = _rsi(close)
    macd, signal, hist = _macd(close)
    bb_u, bb_m, bb_l = _bollinger(close)

    last = close.iloc[-1]
    rsi_last = _clean(rsi.iloc[-1]) if not rsi.empty else None
    macd_last = _clean(macd.iloc[-1])
    signal_last = _clean(signal.iloc[-1])
    hist_last = _clean(hist.iloc[-1])

    def at(s: pd.Series) -> float | None:
        if s.empty:
            return None
        v = s.iloc[-1]
        return _clean(v)

    sma20_v = at(sma20)
    sma50_v = at(sma50)
    sma200_v = at(sma200) if not sma200.empty else None

    bb_pos: float | None = None
    if at(bb_u) is not None and at(bb_l) is not None and bb_u.iloc[-1] != bb_l.iloc[-1]:
        bb_pos = float((last - bb_l.iloc[-1]) / (bb_u.iloc[-1] - bb_l.iloc[-1]) * 100)

    # Trend signal: combine MA cross + MACD direction
    trend = "neutral"
    if sma20_v and sma50_v:
        if last > sma20_v > sma50_v:
            trend = "bullish"
        elif last < sma20_v < sma50_v:
            trend = "bearish"

    # RSI signal
    rsi_signal = "neutral"
    if rsi_last is not None:
        if rsi_last >= 70:
            rsi_signal = "overbought"
        elif rsi_last <= 30:
            rsi_signal = "oversold"

    # Volume
    avg_vol_20 = volume.rolling(20).mean().iloc[-1] if len(volume) >= 20 else None
    rel_volume = float(volume.iloc[-1] / avg_vol_20) if avg_vol_20 else None

    return {
        "last_price": _clean(last),
        "sma20": sma20_v,
        "sma50": sma50_v,
        "sma200": sma200_v,
        "rsi14": rsi_last,
        "rsi_signal": rsi_signal,
        "macd": macd_last,
        "macd_signal": signal_last,
        "macd_hist": hist_last,
        "bb_upper": at(bb_u),
        "bb_middle": at(bb_m),
        "bb_lower": at(bb_l),
        "bb_position_pct": _clean(bb_pos),
        "trend": trend,
        "avg_volume_20d": _clean(avg_vol_20),
        "relative_volume": _clean(rel_volume),
        "above_sma200": bool(sma200_v and last > sma200_v) if sma200_v else None,
        "above_sma50": bool(sma50_v and last > sma50_v),
    }


# ── Risk ──────────────────────────────────────────────────────────
def _risk_stats(close: pd.Series, benchmark_close: pd.Series | None = None) -> dict[str, Any]:
    if len(close) < 30:
        return {}
    daily = close.pct_change().dropna()
    if daily.empty:
        return {}

    vol_ann = float(daily.std() * np.sqrt(TRADING_DAYS))
    mean_d = float(daily.mean())
    sharpe = float(mean_d / daily.std() * np.sqrt(TRADING_DAYS)) if daily.std() > 0 else None

    downside = daily[daily < 0]
    if not downside.empty and downside.std() > 0:
        sortino = float(mean_d / downside.std() * np.sqrt(TRADING_DAYS))
    else:
        sortino = None

    cummax = close.cummax()
    dd = (close - cummax) / cummax
    max_dd = float(dd.min()) if not dd.empty else None

    # Beta and correlation vs benchmark
    beta: float | None = None
    corr: float | None = None
    bench_daily: pd.Series | None = None
    if benchmark_close is not None and len(benchmark_close) > 30:
        bench_daily = benchmark_close.pct_change().dropna()
        # Align on intersection of indices
        common = daily.index.intersection(bench_daily.index)
        if len(common) > 30:
            a = daily.loc[common]
            b = bench_daily.loc[common]
            var_b = float(b.var())
            if var_b > 0:
                beta = float(np.cov(a, b)[0, 1] / var_b)
            corr = float(a.corr(b))

    # 95% historical VaR (1-day)
    var_95 = float(daily.quantile(0.05)) if not daily.empty else None

    return {
        "annualized_volatility_pct": vol_ann * 100,
        "sharpe": sharpe,
        "sortino": sortino,
        "max_drawdown_pct": (max_dd * 100) if max_dd is not None else None,
        "beta_vs_spy": beta,
        "correlation_vs_spy": corr,
        "var_95_daily_pct": (var_95 * 100) if var_95 is not None else None,
        "best_day_pct": float(daily.max() * 100) if not daily.empty else None,
        "worst_day_pct": float(daily.min() * 100) if not daily.empty else None,
        "positive_days_pct": float((daily > 0).sum() / len(daily) * 100),
    }


# ── Seasonality ───────────────────────────────────────────────────
def _seasonality(close: pd.Series, lookback_years: int = 5) -> dict[str, Any]:
    if close.empty:
        return {}
    cutoff = close.index[-1] - pd.DateOffset(years=lookback_years)
    cut = close[close.index >= cutoff]
    monthly = cut.resample("ME").last().pct_change().dropna()
    if monthly.empty:
        return {}
    by_month: dict[int, list[float]] = {}
    for ts, ret in monthly.items():
        by_month.setdefault(ts.month, []).append(float(ret))
    rows = []
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    for m in range(1, 13):
        vals = by_month.get(m, [])
        if not vals:
            rows.append({"month": m, "name": month_names[m - 1], "avg_return_pct": None, "hit_rate_pct": None, "samples": 0})
            continue
        avg = float(np.mean(vals)) * 100
        hit = float((np.array(vals) > 0).sum() / len(vals)) * 100
        rows.append({
            "month": m, "name": month_names[m - 1],
            "avg_return_pct": avg, "hit_rate_pct": hit, "samples": len(vals),
        })
    return {"lookback_years": lookback_years, "months": rows}


# ── Composite factor score ────────────────────────────────────────
def _clip(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _scale(x: float | None, lo: float, hi: float) -> float:
    """Map [lo, hi] → [0, 100], clipping outside the band."""
    if x is None or not np.isfinite(x):
        return 50.0
    return float(_clip((x - lo) / (hi - lo), 0, 1) * 100)


def _composite_score(
    profile: dict[str, Any],
    returns: dict[str, Any],
    risk: dict[str, Any],
    technicals: dict[str, Any],
) -> dict[str, Any]:
    # Value: lower P/E and P/B are better; dividend yield is a bonus.
    pe = profile.get("trailingPE") or profile.get("forwardPE")
    pb = profile.get("priceToBook")
    dy = profile.get("dividendYield")
    value_parts = []
    if pe is not None:
        value_parts.append(_scale(-pe, -50, -5))  # invert: lower PE → higher score
    if pb is not None:
        value_parts.append(_scale(-pb, -10, -0.5))
    if dy is not None:
        value_parts.append(_scale(dy, 0, 0.05))
    value = float(np.mean(value_parts)) if value_parts else 50.0

    # Growth: revenue + earnings growth.
    rev_g = profile.get("revenueGrowth")
    earn_g = profile.get("earningsGrowth")
    growth_parts = []
    if rev_g is not None:
        growth_parts.append(_scale(rev_g, -0.1, 0.4))
    if earn_g is not None:
        growth_parts.append(_scale(earn_g, -0.2, 0.5))
    growth = float(np.mean(growth_parts)) if growth_parts else 50.0

    # Quality: margins + return on equity.
    pm = profile.get("profitMargins")
    om = profile.get("operatingMargins")
    roe = profile.get("returnOnEquity")
    quality_parts = []
    if pm is not None:
        quality_parts.append(_scale(pm, -0.1, 0.3))
    if om is not None:
        quality_parts.append(_scale(om, -0.1, 0.4))
    if roe is not None:
        quality_parts.append(_scale(roe, -0.1, 0.4))
    quality = float(np.mean(quality_parts)) if quality_parts else 50.0

    # Momentum: 6m return + relative position above SMA50/200 + RSI band.
    momentum_parts = []
    if returns.get("6m") is not None:
        momentum_parts.append(_scale(returns["6m"], -25, 40))
    if returns.get("1y") is not None:
        momentum_parts.append(_scale(returns["1y"], -30, 60))
    if technicals.get("above_sma50") is True:
        momentum_parts.append(70)
    elif technicals.get("above_sma50") is False:
        momentum_parts.append(30)
    momentum = float(np.mean(momentum_parts)) if momentum_parts else 50.0

    # Stability: lower vol + smaller drawdown + higher Sharpe → higher score.
    stability_parts = []
    vol = risk.get("annualized_volatility_pct")
    if vol is not None:
        stability_parts.append(_scale(-vol, -80, -15))
    dd = risk.get("max_drawdown_pct")
    if dd is not None:
        stability_parts.append(_scale(dd, -60, -10))  # dd is negative, less negative is better
    sh = risk.get("sharpe")
    if sh is not None:
        stability_parts.append(_scale(sh, -1, 2))
    stability = float(np.mean(stability_parts)) if stability_parts else 50.0

    overall = float(np.mean([value, growth, quality, momentum, stability]))
    return {
        "overall": round(overall, 1),
        "value": round(value, 1),
        "growth": round(growth, 1),
        "quality": round(quality, 1),
        "momentum": round(momentum, 1),
        "stability": round(stability, 1),
        "verdict": (
            "Strong" if overall >= 70
            else "Above Average" if overall >= 55
            else "Average" if overall >= 45
            else "Below Average" if overall >= 30
            else "Weak"
        ),
    }


# ── Main orchestrator ─────────────────────────────────────────────
async def get_full_analysis(symbol: str) -> dict[str, Any]:
    sym = symbol.upper()
    df, df_bench, profile, analysts = await _gather(sym)

    if df.empty:
        return {"symbol": sym, "error": "No price history available."}

    close = df["close"]
    vol = df["volume"]
    bench_close = df_bench["close"] if not df_bench.empty else None

    returns = _returns_table(close)
    technicals = _technicals(close, vol)
    risk = _risk_stats(close, bench_close)
    seasonality = _seasonality(close)

    # Benchmark returns for side-by-side
    bench_returns = _returns_table(bench_close) if bench_close is not None else {}

    score = _composite_score(profile or {}, returns, risk, technicals)

    # Analyst target distance from current
    last = float(close.iloc[-1])
    target_pct: dict[str, float | None] = {}
    for k in ("target_low", "target_mean", "target_high", "target_median"):
        v = (analysts or {}).get(k)
        if v is not None and last > 0:
            target_pct[f"{k}_upside_pct"] = float((v - last) / last * 100)
        else:
            target_pct[f"{k}_upside_pct"] = None

    # Layered analyses — run in parallel since each is independent.
    import asyncio
    peer_task = compute_peer_ranking(sym, profile)
    drift_task = compute_post_earnings_drift(sym, df)
    implied_task = compute_implied_move(sym, last)
    insider_task = compute_insider_flow(sym)

    peer_ranking, drift, implied, insider = await asyncio.gather(
        peer_task, drift_task, implied_task, insider_task,
        return_exceptions=True,
    )

    def _safe(v, fallback):
        return fallback if isinstance(v, Exception) else v

    return {
        "symbol": sym,
        "as_of": close.index[-1].isoformat(),
        "last_price": last,
        "profile": profile,
        "score": score,
        "returns": returns,
        "benchmark_returns": bench_returns,
        "benchmark_symbol": benchmark_for(sym),
        "technicals": technicals,
        "risk": risk,
        "seasonality": seasonality,
        "analyst_targets": {**(analysts or {}), **target_pct},
        "peer_ranking": _safe(peer_ranking, {"rankings": []}),
        "post_earnings_drift": _safe(drift, {"events": 0}),
        "implied_move": _safe(implied, {"implied_move_pct": None}),
        "insider_flow": _safe(insider, {"verdict": "unknown"}),
    }


def _peers_for(sector: str | None, symbol: str) -> list[str]:
    """Return peer list for sector, excluding the target symbol."""
    if not sector:
        return []
    peers = SECTOR_PEERS.get(sector, [])
    return [s for s in peers if s.upper() != symbol.upper()]


def _percentile(value: float, values: list[float], higher_is_better: bool) -> float | None:
    """Percentile of `value` within `values` (0–100). Returns None if no data."""
    clean = [v for v in values if v is not None and np.isfinite(v)]
    if value is None or not np.isfinite(value) or not clean:
        return None
    rank = sum(1 for v in clean if v < value) + 0.5 * sum(1 for v in clean if v == value)
    pct = rank / len(clean) * 100
    return pct if higher_is_better else (100 - pct)


async def compute_peer_ranking(symbol: str, profile: dict[str, Any] | None) -> dict[str, Any]:
    import asyncio

    if not profile:
        return {"sector": None, "peers": [], "rankings": []}
    sector = profile.get("sector")
    peers = _peers_for(sector, symbol)
    if not peers:
        return {"sector": sector, "peers": [], "rankings": []}

    # Fetch all peer profiles in parallel — they're cached so subsequent calls are cheap.
    profiles = await asyncio.gather(
        *[fund.get_profile(p) for p in peers],
        return_exceptions=True,
    )
    peer_data: list[dict[str, Any]] = []
    for p in profiles:
        if isinstance(p, Exception) or not isinstance(p, dict):
            continue
        peer_data.append(p)

    rankings: list[dict[str, Any]] = []
    for key, label, higher in PEER_METRICS:
        my_val = profile.get(key)
        peer_vals = [pd.get(key) for pd in peer_data]
        pct = _percentile(
            float(my_val) if my_val is not None else None,
            [float(v) for v in peer_vals if v is not None],
            higher,
        )
        rankings.append({
            "metric": label,
            "key": key,
            "value": _clean(my_val),
            "percentile": round(pct, 1) if pct is not None else None,
            "higher_is_better": higher,
            "peer_min": _clean(min((v for v in peer_vals if v is not None), default=None)),
            "peer_max": _clean(max((v for v in peer_vals if v is not None), default=None)),
            "peer_median": _clean(
                float(np.median([v for v in peer_vals if v is not None]))
                if any(v is not None for v in peer_vals) else None
            ),
        })

    return {
        "sector": sector,
        "peer_count": len(peer_data),
        "peers": [p.get("symbol") for p in peer_data],
        "rankings": rankings,
    }


async def compute_post_earnings_drift(
    symbol: str, df: pd.DataFrame
) -> dict[str, Any]:
    """Average T+1, T+5, T+20 returns following past earnings, grouped by beat/miss."""
    if df.empty:
        return {"events": 0, "beat": None, "miss": None}

    try:
        surprise = await fund.get_earnings_surprise(symbol)
    except Exception:
        return {"events": 0, "beat": None, "miss": None}

    history = surprise.get("history") or []
    closes = df["close"]

    beat_returns: dict[str, list[float]] = {"t1": [], "t5": [], "t20": []}
    miss_returns: dict[str, list[float]] = {"t1": [], "t5": [], "t20": []}
    events = 0

    for row in history:
        q = row.get("quarter")
        if not isinstance(q, str):
            continue
        try:
            event_ts = pd.Timestamp(q, tz="UTC")
        except Exception:
            continue

        # Find first bar on/after event date
        future = closes[closes.index >= event_ts]
        if len(future) < 2:
            continue
        # Use index 0 (announcement-day close) as baseline
        base = future.iloc[0]
        if base == 0 or not np.isfinite(base):
            continue
        events += 1

        def ret_at(n: int) -> float | None:
            if len(future) <= n:
                return None
            v = future.iloc[n]
            if not np.isfinite(v):
                return None
            return float((v - base) / base * 100)

        r1, r5, r20 = ret_at(1), ret_at(5), ret_at(20)
        bucket = beat_returns if (row.get("surprise") or 0) > 0 else miss_returns
        if r1 is not None: bucket["t1"].append(r1)
        if r5 is not None: bucket["t5"].append(r5)
        if r20 is not None: bucket["t20"].append(r20)

    def summarise(group: dict[str, list[float]]) -> dict[str, Any]:
        return {
            "samples": len(group["t1"]),
            "avg_t1_pct": float(np.mean(group["t1"])) if group["t1"] else None,
            "avg_t5_pct": float(np.mean(group["t5"])) if group["t5"] else None,
            "avg_t20_pct": float(np.mean(group["t20"])) if group["t20"] else None,
        }

    return {
        "events": events,
        "beat": summarise(beat_returns),
        "miss": summarise(miss_returns),
    }


async def compute_implied_move(
    symbol: str, last_price: float
) -> dict[str, Any]:
    """ATM straddle-derived expected move for the next earnings-covering expiry."""
    sym = symbol.upper()
    try:
        expiries = await fund.get_option_expirations(sym)
    except Exception:
        expiries = []
    if not expiries or last_price is None or last_price <= 0:
        return {"expiry": None, "implied_move_pct": None, "implied_move_usd": None}

    # Pick the expiration that covers the next earnings date, if known
    target_date: pd.Timestamp | None = None
    try:
        earn = await fund.get_earnings_history(sym)
        upcoming = (earn or {}).get("upcoming") or []
        for u in upcoming:
            d = u.get("Earnings Date") or u.get("earnings_date") or u.get("index")
            if d:
                try:
                    target_date = pd.Timestamp(d).tz_convert("UTC")
                except Exception:
                    try:
                        target_date = pd.Timestamp(d, tz="UTC")
                    except Exception:
                        pass
                if target_date is not None and target_date > pd.Timestamp.now(tz="UTC"):
                    break
                target_date = None
    except Exception:
        target_date = None

    chosen_expiry: str | None = None
    if target_date is not None:
        for exp in expiries:
            try:
                exp_ts = pd.Timestamp(exp, tz="UTC")
            except Exception:
                continue
            if exp_ts >= target_date:
                chosen_expiry = exp
                break
    if chosen_expiry is None:
        # Fall back to the front-month expiration
        chosen_expiry = expiries[0]

    try:
        chain = await fund.get_option_chain(sym, chosen_expiry)
    except Exception:
        return {"expiry": chosen_expiry, "implied_move_pct": None, "implied_move_usd": None}

    calls = chain.get("calls") or []
    puts = chain.get("puts") or []
    if not calls or not puts:
        return {"expiry": chosen_expiry, "implied_move_pct": None, "implied_move_usd": None}

    def closest(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
        valid = [r for r in rows if r.get("strike") is not None]
        if not valid:
            return None
        return min(valid, key=lambda r: abs(float(r["strike"]) - last_price))

    atm_call = closest(calls)
    atm_put = closest(puts)
    if not atm_call or not atm_put:
        return {"expiry": chosen_expiry, "implied_move_pct": None, "implied_move_usd": None}

    def mid(r: dict[str, Any]) -> float | None:
        bid, ask = r.get("bid"), r.get("ask")
        if bid is not None and ask is not None and ask > 0:
            return (float(bid) + float(ask)) / 2
        last = r.get("lastPrice")
        return float(last) if last is not None else None

    call_mid = mid(atm_call)
    put_mid = mid(atm_put)
    if call_mid is None or put_mid is None:
        return {"expiry": chosen_expiry, "implied_move_pct": None, "implied_move_usd": None}

    move_usd = call_mid + put_mid
    move_pct = move_usd / last_price * 100

    return {
        "expiry": chosen_expiry,
        "atm_strike": _clean(atm_call.get("strike")),
        "call_mid": _clean(call_mid),
        "put_mid": _clean(put_mid),
        "implied_move_usd": float(move_usd),
        "implied_move_pct": float(move_pct),
        "next_earnings": target_date.isoformat() if target_date is not None else None,
        "expected_low": last_price - move_usd,
        "expected_high": last_price + move_usd,
    }


async def compute_insider_flow(symbol: str) -> dict[str, Any]:
    """Aggregate insider net buying/selling over 6m and 1y windows."""
    try:
        holders = await fund.get_holders(symbol)
    except Exception:
        return {"verdict": "unknown", "net_shares_6m": None, "net_value_6m": None}

    transactions = holders.get("insider_transactions") or []
    now = pd.Timestamp.now(tz="UTC")

    def window_metrics(months: int) -> dict[str, Any]:
        cutoff = now - pd.DateOffset(months=months)
        shares_buy = shares_sell = value_buy = value_sell = 0.0
        buys = sells = 0
        for t in transactions:
            # yfinance fields vary across versions; check a few common keys
            date_str = t.get("Start Date") or t.get("Date") or t.get("startDate") or t.get("date")
            if not date_str:
                continue
            try:
                ts = pd.Timestamp(date_str)
                if ts.tz is None:
                    ts = ts.tz_localize("UTC")
                else:
                    ts = ts.tz_convert("UTC")
            except Exception:
                continue
            if ts < cutoff:
                continue
            text_blob = " ".join(
                str(t.get(k) or "") for k in ("Transaction", "Text", "Position", "Title")
            ).lower()
            shares = t.get("Shares") or t.get("shares") or 0
            value = t.get("Value") or t.get("value") or 0
            try:
                shares = float(shares or 0)
                value = float(value or 0)
            except (TypeError, ValueError):
                continue
            is_sell = any(w in text_blob for w in ("sale", "sell", "disposition")) or shares < 0
            if is_sell:
                sells += 1
                shares_sell += abs(shares)
                value_sell += abs(value)
            else:
                buys += 1
                shares_buy += abs(shares)
                value_buy += abs(value)
        net_shares = shares_buy - shares_sell
        net_value = value_buy - value_sell
        return {
            "buys": buys,
            "sells": sells,
            "shares_bought": shares_buy,
            "shares_sold": shares_sell,
            "value_bought": value_buy,
            "value_sold": value_sell,
            "net_shares": net_shares,
            "net_value": net_value,
        }

    six_m = window_metrics(6)
    one_y = window_metrics(12)

    net_v = six_m["net_value"]
    if net_v == 0 and six_m["buys"] + six_m["sells"] == 0:
        verdict = "no_activity"
    elif net_v > 0:
        verdict = "net_buying"
    elif net_v < 0:
        verdict = "net_selling"
    else:
        verdict = "neutral"

    return {
        "transaction_count": len(transactions),
        "window_6m": six_m,
        "window_1y": one_y,
        "verdict": verdict,
    }


async def _gather(symbol: str):
    """Fetch bars + benchmark + profile + analyst data in parallel."""
    import asyncio

    from app.core.markets import detect_market
    bench = benchmark_for(symbol)
    df_task = _fetch_bars(symbol)
    bench_task = _fetch_bars(bench, market=detect_market(symbol))
    profile_task = fund.get_profile(symbol)
    analyst_task = fund.get_analyst_data(symbol)

    df, df_bench, profile, analysts = await asyncio.gather(
        df_task, bench_task, profile_task, analyst_task,
        return_exceptions=True,
    )

    if isinstance(df, Exception):
        logger.error("analysis_bars_failed", symbol=symbol, error=str(df))
        df = pd.DataFrame()
    if isinstance(df_bench, Exception):
        df_bench = pd.DataFrame()
    if isinstance(profile, Exception):
        profile = None
    if isinstance(analysts, Exception):
        analysts = None
    return df, df_bench, profile, analysts
