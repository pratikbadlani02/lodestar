# Strategy Research Log — Cross-Sectional Acceleration Momentum

Record of the develop → backtest → walk-forward → stress-test research that
produced the production champion. All work is in
`app/strategies/cross_sectional.py`; backtests run through
`app/services/portfolio_backtester.py`.

**Test bed:** 10-megacap basket `[AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA, JPM, SPY, AMD]`,
$100k initial, slippage + commission modelled, monthly (`rebalance_days=21`) rebalance.
**Validation:** Year A vs Year B walk-forward (overfit check) → full-cycle 2022→2026
stress test (bear + bull) → cross-universe robustness.

---

## TL;DR — the champion

**`xs_adaptive_accel`** (regime-adaptive acceleration), params
`accel_window=21, top_n=1, regime_ma=100, risk_off_scale=0.5, rebalance_days=21`.

Hold the single fastest-*accelerating* name (acceleration = recent 21d return −
prior 21d return), rebalanced monthly; **full exposure when SPY > its 100d MA,
half exposure when below**.

| Strategy | Full-cycle 2022→2026 | Sharpe | Max DD |
|---|---|---|---|
| **`xs_adaptive_accel` (0.5 / ma100)** | **+501%** | **1.30** | **33%** |
| `xs_accel` (no regime gate) | +118% | 0.64 | 39% |
| pure momentum | +42% | — | 79% |
| buy & hold SPY | +58% | — | — |

Avoiding the −27% 2022 bear (the gate turns it to ~flat, +0.4%) is what compounds
the edge — the bull years then compound from a higher base.

---

## Iteration history

### Iteration 1 — risk-adjusted & acceleration momentum `dc28fa8`
- `xs_sharpe_momentum` — rank by return/volatility, hold top-N. **Overfit:** +96% year B / −30% year A (top_n=1).
- `xs_accel` — rank by acceleration (momentum-of-momentum), hold top-N. **ROBUST:** +110% B / +71.6% A (window=21, top_n=1).
- **Verdict:** acceleration catches emerging leaders earlier than level momentum → profit champion.

### Iteration 2 — regime gate + accel/sharpe blend `b3a9b70`
- `xs_regime_momentum` — momentum top-N, cash when SPY < long MA. Went slightly negative in the bull window; the hard gate hurt.
- `xs_accel_sharpe` — z-score blend of acceleration + risk-adjusted momentum. Neither beat the champion.
- **Verdict:** champion remains `xs_accel`.

### Iteration 3 — volatility-managed momentum `903001d`
- `xs_volmanaged` — Barroso–Santa-Clara target-vol exposure scaling on top of the accel/momentum rank.
- **Result:** cuts drawdown (15–22% vs 29%) but caps upside in the bull window (B: +16–34%, A: ~flat).
- **Verdict:** a risk tool, not a profit tool in a trending environment.

### Iterations 4–5 — (research, not committed separately)
Parameter sweeps over `accel_window`, `top_n`, `regime_ma`, `risk_off_scale` feeding into iteration 6.

### Iteration 6 — regime-adaptive acceleration (all-weather) `13fa7f3`
- `xs_adaptive_accel` — full accel exposure in risk-on; dial to cash or a fraction in risk-off.
- **Stress test:** half-exposure variant turns the −27% 2022 bear into ~flat (+0.4%) while keeping +48–70% in bull years; worst period −2% vs −27% plain.
- **Champion:** **+501%, Sharpe 1.30, maxDD 33%** at `risk_off_scale=0.5, regime_ma=100`.
- `off=0.7 / ma150` reached +641% but is in-sample overfit → **0.5 / ma100 is the conservative keeper.**

### Iterations 7–8 — (research) parameter robustness + walk-forward confirmation of iteration 6.

