# Quant Platform vs. Webull — Feature Comparison Report

**Date:** May 3, 2026
**Platform version:** 3.0 (post Webull feature sprint)

---

## Executive Summary

The Quant Platform is a **developer-grade autonomous trading system** built for systematic, rule-based investing with institutional-quality risk controls. Webull is a **retail brokerage application** optimized for active individual traders with rich market research tools, social features, and a mobile-first UX. The platforms serve overlapping but distinct audiences and consequently have very different feature sets. The Quant Platform exceeds Webull in automated execution and quantitative analysis; Webull dominates in retail UX, fundamental research, options, and social features.

---

## 1. Market Data

| Feature | Quant Platform | Webull |
|---|---|---|
| OHLCV bars (daily) | ✅ via Alpaca / TimescaleDB cache | ✅ |
| Intraday bars (1m, 5m, 15m, 1h) | ✅ stored + served | ✅ |
| Real-time quotes (bid/ask/last) | ✅ via `/market/snapshots` | ✅ |
| Level 2 order book (depth) | ❌ not implemented | ✅ (free on Webull) |
| Pre/after-market quotes | ❌ no dedicated view | ✅ |
| Interactive charts | ❌ no charting UI | ✅ (full candlestick + drawings) |
| Technical indicators on chart | ❌ | ✅ (70+ indicators) |
| Chart drawing tools | ❌ | ✅ |
| Chart pattern recognition | ❌ | ✅ (AI-assisted) |
| News feed | ✅ via Alpaca `/v1beta1/news` | ✅ (Bloomberg, Reuters, Benzinga) |
| Multiple news sources | ❌ Alpaca only | ✅ |
| Economic calendar | ❌ | ✅ |
| Earnings calendar | ❌ | ✅ |
| IPO calendar | ❌ | ✅ |
| Dividend calendar | ❌ | ✅ |

**Gap summary:** The platform has no charting UI, no Level 2 data, no economic/earnings calendars, and relies on a single news source.

---

## 2. Trading & Order Management

| Feature | Quant Platform | Webull |
|---|---|---|
| Market orders | ✅ | ✅ |
| Limit orders | ✅ | ✅ |
| Stop orders | ✅ (type stored, submitted) | ✅ |
| Stop-limit orders | ❌ | ✅ |
| Trailing stop orders | ✅ (position-level, not order-level) | ✅ (broker-native) |
| Extended hours trading | ✅ `extended_hours` flag | ✅ |
| Day / GTC time-in-force | ❌ hardcoded to `day` | ✅ (day, GTC, IOC, FOK, OPG) |
| Fractional shares | ❌ | ✅ (min $1) |
| Short selling | ❌ | ✅ |
| Options trading | ❌ | ✅ (single leg + spreads) |
| Crypto trading | ❌ | ✅ |
| Paper trading | ✅ (full paper mode toggle) | ✅ |
| Commission-free | ✅ (Alpaca is free) | ✅ |
| Order preview / confirmation | ❌ submits immediately | ✅ |
| One-click order entry | ❌ modal required | ✅ |
| Order modification (edit open) | ❌ | ✅ |
| Bracket orders (OCO) | ❌ | ✅ |

**Gap summary:** Missing stop-limit, OCO brackets, GTC/IOC time-in-force, fractional shares, short selling, options, and crypto. Order experience is functional but has no preview screen. Trailing stops are position-monitor–driven rather than broker-native.

---

## 3. Automated Strategy & Backtesting (Quant Platform advantage)

| Feature | Quant Platform | Webull |
|---|---|---|
| Automated strategy execution | ✅ 7 built-in strategies | ❌ manual only |
| Custom strategy framework | ✅ pluggable `BaseStrategy` | ❌ |
| Strategy scheduling (cron) | ✅ per-strategy cron config | ❌ |
| Signal-driven position sizing | ✅ % of equity | ❌ |
| Multi-symbol strategy | ✅ | ❌ |
| Stop loss / take profit (auto) | ✅ position monitor | ❌ (broker alert only) |
| Trailing stop (automatic) | ✅ highest-price tracking | ❌ |
| Max hold time (auto-close) | ✅ | ❌ |
| Backtesting engine | ✅ full OHLCV replay | ❌ |
| Backtest Sharpe / drawdown / win rate | ✅ | ❌ |
| Backtest equity curve | ✅ | ❌ |
| Backtest trade log | ✅ | ❌ |
| Backtest comparison (side-by-side) | ✅ | ❌ |
| Parameter optimizer (grid search) | ✅ ranked by Sharpe | ❌ |
| Walk-forward / out-of-sample testing | ❌ | ❌ |
| Slippage and commission modeling | ✅ configurable | ❌ |
| Strategy P&L tracking (daily) | ✅ | ❌ |

