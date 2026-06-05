"""Positions and account status (live from broker)."""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.config import settings
from app.core.markets import Market, get_market, meta
from app.core.schemas import AccountRead, PositionRead
from app.core.security import get_current_user
from app.core.models import TradingMode
from app.services.broker import AlpacaError, get_broker
from app.services.control import is_strategies_enabled, is_trading_enabled

router = APIRouter(tags=["Account"])


@router.get("/account", response_model=AccountRead)
async def get_account(
    market: str = Query(default="us", description="us | in"),
    user: str = Depends(get_current_user),
) -> AccountRead:
    mkt = get_market(market)
    broker = get_broker(mkt)
    try:
        acct = await broker.get_account()
        positions = await broker.get_positions()
    except AlpacaError as e:
        raise HTTPException(status_code=503, detail=f"Broker unavailable: {e}")

    equity = Decimal(acct.get("equity", "0"))
    last_equity = Decimal(acct.get("last_equity", "0"))
    day_pl = equity - last_equity if last_equity > 0 else None

    # Indian (and any simulated) market is always paper.
    is_live = settings.is_live_trading and mkt == Market.US

    return AccountRead(
        mode=TradingMode.LIVE if is_live else TradingMode.PAPER,
        market=mkt.value,
        currency=meta(mkt)["currency"],
        cash=Decimal(acct.get("cash", "0")),
        equity=equity,
        buying_power=Decimal(acct.get("buying_power", "0")),
        positions_count=len(positions),
        day_pl=day_pl,
        total_pl=None,  # Could compute from snapshots
        trading_enabled=await is_trading_enabled(),
        strategies_enabled=await is_strategies_enabled(),
    )


@router.get("/positions", response_model=list[dict])
async def get_positions(
    market: str = Query(default="us", description="us | in"),
    user: str = Depends(get_current_user),
) -> list[dict]:
    """Live positions from broker — not from local DB."""
    broker = get_broker(get_market(market))
    try:
        positions = await broker.get_positions()
    except AlpacaError as e:
        raise HTTPException(status_code=503, detail=f"Broker unavailable: {e}")

    return [
        {
            "symbol": p.get("symbol"),
            "qty": p.get("qty"),
            "avg_entry_price": p.get("avg_entry_price"),
            "current_price": p.get("current_price"),
            "market_value": p.get("market_value"),
            "unrealized_pl": p.get("unrealized_pl"),
            "unrealized_plpc": p.get("unrealized_plpc"),
            "side": p.get("side"),
        }
        for p in positions
    ]