### Iteration 9 — defensive sleeve + universe robustness (convergence) `e867e92`
- `xs_adaptive_defensive` — rotate to a defensive asset in risk-off instead of cash: GLD +356%, BIL +273%, TLT +239%.
- **Verdict:** all BELOW the +501% half-equity gate — staying partly in equities catches bear rallies and recovers faster than sitting in bonds/gold.
- **Universe robustness of the champion (full-cycle):** megacap growth **+501%** (dd 33%), wide growth basket **+685%** (dd 52%), **sector ETFs −58%**, **value/cyclical −8%**.
- **Verdict:** edge is **universe-dependent** — needs high-dispersion trending leaders; fails on mean-reverting baskets. **Research converged.**

---

## Critical caveats (don't over-trust)

1. **Concentrated single-name** (`top_n=1`) — one idiosyncratic blowup hits the whole book.
2. **Universe-dependent** — +501% on megacap growth / +685% on wide growth, but −58% sector ETFs / −8% value. This is "growth-leader momentum in trending eras," not a universal law.
3. **Defensive-asset rotation underperformed** the half-equity gate.

---

## Known risks & how we address them

The champion has three structural risks. They form a **trilemma** — pushing on
one tends to worsen another (faster protection ⇒ more whipsaw; less concentration
⇒ lower return), so the production config is a deliberate compromise, not a free
lunch.

### 1. Whipsaw risk
*Where it comes from:* (a) the regime gate is a **hard binary flip** at the
SPY-vs-100d-MA crossing (`cross_sectional.py:426`) — in a choppy tape SPY
oscillates around its MA and the book toggles full↔half every rebalance, selling
low / buying back and bleeding slippage; (b) `top_n=1` does a **complete
round-trip** whenever a challenger's acceleration edges past the incumbent's by
any margin.

*Mitigations:*
- **Hysteresis band** — separate enter/exit thresholds (e.g. go risk-off only when SPY is >2% below MA, risk-on only when >1% above) instead of one equality test, so it doesn't flip on a tick.
- **Persistence/confirmation** — require the regime condition to hold N consecutive days before flipping.
- **Continuous (not binary) exposure** — ramp exposure as a function of distance-from-MA rather than a 1.0/0.5 step.
- **Turnover buffer on the rank** — only switch the held name if the challenger beats the incumbent's acceleration by a margin; or rank on smoothed acceleration to filter noise.
- `risk_off_scale=0.5` (vs 0.0) already softens each flip's cost by staying partly invested.

### 2. Concentration risk
*Where it comes from:* `top_n=1` ⇒ 100% in one name. Maximises return but is the
single largest source of fragility (earnings gap, single-stock crash).

*Mitigations:*
- **Raise `top_n` to 3–5** equal-weight — diversifies idiosyncratic risk at the cost of some upside (backtests show top_n=1 maxes return; this is the trade).
- **Per-name weight cap** even within the held set.
- **Layer `xs_volmanaged`'s target-vol scaling** on top so total exposure also responds to portfolio vol.
- **Rank-tilted sleeve** — top-3 with weight tilted toward rank-1, keeping most of the edge while cushioning a single blowup.

### 3. Lagging protection
*Where it comes from:* `regime_ma=100` is a **lagging** trend filter. By the time
SPY closes below its 100d MA, a meaningful drawdown has already happened (you
protect *late*), and you re-enter late and miss the early rebound.

*Mitigations:*
- **Faster filter** — shorter MA or an EMA reacts sooner (but adds whipsaw → pair with hysteresis above).
- **Dual trigger** — combine the slow MA with a faster signal (realized-vol spike, or price below a 20/50d EMA) so de-risking engages earlier than the 100d cross.
- **Vol-targeting** (`xs_volmanaged`) reacts to vol *expansion* faster than a price-MA cross — it cuts exposure *into* the drawdown rather than after it.
- **Partial, not full, de-risk** (`risk_off_scale=0.5`) keeps capital working so late re-entry costs less of the rebound.

---

*Saved on prod as "XS Adaptive Acceleration — all-weather". Research converged at iteration 9.*
