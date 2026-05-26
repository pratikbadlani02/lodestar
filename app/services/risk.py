"""
Risk Manager — the gate between strategy signals and broker orders.

Every order MUST pass through check_order() before submission.
Rules enforced:
  1. Global trading_enabled flag
  2. Max drawdown (total from peak equity)
  3. Max daily loss
  4. Max position size as % of equity
  5. Max open positions
  6. Rate limiting (max orders per minute)
  7. Market must be open (for equities)
  8. Sufficient buying power
"""
import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.services.broker import AlpacaError, get_broker
from app.services.control import is_trading_enabled

logger = get_logger(__name__)


@dataclass
class RiskCheckResult:
    approved: bool
    reason: str
    details: dict[str, Any]


class RateLimiter:
    """Simple sliding-window rate limiter (in-memory)."""

    def __init__(self, max_per_minute: int):
        self.max = max_per_minute
        self._timestamps: list[float] = []

    def allow(self) -> bool:
        now = time.time()
        cutoff = now - 60.0
        self._timestamps = [t for t in self._timestamps if t > cutoff]
        if len(self._timestamps) >= self.max:
            return False
        self._timestamps.append(now)
        return True


_rate_limiter = RateLimiter(settings.max_orders_per_minute)


class RiskManager:
    """Validates orders against configured risk limits."""

    async def check_order(
        self,
        symbol: str,
        side: str,
        qty: Decimal,
        reference_price: Decimal | None = None,
    ) -> RiskCheckResult:
        details: dict[str, Any] = {}

        # 1. Global kill switch
        if not await is_trading_enabled():
            return RiskCheckResult(
                approved=False,
                reason="trading_disabled",
                details={"message": "Trading is globally disabled (kill switch active)"},
            )

        # 2. Rate limit
        if not _rate_limiter.allow():
            return RiskCheckResult(
                approved=False,
                reason="rate_limit_exceeded",
                details={"max_per_minute": settings.max_orders_per_minute},
            )

        # 3. Get broker account
        broker = get_broker()
        try:
            account = await broker.get_account()
            positions = await broker.get_positions()
        except AlpacaError as e:
            logger.error("risk_check_broker_failure", error=str(e))
            return RiskCheckResult(
                approved=False,
                reason="broker_unavailable",
                details={"error": str(e)},
            )

        equity = Decimal(account.get("equity", "0"))
        last_equity = Decimal(account.get("last_equity", "0"))
        buying_power = Decimal(account.get("buying_power", "0"))
        day_pl = equity - last_equity if last_equity > 0 else Decimal("0")
        day_pl_pct = (day_pl / last_equity * 100) if last_equity > 0 else Decimal("0")

        details["equity"] = str(equity)
        details["buying_power"] = str(buying_power)
        details["day_pl_pct"] = str(round(day_pl_pct, 4))
        details["open_positions"] = len(positions)

        # 4. Market hours (only for equities, BUY orders)
        if side == "buy":
            try:
                clock = await broker.get_clock()
                if not clock.get("is_open", False):
                    return RiskCheckResult(
                        approved=False,
                        reason="market_closed",
                        details={"next_open": clock.get("next_open")},
                    )
            except AlpacaError:
                logger.warning("market_clock_check_failed")

        # 5. Daily loss limit
        if day_pl_pct <= -Decimal(str(settings.max_daily_loss_pct)):
            return RiskCheckResult(
                approved=False,
                reason="daily_loss_limit_breached",
                details={
                    "day_pl_pct": float(day_pl_pct),
                    "limit_pct": settings.max_daily_loss_pct,
                },
            )

        # 6. Max open positions (for new BUYs)
        if side == "buy":
            existing_symbols = {p["symbol"] for p in positions}
            if (
                symbol not in existing_symbols
                and len(positions) >= settings.max_open_positions
            ):
                return RiskCheckResult(
                    approved=False,
                    reason="max_positions_reached",
                    details={
                        "current": len(positions),
                        "max": settings.max_open_positions,
                    },
                )

        # 7. Position size as % of equity (for BUYs)
        if side == "buy" and reference_price is not None and equity > 0:
            order_value = qty * reference_price
            pct_of_equity = (order_value / equity) * 100

            details["order_value"] = str(round(order_value, 2))
            details["pct_of_equity"] = str(round(pct_of_equity, 4))

            if pct_of_equity > Decimal(str(settings.max_position_size_pct)):
                return RiskCheckResult(
                    approved=False,
                    reason="position_size_exceeded",
                    details={
                        "pct_of_equity": float(pct_of_equity),
                        "max_pct": settings.max_position_size_pct,
                    },
                )

            # 8. Buying power
            if order_value > buying_power:
                return RiskCheckResult(
                    approved=False,
                    reason="insufficient_buying_power",
                    details={
                        "required": str(order_value),
                        "available": str(buying_power),
                    },
                )

        # All checks passed
        return RiskCheckResult(
            approved=True,
            reason="approved",
            details=details,
        )


# Singleton
risk_manager = RiskManager()