**Gap summary:** Quant Platform is dramatically ahead of Webull in systematic trading. The only missing quantitative feature is walk-forward / out-of-sample testing.

---

## 4. Risk Management (Quant Platform advantage)

| Feature | Quant Platform | Webull |
|---|---|---|
| Global kill switch | ✅ Redis-backed, instant halt | ❌ |
| Emergency liquidation | ✅ one-click, audited | ❌ (manual only) |
| Daily loss limit enforcement | ✅ auto-block new orders | ❌ |
| Max drawdown enforcement | ✅ | ❌ |
| Max position size cap | ✅ % of equity | ❌ |
| Max concurrent positions | ✅ | ❌ |
| Order rate limiting | ✅ (orders/min) | ❌ |
| Risk rejection audit trail | ✅ | ❌ |
| Strategy-level pause (no kill) | ✅ | ❌ |
| Portfolio VaR (95%) | ✅ | ❌ |
| Portfolio beta vs SPY | ✅ | ❌ |
| Correlation matrix | ✅ | ❌ |
| Concentration risk | ✅ | ❌ |
| Margin/leverage risk | ❌ | ✅ (margin call alerts) |
| Options risk (greeks) | ❌ | ✅ |
| Regulatory risk checks | ❌ | ✅ (PDT rule enforcement, etc.) |

**Gap summary:** Quant Platform has institutional-grade systematic risk controls that Webull lacks entirely. Webull covers retail-specific rules (PDT, margin calls, options greeks) that the platform does not.

---

## 5. Research & Fundamental Analysis

| Feature | Quant Platform | Webull |
|---|---|---|
| Stock screener | ✅ (volume/price/change%) | ✅ (200+ filters) |
| Fundamental data (P/E, EPS, revenue) | ❌ | ✅ |
| Analyst ratings & price targets | ❌ | ✅ |
| Financial statements (IS/BS/CF) | ❌ | ✅ |
| SEC filings access | ❌ | ✅ |
| Earnings history | ❌ | ✅ |
| Dividends & yield data | ❌ | ✅ |
| Short interest data | ❌ | ✅ |
| Institutional ownership | ❌ | ✅ |
| Insider transactions | ❌ | ✅ |
| Sector/industry comparison | ❌ | ✅ |
| ETF holdings breakdown | ❌ | ✅ |

**Gap summary:** The screener is bare-bones compared to Webull's 200-filter research suite. All fundamental analysis is missing — the platform is purely price-action / quantitative.

---

## 6. Portfolio & Account Management

| Feature | Quant Platform | Webull |
|---|---|---|
| Equity curve (account) | ✅ TimescaleDB snapshots | ✅ |
| Day P&L display | ✅ | ✅ |
| Position heatmap | ✅ (color-coded by P&L%) | ✅ |
| Strategy-level P&L | ✅ | ❌ |
| Tax lot management | ❌ | ✅ (FIFO/LIFO) |
| Cost basis reporting | ❌ | ✅ |
| Tax forms (1099) | ❌ | ✅ |
| Dividend tracking | ❌ | ✅ |
| Bank account linking | ❌ | ✅ (ACH) |
| IRA / retirement accounts | ❌ | ✅ |
| Margin accounts | ❌ not modeled | ✅ |
| Account statements (PDF) | ❌ | ✅ |
| CSV export (orders/trades) | ✅ | ✅ |
| Multi-account support | ❌ | ✅ |
| SIPC insurance | n/a (Alpaca) | ✅ |

**Gap summary:** Webull has full brokerage account infrastructure (IRA, margin, tax docs, ACH). The platform is purely a trading execution layer on top of Alpaca's account.

---

## 7. Alerts & Notifications

| Feature | Quant Platform | Webull |
|---|---|---|
| Price alerts (above/below) | ✅ | ✅ |
| Volume alerts | ❌ | ✅ |
| Technical indicator alerts | ❌ | ✅ |
| Earnings alerts | ❌ | ✅ |
| News alerts | ❌ | ✅ |
| System / risk alerts | ✅ (risk, order, strategy events) | ❌ |
| Strategy execution alerts | ✅ | ❌ |
| Push notifications (mobile) | ❌ no mobile app | ✅ |
| Email notifications | ❌ | ✅ |
| SMS notifications | ❌ | ✅ |
| In-app real-time (WebSocket) | ✅ | ✅ |

**Gap summary:** Platform has richer automated system alerts; Webull wins on delivery channels (push, email, SMS) and market event types.

---

## 8. Watchlists

