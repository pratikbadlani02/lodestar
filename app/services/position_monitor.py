"""
Stop-loss / take-profit / trailing-stop / max-hold monitor.

Runs every 30 seconds during market hours. For each open position
that has stop/target prices set, checks if the trigger condition is met
and submits a closing order.

Trailing stop: tracks highest_price seen, sells if current drops by trailing_pct.
"""
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.models import OrderSide, OrderType, Position, Strategy
from app.services.alerts import emit_alert
from app.services.broker import AlpacaError, get_broker
from app.services.execution import execute_order
from app.services.websocket import emit as ws_emit

logger = get_logger(__name__)


async def update_position_targets(
    db: AsyncSession,
    position: Position,
    strategy: Strategy | None,
    entry_price: Decimal,
) -> None:
    """Set stop/target prices on a position based on its strategy config."""
    if strategy is None:
        return

    if strategy.stop_loss_pct:
        sl_pct = Decimal(str(strategy.stop_loss_pct)) / Decimal("100")
        position.stop_loss_price = entry_price * (Decimal("1") - sl_pct)

    if strategy.take_profit_pct:
        tp_pct = Decimal(str(strategy.take_profit_pct)) / Decimal("100")
        position.take_profit_price = entry_price * (Decimal("1") + tp_pct)

    position.highest_price = entry_price
    await db.flush()


async def monitor_positions(db: AsyncSession) -> dict:
    """Check every position for stop/target hits. Returns summary dict."""
    broker = get_broker()

    try:
        broker_positions = await broker.get_positions()
    except AlpacaError as e:
        logger.error("monitor_broker_error", error=str(e))
        return {"status": "broker_error", "error": str(e)}

    triggered = 0
    checked = 0

    for bp in broker_positions:
        symbol = bp.get("symbol")
        current_price = Decimal(str(bp.get("current_price", 0)))
        qty = Decimal(str(bp.get("qty", 0)))

        if current_price <= 0 or qty == 0:
            continue

        # Find local position record (for our stop/target prices)
        result = await db.execute(select(Position).where(Position.symbol == symbol))
        pos = result.scalar_one_or_none()

        if not pos or not pos.strategy_id:
            continue

        # Get strategy for trailing stop config
        strat_result = await db.execute(select(Strategy).where(Strategy.id == pos.strategy_id))
        strategy = strat_result.scalar_one_or_none()

        checked += 1
        trigger_reason = None

        # Update highest seen price (for trailing)
        if pos.highest_price is None or current_price > pos.highest_price:
            pos.highest_price = current_price

        # Stop loss
        if pos.stop_loss_price and current_price <= pos.stop_loss_price:
            trigger_reason = f"stop_loss hit at {current_price} (target {pos.stop_loss_price})"

        # Take profit
        elif pos.take_profit_price and current_price >= pos.take_profit_price:
            trigger_reason = f"take_profit hit at {current_price} (target {pos.take_profit_price})"

        # Trailing stop
        elif strategy and strategy.trailing_stop_pct and pos.highest_price:
            trail_pct = Decimal(str(strategy.trailing_stop_pct)) / Decimal("100")
            trail_price = pos.highest_price * (Decimal("1") - trail_pct)
            if current_price <= trail_price:
                trigger_reason = (
                    f"trailing_stop hit: current {current_price} <= "
                    f"high*{1-float(trail_pct):.4f}={trail_price:.2f}"
                )

        # Max hold time
        if strategy and strategy.max_hold_days and pos.opened_at:
            held = (datetime.now(timezone.utc) - pos.opened_at).days
            if held >= strategy.max_hold_days:
                trigger_reason = f"max_hold_days reached ({held}/{strategy.max_hold_days})"

        if trigger_reason:
            triggered += 1
            logger.warning(
                "position_target_triggered",
                symbol=symbol, reason=trigger_reason,
                current_price=str(current_price),
            )

            # Submit closing order (reverse side)
            try:
                await execute_order(
                    db=db, symbol=symbol, side=OrderSide.SELL,
                    qty=qty.copy_abs(), order_type=OrderType.MARKET,
                    reference_price=current_price,
                    strategy_id=pos.strategy_id,
                    actor=f"stop_monitor:{strategy.name if strategy else 'unknown'}",
                )

                await emit_alert(
                    db, severity="warning", category="risk",
                    title=f"Position closed: {symbol}",
                    message=trigger_reason,
                    metadata={"symbol": symbol, "current_price": str(current_price)},
                )

                await ws_emit("position_closed", {
                    "symbol": symbol,
                    "reason": trigger_reason,
                    "price": str(current_price),
                })
            except Exception as e:
                logger.error("auto_close_failed", symbol=symbol, error=str(e))

    await db.commit()
    return {"status": "ok", "checked": checked, "triggered": triggered}
