"""
Risk analytics service.

Computes:
  - Portfolio correlation matrix
  - Value at Risk (VaR) at 95% confidence
  - Beta vs SPY
  - Concentration risk (largest position % of portfolio)
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.services.broker import AlpacaError, get_broker
from app.services.market_data import get_bars_df

logger = get_logger(__name__)


async def compute_portfolio_risk(db: AsyncSession, lookback_days: int = 90) -> dict[str, Any]:
    """Compute risk metrics for current portfolio."""
    broker = get_broker()
    try:
        positions = await broker.get_positions()
        account = await broker.get_account()
    except AlpacaError as e:
        return {"error": str(e)}

    if not positions:
        return {
            "positions_count": 0,
            "concentration": {},
            "correlation": [],
            "var_95_dollars": 0.0,
            "var_95_pct": 0.0,
            "beta_vs_spy": None,
        }

    equity = float(account.get("equity", 0))
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=lookback_days)

    # ── Concentration ────────────────────────────────────────
    concentration = {}
    for p in positions:
        sym = p.get("symbol")
        mv = float(p.get("market_value", 0))
        concentration[sym] = round((mv / equity * 100) if equity > 0 else 0, 2)

    # ── Returns DataFrame for each symbol ────────────────────
    symbols = [p["symbol"] for p in positions]
    returns_dict: dict[str, pd.Series] = {}
    for sym in symbols:
        df = await get_bars_df(db, symbol=sym, timeframe="1d", start=start, end=end)
        if len(df) < 30:
            continue
        df = df.sort_values("time")
        df["ret"] = df["close"].pct_change()
        returns_dict[sym] = df["ret"].dropna().reset_index(drop=True)

    # ── Correlation matrix ───────────────────────────────────
    correlation: list[dict] = []
    if len(returns_dict) >= 2:
        # Align lengths to shortest
        min_len = min(len(s) for s in returns_dict.values())
        aligned = {k: v.tail(min_len).reset_index(drop=True) for k, v in returns_dict.items()}
        df_corr = pd.DataFrame(aligned).corr()

        for s1 in df_corr.index:
            for s2 in df_corr.columns:
                correlation.append({
                    "symbol_a": s1,
                    "symbol_b": s2,
                    "correlation": round(float(df_corr.loc[s1, s2]), 4),
                })

    # ── VaR 95% (parametric) ─────────────────────────────────
    var_95_dollars = 0.0
    var_95_pct = 0.0
    portfolio_returns = []
    if returns_dict:
        # Weighted portfolio returns
        weights = {sym: float(p.get("market_value", 0)) / equity
                   for p, sym in zip(positions, symbols)
                   if equity > 0 and sym in returns_dict}
        min_len = min(len(s) for s in returns_dict.values())
        port_rets = sum(
            (returns_dict[sym].tail(min_len).reset_index(drop=True) * w)
            for sym, w in weights.items()
        )
        if isinstance(port_rets, pd.Series) and len(port_rets) > 5:
            mean = port_rets.mean()
            std = port_rets.std()
            var_95_pct = round(float(abs(mean - 1.645 * std) * 100), 4)
            var_95_dollars = round(var_95_pct / 100 * equity, 2)
            portfolio_returns = port_rets.tolist()

    # ── Beta vs SPY ──────────────────────────────────────────
    beta = None
    spy_df = await get_bars_df(db, symbol="SPY", timeframe="1d", start=start, end=end)
    if len(spy_df) >= 30 and portfolio_returns:
        spy_df = spy_df.sort_values("time")
        spy_rets = spy_df["close"].pct_change().dropna().reset_index(drop=True)
        n = min(len(spy_rets), len(portfolio_returns))
        if n > 5:
            cov = np.cov(portfolio_returns[-n:], spy_rets.tail(n))[0, 1]
            spy_var = np.var(spy_rets.tail(n))
            if spy_var > 0:
                beta = round(float(cov / spy_var), 4)

    return {
        "positions_count": len(positions),
        "concentration": concentration,
        "correlation": correlation,
        "var_95_dollars": var_95_dollars,
        "var_95_pct": var_95_pct,
        "beta_vs_spy": beta,
        "lookback_days": lookback_days,
    }
