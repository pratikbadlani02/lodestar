"""Strategy registry — maps strategy_type string to class."""
from app.strategies.atr_breakout import ATRBreakoutStrategy
from app.strategies.base import BaseStrategy
from app.strategies.bollinger_squeeze import BollingerSqueezeStrategy
from app.strategies.donchian_breakout import DonchianBreakoutStrategy
from app.strategies.keltner_breakout import KeltnerBreakoutStrategy
from app.strategies.low_volatility import LowVolatilityStrategy
from app.strategies.macd_crossover import MACDStrategy
from app.strategies.momentum import MomentumStrategy
from app.strategies.multi_factor import MultiFactorStrategy
from app.strategies.pairs_trade import PairsTradeStrategy
from app.strategies.rsi_mean_reversion import RSIMeanReversionStrategy
from app.strategies.sector_rotation import SectorRotationStrategy
from app.strategies.sma_crossover import SMACrossoverStrategy
from app.strategies.supertrend import SupertrendStrategy

STRATEGY_REGISTRY: dict[str, type[BaseStrategy]] = {
    SMACrossoverStrategy.name:       SMACrossoverStrategy,
    RSIMeanReversionStrategy.name:   RSIMeanReversionStrategy,
    ATRBreakoutStrategy.name:        ATRBreakoutStrategy,
    MACDStrategy.name:               MACDStrategy,
    BollingerSqueezeStrategy.name:   BollingerSqueezeStrategy,
    SectorRotationStrategy.name:     SectorRotationStrategy,
    PairsTradeStrategy.name:         PairsTradeStrategy,
    # ── Bot-grade additions ──────────────────────────────────────
    SupertrendStrategy.name:         SupertrendStrategy,
    DonchianBreakoutStrategy.name:   DonchianBreakoutStrategy,
    MomentumStrategy.name:           MomentumStrategy,
    KeltnerBreakoutStrategy.name:    KeltnerBreakoutStrategy,
    # ── Institutional / factor additions ─────────────────────────
    LowVolatilityStrategy.name:      LowVolatilityStrategy,
    MultiFactorStrategy.name:        MultiFactorStrategy,
}


def get_strategy(strategy_type: str, params: dict | None = None) -> BaseStrategy:
    if strategy_type not in STRATEGY_REGISTRY:
        raise ValueError(
            f"Unknown strategy: {strategy_type}. "
            f"Available: {list(STRATEGY_REGISTRY.keys())}"
        )
    return STRATEGY_REGISTRY[strategy_type](params=params)


def list_strategies() -> list[dict]:
    return [
        {
            "name": cls.name,
            "description": cls.description,
            "required_bars": cls.required_bars,
            "default_params": cls.default_params,
        }
        for cls in STRATEGY_REGISTRY.values()
    ]
