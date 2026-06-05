"""
Alpaca broker adapter.

Thin async wrapper around alpaca-py. Handles both paper and live trading.
Never called directly from routes — always through execution service.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class AlpacaError(Exception):
    pass


class AlpacaBroker:
    """
    Async HTTP client for Alpaca REST API.
    Using raw httpx rather than alpaca-py to avoid sync/async mismatches.
    """

    def __init__(self) -> None:
        self.base = settings.alpaca_base_url.rstrip("/")
        self.data_base = settings.alpaca_data_url.rstrip("/")
        self.headers = {
            "APCA-API-KEY-ID": settings.alpaca_api_key,
            "APCA-API-SECRET-KEY": settings.alpaca_secret_key,
            "Content-Type": "application/json",
        }
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                headers=self.headers, timeout=30.0, http2=False
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ── Account ─────────────────────────────────────────────────
    async def get_account(self) -> dict[str, Any]:
        c = await self._get_client()
        r = await c.get(f"{self.base}/v2/account")
        if r.status_code != 200:
            raise AlpacaError(f"get_account failed: {r.status_code} {r.text}")
        return r.json()

    async def get_positions(self) -> list[dict[str, Any]]:
        c = await self._get_client()
        r = await c.get(f"{self.base}/v2/positions")
        if r.status_code != 200:
            raise AlpacaError(f"get_positions failed: {r.status_code} {r.text}")
        return r.json()

    async def get_clock(self) -> dict[str, Any]:
        c = await self._get_client()
        r = await c.get(f"{self.base}/v2/clock")
        if r.status_code != 200:
            raise AlpacaError(f"get_clock failed: {r.status_code} {r.text}")
        return r.json()

    # ── Orders ──────────────────────────────────────────────────
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
        c = await self._get_client()
        # Alpaca uses "stop_limit" as order type
        alpaca_type = "stop_limit" if order_type == "stop_limit" else order_type
        payload: dict[str, Any] = {
            "symbol": symbol,
            "qty": str(qty),
            "side": side,
            "type": alpaca_type,
            "time_in_force": time_in_force,
        }
        if limit_price is not None:
            payload["limit_price"] = str(limit_price)
        if stop_price is not None:
            payload["stop_price"] = str(stop_price)
        if client_order_id:
            payload["client_order_id"] = client_order_id
        if extended_hours:
            payload["extended_hours"] = True

        r = await c.post(f"{self.base}/v2/orders", json=payload)
        if r.status_code not in (200, 201):
            raise AlpacaError(f"submit_order failed: {r.status_code} {r.text}")
        return r.json()

    async def cancel_order(self, order_id: str) -> None:
        c = await self._get_client()
        r = await c.delete(f"{self.base}/v2/orders/{order_id}")
        if r.status_code not in (204, 200):
            raise AlpacaError(f"cancel_order failed: {r.status_code} {r.text}")

    async def cancel_all_orders(self) -> None:
        c = await self._get_client()
        r = await c.delete(f"{self.base}/v2/orders")
        if r.status_code not in (207, 200, 204):
            raise AlpacaError(f"cancel_all failed: {r.status_code} {r.text}")

    async def close_all_positions(self, cancel_orders: bool = True) -> list[dict]:
        c = await self._get_client()
        r = await c.delete(
            f"{self.base}/v2/positions",
            params={"cancel_orders": "true" if cancel_orders else "false"},
        )
        if r.status_code not in (207, 200):
            raise AlpacaError(f"close_all_positions failed: {r.status_code} {r.text}")
        return r.json()

    # ── Market data ─────────────────────────────────────────────
    async def get_snapshots(self, symbols: list[str]) -> dict[str, Any]:
        """Fetch latest quote/trade snapshots for multiple symbols."""
        c = await self._get_client()
        r = await c.get(
            f"{self.data_base}/v2/stocks/snapshots",
            params={"symbols": ",".join(s.upper() for s in symbols), "feed": "iex"},
        )
        if r.status_code != 200:
            raise AlpacaError(f"get_snapshots failed: {r.status_code} {r.text}")
        return r.json()

    async def get_news(
        self,
        symbols: list[str] | None = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Fetch latest news articles from Alpaca."""
        c = await self._get_client()
        params: dict[str, Any] = {"limit": limit, "sort": "desc"}
        if symbols:
            params["symbols"] = ",".join(s.upper() for s in symbols)
        r = await c.get(f"{self.data_base}/v1beta1/news", params=params)
        if r.status_code != 200:
            raise AlpacaError(f"get_news failed: {r.status_code} {r.text}")
        return r.json().get("news", [])

    async def get_trades(
        self,
        symbol: str,
        limit: int = 200,
        start: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """Latest trade prints for the time-and-sales feed (free IEX tier).

        Defaults to a 7-day lookback so weekends still return the most recent
        Friday session.
        """
        c = await self._get_client()
        if start is None:
            start = datetime.now(timezone.utc) - timedelta(days=7)
        params: dict[str, Any] = {
            "limit": limit,
            "feed": "iex",
            "start": start.isoformat(),
        }
        r = await c.get(f"{self.data_base}/v2/stocks/{symbol}/trades", params=params)
        if r.status_code != 200:
            raise AlpacaError(f"get_trades failed: {r.status_code} {r.text}")
        return r.json().get("trades") or []

    async def get_quotes(
        self,
        symbol: str,
        limit: int = 200,
        start: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """Intraday bid/ask history. Default lookback is 7 days."""
        c = await self._get_client()
        if start is None:
            start = datetime.now(timezone.utc) - timedelta(days=7)
        params: dict[str, Any] = {
            "limit": limit,
            "feed": "iex",
            "start": start.isoformat(),
        }
        r = await c.get(f"{self.data_base}/v2/stocks/{symbol}/quotes", params=params)
        if r.status_code != 200:
            raise AlpacaError(f"get_quotes failed: {r.status_code} {r.text}")
        return r.json().get("quotes") or []

    async def get_movers(self, top: int = 25) -> dict[str, Any]:
        """Top gainers and losers via Alpaca screener."""
        c = await self._get_client()
        r = await c.get(
            f"{self.data_base}/v1beta1/screener/stocks/movers",
            params={"top": top},
        )
        if r.status_code != 200:
            raise AlpacaError(f"get_movers failed: {r.status_code} {r.text}")
        return r.json()

    async def get_most_actives(self, top: int = 25, by: str = "volume") -> dict[str, Any]:
        """Most-active symbols by volume or trade count."""
        c = await self._get_client()
        r = await c.get(
            f"{self.data_base}/v1beta1/screener/stocks/most-actives",
            params={"top": top, "by": by},
        )
        if r.status_code != 200:
            raise AlpacaError(f"get_most_actives failed: {r.status_code} {r.text}")
        return r.json()

    async def get_crypto_snapshots(self, symbols: list[str]) -> dict[str, Any]:
        """Crypto snapshots. Symbols use slash form, e.g. BTC/USD."""
        c = await self._get_client()
        r = await c.get(
            f"{self.data_base}/v1beta3/crypto/us/snapshots",
            params={"symbols": ",".join(symbols)},
        )
        if r.status_code != 200:
            raise AlpacaError(f"get_crypto_snapshots failed: {r.status_code} {r.text}")
        return r.json().get("snapshots", {})

    async def get_crypto_bars(
        self,
        symbol: str,
        timeframe: str = "1Day",
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        """Crypto OHLCV bars."""
        c = await self._get_client()
        params: dict[str, Any] = {
            "symbols": symbol,
            "timeframe": timeframe,
            "limit": limit,
        }
        if start:
            params["start"] = start.isoformat()
        if end:
            params["end"] = end.isoformat()
        r = await c.get(f"{self.data_base}/v1beta3/crypto/us/bars", params=params)
        if r.status_code != 200:
            raise AlpacaError(f"get_crypto_bars failed: {r.status_code} {r.text}")
        data = r.json()
        return data.get("bars", {}).get(symbol) or []

    async def get_bars(
        self,
        symbol: str,
        timeframe: str = "1Day",
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        c = await self._get_client()
        params: dict[str, Any] = {
            "timeframe": timeframe,
            "limit": limit,
            "adjustment": "raw",
            "feed": "iex",  # iex is free tier
        }
        if start:
            params["start"] = start.isoformat()
        if end:
            params["end"] = end.isoformat()

        all_bars: list[dict] = []
        while True:
            r = await c.get(f"{self.data_base}/v2/stocks/{symbol}/bars", params=params)
            if r.status_code != 200:
                raise AlpacaError(f"get_bars failed: {r.status_code} {r.text}")
            data = r.json()
            all_bars.extend(data.get("bars") or [])
            next_token = data.get("next_page_token")
            if not next_token:
                break
            params["page_token"] = next_token
        return all_bars


# Singleton
_broker: AlpacaBroker | None = None


def get_broker(market: Any = None):
    """
    Resolve the broker for a market.

    Defaults to the Alpaca broker (US). Indian / simulated markets resolve to a
    Redis-backed paper broker. The import of the sim broker is lazy to avoid a
    circular import (sim_broker → market_data → broker).
    """
    from app.core.markets import Market, get_market

    if market is not None and get_market(market) != Market.US:
        from app.services.sim_broker import get_sim_broker
        return get_sim_broker(market)

    global _broker
    if _broker is None:
        _broker = AlpacaBroker()
    return _broker
