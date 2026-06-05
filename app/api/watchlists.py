"""Watchlist CRUD — create, read, update, delete, and fetch live quotes."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.models import Watchlist
from app.core.schemas import WatchlistCreate, WatchlistRead, WatchlistUpdate
from app.core.security import get_current_user
from app.services.broker import AlpacaError, get_broker

router = APIRouter(prefix="/watchlists", tags=["Watchlists"])


@router.post("", response_model=WatchlistRead, status_code=201)
async def create_watchlist(
    payload: WatchlistCreate,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> Watchlist:
    wl = Watchlist(
        name=payload.name,
        owner=user,
        symbols=[s.upper() for s in payload.symbols],
    )
    db.add(wl)
    await db.flush()
    await db.refresh(wl)
    return wl


@router.get("", response_model=list[WatchlistRead])
async def list_watchlists(
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> list[Watchlist]:
    result = await db.execute(
        select(Watchlist).where(Watchlist.owner == user).order_by(Watchlist.created_at.asc())
    )
    return list(result.scalars().all())


@router.get("/{watchlist_id}", response_model=WatchlistRead)
async def get_watchlist(
    watchlist_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> Watchlist:
    result = await db.execute(select(Watchlist).where(Watchlist.id == watchlist_id))
    wl = result.scalar_one_or_none()
    if not wl or wl.owner != user:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    return wl


@router.patch("/{watchlist_id}", response_model=WatchlistRead)
async def update_watchlist(
    watchlist_id: UUID,
    payload: WatchlistUpdate,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> Watchlist:
    result = await db.execute(select(Watchlist).where(Watchlist.id == watchlist_id))
    wl = result.scalar_one_or_none()
    if not wl or wl.owner != user:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    if payload.name is not None:
        wl.name = payload.name
    if payload.symbols is not None:
        wl.symbols = [s.upper() for s in payload.symbols]
    await db.flush()
    await db.refresh(wl)
    return wl


@router.delete("/{watchlist_id}", status_code=204)
async def delete_watchlist(
    watchlist_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> None:
    result = await db.execute(select(Watchlist).where(Watchlist.id == watchlist_id))
    wl = result.scalar_one_or_none()
    if not wl or wl.owner != user:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    await db.delete(wl)
    await db.flush()


@router.get("/{watchlist_id}/quotes")
async def get_watchlist_quotes(
    watchlist_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> dict:
    """Return live snapshots (price, bid, ask, volume) for all symbols in a watchlist."""
    result = await db.execute(select(Watchlist).where(Watchlist.id == watchlist_id))
    wl = result.scalar_one_or_none()
    if not wl or wl.owner != user:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    if not wl.symbols:
        return {"watchlist_id": str(watchlist_id), "quotes": {}}

    # Route per-symbol by exchange suffix: Alpaca for US, yfinance for India.
    from app.core.markets import Market, detect_market
    from app.services import india_market as india
    syms = [s.upper() for s in wl.symbols]
    in_syms = [s for s in syms if detect_market(s) == Market.IN]
    us_syms = [s for s in syms if detect_market(s) == Market.US]
    snapshots: dict = {}
    if in_syms:
        snapshots.update(await india.get_snapshots(in_syms))
    if us_syms:
        try:
            snapshots.update(await get_broker().get_snapshots(us_syms))
        except AlpacaError as e:
            raise HTTPException(status_code=502, detail=f"Broker error: {e}")

    quotes = {}
    for sym, snap in snapshots.items():
        latest_trade = snap.get("latestTrade") or {}
        latest_quote = snap.get("latestQuote") or {}
        daily_bar = snap.get("dailyBar") or {}
        quotes[sym] = {
            "price": latest_trade.get("p"),
            "bid": latest_quote.get("bp"),
            "ask": latest_quote.get("ap"),
            "volume": daily_bar.get("v"),
            "open": daily_bar.get("o"),
            "high": daily_bar.get("h"),
            "low": daily_bar.get("l"),
            "close": daily_bar.get("c"),
            "change_pct": (
                round((latest_trade.get("p", 0) - daily_bar.get("o", 0))
                      / daily_bar.get("o", 1) * 100, 2)
                if daily_bar.get("o") else None
            ),
        }

    return {"watchlist_id": str(watchlist_id), "name": wl.name, "quotes": quotes}
