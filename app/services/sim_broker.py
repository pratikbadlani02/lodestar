"""
Simulated broker for the Indian market (and any non-Alpaca market).

No live Indian broker is integrated, so Indian orders are filled against an
internal ledger persisted in Redis. Market orders fill immediately at the latest
yfinance close; limit orders fill at the limit price (treated as marketable for
simulation). The ledger exposes the same surface the risk gate, execution
service, and account API expect from :class:`AlpacaBroker` — ``get_account``,
``get_positions``, ``get_clock``, ``submit_order``, ``cancel_all_orders``,
``close_all_positions`` — so the existing order pipeline works unchanged.

State (per market) lives under Redis keys:
    sim:{mkt}:cash          → str(Decimal) available cash
    sim:{mkt}:last_equity   → str(Decimal) prior-session equity (for day P/L)
    sim:{mkt}:positions     → hash  symbol → json{qty, avg_price}
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from app.core.logging import get_logger
from app.core.markets import Market, get_market, meta
from app.services.broker import AlpacaError
from app.services.control import get_redis
from app.services.market_calendar import _nse_is_open, _nse_next_open
from app.services.market_data import get_last_price

logger = get_logger(__name__)

# Starting simulated cash per market (in that market's currency).
_SEED_CASH = {Market.IN: Decimal("1000000")}  # ₹10,00,000


class SimBroker:
    """Redis-backed paper broker for a single market."""

    def __init__(self, market: Market) -> None:
        self.market = get_market(market)
        self.currency = meta(self.market)["currency"]
        self._prefix = f"sim:{self.market.value}"

    # ── ledger helpers ──────────────────────────────────────────
    async def _ensure_seeded(self) -> None:
        r = await get_redis()
        if not await r.exists(f"{self._prefix}:cash"):
            seed = _SEED_CASH.get(self.market, Decimal("100000"))
            await r.set(f"{self._prefix}:cash", str(seed))
            await r.set(f"{self._prefix}:last_equity", str(seed))

    async def _get_cash(self) -> Decimal:
        await self._ensure_seeded()
        r = await get_redis()
        return Decimal(await r.get(f"{self._prefix}:cash") or "0")

    async def _set_cash(self, v: Decimal) -> None:
        r = await get_redis()
        await r.set(f"{self._prefix}:cash", str(v))

    async def _get_positions_raw(self) -> dict[str, dict]:
        r = await get_redis()
        h = await r.hgetall(f"{self._prefix}:positions")
        out: dict[str, dict] = {}
        for sym, blob in (h or {}).items():
            try:
                out[sym] = json.loads(blob)
            except (json.JSONDecodeError, TypeError):
                continue
        return out

    async def _save_position(self, symbol: str, qty: Decimal, avg_price: Decimal) -> None:
        r = await get_redis()
        key = f"{self._prefix}:positions"
        if qty <= 0:
            await r.hdel(key, symbol)
        else:
            await r.hset(key, symbol, json.dumps({"qty": str(qty), "avg_price": str(avg_price)}))

    # ── account / positions ─────────────────────────────────────
    async def get_positions(self) -> list[dict[str, Any]]:
        raw = await self._get_positions_raw()
        out: list[dict[str, Any]] = []
        for sym, p in raw.items():
            qty = Decimal(p.get("qty", "0"))
            avg = Decimal(p.get("avg_price", "0"))
            last = await get_last_price(sym) or avg
            mv = qty * last
            cost = qty * avg
            upl = mv - cost
            out.append({
                "symbol": sym,
                "qty": str(qty),
                "avg_entry_price": str(avg),
                "current_price": str(last),
                "market_value": str(mv),
                "unrealized_pl": str(upl),
                "unrealized_plpc": str((upl / cost) if cost else Decimal("0")),
                "side": "long",
            })
        return out

    async def get_account(self) -> dict[str, Any]:
        cash = await self._get_cash()
        positions = await self.get_positions()
        holdings = sum((Decimal(p["market_value"]) for p in positions), Decimal("0"))
        equity = cash + holdings
        r = await get_redis()
        last_equity = Decimal(await r.get(f"{self._prefix}:last_equity") or str(equity))
        return {
            "cash": str(cash),
            "equity": str(equity),
            "last_equity": str(last_equity),
            "buying_power": str(cash),  # no margin in sim
            "currency": self.currency,
            "status": "ACTIVE",
        }

    async def get_clock(self) -> dict[str, Any]:
        if self.market == Market.IN:
            is_open = _nse_is_open()
            return {"is_open": is_open, "next_open": _nse_next_open().isoformat()}
        return {"is_open": True, "next_open": None}

    # ── orders ──────────────────────────────────────────────────
    async def submit_order(
        self,
        symbol: str,
        qty: Decimal,
        side: str,
        order_type: str = "market",
        time_in_force: str = "day",
        limit_price: Decimal | None = None,
        stop_price: Decimal | None = None,
        client_order_id: str | None = None,
        extended_hours: bool = False,
    ) -> dict[str, Any]:
        qty = Decimal(str(qty))
        price = Decimal(str(limit_price)) if limit_price is not None else await get_last_price(symbol)
        if price is None or price <= 0:
            raise AlpacaError(f"sim: no price available for {symbol}")

        cash = await self._get_cash()
        positions = await self._get_positions_raw()
        cur = positions.get(symbol)
        held = Decimal(cur["qty"]) if cur else Decimal("0")
        avg = Decimal(cur["avg_price"]) if cur else Decimal("0")

        if side == "buy":
            cost = qty * price
            if cost > cash:
                raise AlpacaError(f"sim: insufficient cash ({cash} < {cost})")
            new_qty = held + qty
            new_avg = ((held * avg) + cost) / new_qty if new_qty else price
            await self._set_cash(cash - cost)
            await self._save_position(symbol, new_qty, new_avg)
        else:  # sell
            sell_qty = min(qty, held)
            if sell_qty <= 0:
                raise AlpacaError(f"sim: no position to sell in {symbol}")
            proceeds = sell_qty * price
            await self._set_cash(cash + proceeds)
            await self._save_position(symbol, held - sell_qty, avg)
            qty = sell_qty

        now = datetime.now(timezone.utc).isoformat()
        oid = f"sim-{uuid.uuid4().hex[:18]}"
        logger.info("sim_order_filled", market=self.market.value, symbol=symbol,
                    side=side, qty=str(qty), price=str(price))
        return {
            "id": oid,
            "client_order_id": client_order_id or oid,
            "symbol": symbol,
            "side": side,
            "qty": str(qty),
            "status": "filled",
            "filled_qty": str(qty),
            "filled_avg_price": str(price),
            "filled_at": now,
        }

    async def cancel_order(self, order_id: str) -> None:
        return None  # sim orders fill instantly; nothing to cancel

    async def cancel_all_orders(self) -> None:
        return None

    async def close_all_positions(self, cancel_orders: bool = True) -> list[dict]:
        raw = await self._get_positions_raw()
        closed = []
        for sym, p in raw.items():
            qty = Decimal(p.get("qty", "0"))
            if qty > 0:
                resp = await self.submit_order(sym, qty, "sell")
                closed.append(resp)
        return closed

    async def close(self) -> None:
        return None


# Per-market singletons
_sim_brokers: dict[Market, SimBroker] = {}


def get_sim_broker(market: "Market | str") -> SimBroker:
    m = get_market(market)
    if m not in _sim_brokers:
        _sim_brokers[m] = SimBroker(m)
    return _sim_brokers[m]
