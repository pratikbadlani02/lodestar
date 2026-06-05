"""
Execution Service — orchestrates the full order lifecycle.

Flow:
  1. Strategy produces signal → calls execute_signal()
  2. Risk manager validates → stores order as pending_risk / risk_rejected
  3. If approved, submit to broker → store broker_order_id, status=submitted
  4. Poll broker for fills → update filled_qty, avg_fill_price, status
"""
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.core.markets import Market, detect_market
from app.core.models import Order, OrderSide, OrderStatus, OrderType, TradingMode
from app.services.audit import audit
from app.services.broker import AlpacaError, get_broker
from app.services.risk import risk_manager

logger = get_logger(__name__)


async def execute_order(
    db: AsyncSession,
    symbol: str,
    side: OrderSide,
    qty: Decimal,
    order_type: OrderType = OrderType.MARKET,
    limit_price: Decimal | None = None,
    stop_price: Decimal | None = None,
    time_in_force: str = "day",
    reference_price: Decimal | None = None,
    strategy_id: uuid.UUID | None = None,
    actor: str = "manual",
    extended_hours: bool = False,
    market: Market | str | None = None,
) -> Order:
    """Create and submit an order through the risk gate.

    The market is derived from the symbol's suffix (``.NS``/``.BO`` → India)
    unless given explicitly. US orders route to Alpaca; Indian orders route to
    the simulated broker and fill immediately.
    """
    client_order_id = f"qp-{uuid.uuid4().hex[:16]}"
    market = detect_market(symbol) if market is None else market
    # Simulated (non-US) markets are always paper.
    is_live = settings.is_live_trading and detect_market(symbol) == Market.US
    mode = TradingMode.LIVE.value if is_live else TradingMode.PAPER.value

    # Persist as pending_risk first
    order = Order(
        client_order_id=client_order_id,
        strategy_id=strategy_id,
        mode=mode,
        symbol=symbol.upper(),
        side=side,
        order_type=order_type,
        qty=qty,
        limit_price=limit_price if order_type != OrderType.STOP_LIMIT else stop_price,
        time_in_force=time_in_force,
        status=OrderStatus.PENDING_RISK,
    )
    db.add(order)
    await db.flush()

    # Risk check
    result = await risk_manager.check_order(
        symbol=symbol.upper(),
        side=side.value,
        qty=qty,
        reference_price=reference_price or limit_price,
        market=market,
    )

    order.risk_check = {"approved": result.approved, "reason": result.reason, **result.details}

    if not result.approved:
        order.status = OrderStatus.RISK_REJECTED
        order.reason = result.reason
        await audit(
            db, actor=actor, action="order_rejected",
            resource=f"order:{order.id}",
            details={"symbol": symbol, "qty": str(qty), "reason": result.reason, **result.details},
            success=False,
        )
        await db.flush()
        logger.warning(
            "order_risk_rejected", symbol=symbol, side=side.value,
            qty=str(qty), reason=result.reason, details=result.details,
        )
        return order

    # Submit to broker (market-aware: Alpaca for US, simulated for IN)
    broker = get_broker(market)
    try:
        resp = await broker.submit_order(
            symbol=symbol.upper(),
            qty=qty,
            side=side.value,
            order_type=order_type.value,
            time_in_force=time_in_force,
            limit_price=limit_price,
            stop_price=stop_price,
            client_order_id=client_order_id,
            extended_hours=extended_hours,
        )
        order.broker_order_id = resp.get("id")
        order.status = OrderStatus.SUBMITTED

        # Simulated brokers fill instantly — reflect the fill immediately so the
        # order doesn't sit waiting for a broker sync that will never come.
        if str(resp.get("status", "")).lower() == "filled":
            order.status = OrderStatus.FILLED
            if resp.get("filled_qty"):
                order.filled_qty = Decimal(str(resp["filled_qty"]))
            if resp.get("filled_avg_price"):
                order.avg_fill_price = Decimal(str(resp["filled_avg_price"]))
            if resp.get("filled_at"):
                from datetime import datetime
                order.filled_at = datetime.fromisoformat(
                    str(resp["filled_at"]).replace("Z", "+00:00")
                )

        await audit(
            db, actor=actor, action="order_submitted",
            resource=f"order:{order.id}",
            details={
                "symbol": symbol, "side": side.value, "qty": str(qty),
                "broker_order_id": order.broker_order_id, "mode": mode,
            },
        )
        logger.info(
            "order_submitted", symbol=symbol, side=side.value, qty=str(qty),
            broker_order_id=order.broker_order_id, mode=mode,
        )
    except AlpacaError as e:
        order.status = OrderStatus.ERROR
        order.reason = str(e)
        await audit(
            db, actor=actor, action="order_broker_error",
            resource=f"order:{order.id}",
            details={"error": str(e)}, success=False,
        )
        logger.error("order_broker_error", error=str(e), symbol=symbol)

    await db.flush()
    return order


async def sync_order_status(db: AsyncSession, order: Order) -> Order:
    """Poll broker for updated status of an open order."""
    if not order.broker_order_id:
        return order

    broker = get_broker()
    c = await broker._get_client()
    r = await c.get(f"{broker.base}/v2/orders/{order.broker_order_id}")
    if r.status_code != 200:
        logger.error("sync_order_failed", status=r.status_code, text=r.text)
        return order

    data: dict[str, Any] = r.json()
    broker_status = data.get("status", "").lower()

    status_map = {
        "new": OrderStatus.ACCEPTED,
        "accepted": OrderStatus.ACCEPTED,
        "pending_new": OrderStatus.SUBMITTED,
        "partially_filled": OrderStatus.PARTIALLY_FILLED,
        "filled": OrderStatus.FILLED,
        "canceled": OrderStatus.CANCELED,
        "expired": OrderStatus.EXPIRED,
        "rejected": OrderStatus.REJECTED,
    }
    order.status = status_map.get(broker_status, order.status)

    if data.get("filled_qty"):
        order.filled_qty = Decimal(data["filled_qty"])
    if data.get("filled_avg_price"):
        order.avg_fill_price = Decimal(data["filled_avg_price"])
    if order.status == OrderStatus.FILLED and data.get("filled_at"):
        from datetime import datetime
        order.filled_at = datetime.fromisoformat(data["filled_at"].replace("Z", "+00:00"))

    await db.flush()
    return order


async def emergency_liquidate_all(db: AsyncSession, actor: str, reason: str) -> dict:
    """Kill switch action: cancel all orders + close all positions (all markets)."""
    broker = get_broker()
    try:
        await broker.cancel_all_orders()
        closed = await broker.close_all_positions(cancel_orders=True)

        # Also flatten the simulated Indian book.
        sim_closed: list = []
        try:
            sim = get_broker(Market.IN)
            await sim.cancel_all_orders()
            sim_closed = await sim.close_all_positions(cancel_orders=True)
        except Exception as e:  # never let the sim block the live liquidation
            logger.error("sim_liquidate_failed", error=str(e))

        total = len(closed) + len(sim_closed)
        await audit(
            db, actor=actor, action="emergency_liquidate",
            details={"reason": reason, "closed_count": total,
                     "us": len(closed), "in_sim": len(sim_closed)},
        )
        logger.critical("emergency_liquidate", reason=reason, closed=total)
        return {"closed_count": total, "reason": reason}
    except AlpacaError as e:
        logger.error("liquidate_failed", error=str(e))
        await audit(
            db, actor=actor, action="emergency_liquidate_failed",
            details={"error": str(e)}, success=False,
        )
        raise