| Feature | Quant Platform | Webull |
|---|---|---|
| Create / rename / delete lists | ✅ | ✅ |
| Add / remove symbols | ✅ | ✅ |
| Live quotes per symbol | ✅ (price, bid/ask, OHLV, change%) | ✅ |
| Column customization | ❌ fixed columns | ✅ |
| Sort by any column | ❌ | ✅ |
| Intraday mini-charts in list | ❌ | ✅ |
| Sync across devices | ❌ (local JWT session) | ✅ |
| Watchlist on mobile | ❌ no mobile app | ✅ |
| Import from CSV | ❌ | ✅ |
| Community/shared lists | ❌ | ✅ |
| One-click trade from list | ❌ | ✅ |

**Gap summary:** Core watchlist CRUD is feature-complete; missing column sorting, mini-charts, and one-click trading from the list.

---

## 9. Audit, Compliance & Security

| Feature | Quant Platform | Webull |
|---|---|---|
| Immutable audit log | ✅ every action | ❌ no user-visible log |
| Kill switch with reason | ✅ | ❌ |
| Action attribution (actor) | ✅ user + strategy | ❌ |
| 2FA authentication | ❌ single-user JWT | ✅ |
| Role-based access | ❌ single admin user | ✅ |
| Biometric login | ❌ | ✅ (mobile) |
| FINRA/SEC compliance tooling | ❌ | ✅ |
| Regulatory reporting | ❌ | ✅ |

**Gap summary:** The platform has stronger internal auditability; Webull has stronger user security and regulatory compliance.

---

## 10. Infrastructure & Operations

| Feature | Quant Platform | Webull |
|---|---|---|
| Self-hosted | ✅ on your machine | ❌ SaaS only |
| Open source / customizable | ✅ | ❌ |
| REST API | ✅ FastAPI, fully documented | ❌ (no public API) |
| WebSocket real-time feed | ✅ | ✅ |
| Broker-agnostic design | ✅ (swap broker adapter) | ❌ |
| TimescaleDB time-series storage | ✅ | ❌ |
| Celery task queue | ✅ | ❌ |
| Health monitoring endpoints | ✅ | ❌ |
| Docker / LaunchAgent deployment | ✅ | ❌ |
| Mobile app | ❌ | ✅ (iOS + Android) |
| Desktop app | ❌ web only | ✅ |
| Cloud reliability / uptime SLA | ❌ self-managed | ✅ 99.9%+ |

---

## Scorecard Summary

| Category | Quant Platform | Webull | Winner |
|---|:---:|:---:|---|
| Automated trading & strategies | 10/10 | 0/10 | **Quant Platform** |
| Backtesting & optimization | 9/10 | 0/10 | **Quant Platform** |
| Risk management | 9/10 | 4/10 | **Quant Platform** |
| Audit & compliance | 8/10 | 5/10 | **Quant Platform** |
| Order types & execution | 5/10 | 9/10 | Webull |
| Market data & charting | 4/10 | 9/10 | Webull |
| Fundamental research | 1/10 | 9/10 | Webull |
| Portfolio management | 5/10 | 8/10 | Webull |
| Alerts & notifications | 6/10 | 8/10 | Webull |
| Watchlists | 6/10 | 9/10 | Webull |
| Security & auth | 3/10 | 8/10 | Webull |
| Mobile / UX | 2/10 | 10/10 | Webull |
| Infrastructure / API | 9/10 | 2/10 | **Quant Platform** |

---

## Top Gap Priorities (by implementation effort vs. impact)

### High impact, moderate effort
1. **Interactive price chart** — candlestick chart with timeframe selector and basic indicators (SMA, RSI overlay). This is the single biggest UX gap.
2. **GTC / IOC time-in-force** — two-line backend change + dropdown in UI.
3. **Stop-limit order type** — minor broker.py addition.
4. **One-click trade from watchlist** — modal reuse from Orders page.
5. **Watchlist column sort** — 10 lines of `useState` sort logic.

### High impact, high effort
6. **Level 2 order book** — requires Alpaca data subscription + new WebSocket stream.
7. **Earnings & economic calendar** — requires a financial data API (Polygon, Alpha Vantage).
8. **Fundamental data** (P/E, EPS, analysts) — requires Polygon or similar.
9. **Options trading** — major risk model expansion required.
10. **Mobile app / PWA** — React app can be progressively enhanced.

### Medium impact, low effort
11. **Email/push alert delivery** — SMTP sender or Twilio in alert service.
12. **Volume and indicator price alerts** — extend `PriceAlert` model with `alert_type` field.
13. **Multi-user / role-based auth** — FastAPI `OAuth2` + user table.
14. **Screener: more filters** — Alpaca snapshot data can add market-cap proxy, avg volume, etc.
