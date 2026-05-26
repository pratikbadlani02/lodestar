"""
Strategy base interface.

Every strategy produces SIGNALS (BUY/SELL/HOLD) from OHLCV data.
The Execution Service turns signals into orders after risk checks.
Strategies never directly call brokers.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any

import pandas as pd


class SignalType(str, Enum):
    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"
    CLOSE = "close"


@dataclass
class Signal:
    """A single trading signal produced by a strategy."""
    timestamp: datetime
    symbol: str
    signal: SignalType
    strength: float  # 0.0 - 1.0 (can be used for position sizing)
    price: Decimal  # Reference price at signal time
    reason: str  # Human-readable explanation
    indicators: dict[str, Any]  # Indicator values used (for debugging)


class BaseStrategy(ABC):
    """
    All strategies inherit from this.

    Implementations must:
      1. Declare required_bars (lookback needed)
      2. Declare default_params
      3. Implement generate_signal() that takes a pandas DataFrame of OHLCV
         and returns a Signal (or None if no signal)
    """

    name: str = "base"
    description: str = ""
    required_bars: int = 50
    default_params: dict[str, Any] = {}

    def __init__(self, params: dict[str, Any] | None = None):
        self.params = {**self.default_params, **(params or {})}

    @abstractmethod
    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal | None:
        """
        df columns: time, open, high, low, close, volume
        df is sorted ascending by time, most recent row is the 'current' bar.
        """
        ...

    def validate_data(self, df: pd.DataFrame) -> bool:
        """Ensure enough data is present."""
        return len(df) >= self.required_bars
