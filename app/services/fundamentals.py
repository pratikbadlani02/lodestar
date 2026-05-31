"""
Fundamentals / options / earnings data service.

Wraps yfinance (synchronous) calls inside an asyncio thread executor and
caches results in Redis to stay well under Yahoo's implicit rate limits.

yfinance is the data source for everything Alpaca's free tier does not provide:
options chains, company financials, earnings calendar, analyst recommendations,
and institutional holders.
"""
from __future__ import annotations

import asyncio
import json
import math
from datetime import date, datetime
from typing import Any

import pandas as pd
import yfinance as yf

from app.core.logging import get_logger
from app.services.control import get_redis

logger = get_logger(__name__)


# ── Cache TTLs (seconds) ──────────────────────────────────────────
TTL_PROFILE = 60 * 60 * 24       # company profile rarely changes
TTL_FUNDAMENTALS = 60 * 60 * 6   # financials update quarterly
TTL_OPTIONS = 60 * 5             # options chain — short for live use
TTL_OPT_EXPIRIES = 60 * 60       # expirations don't change often
TTL_EARNINGS = 60 * 60 * 6
TTL_CALENDAR = 60 * 60 * 2
TTL_ANALYSTS = 60 * 60 * 12
TTL_HOLDERS = 60 * 60 * 24
TTL_DIVIDENDS = 60 * 60 * 12
TTL_SPLITS = 60 * 60 * 24
TTL_SUSTAINABILITY = 60 * 60 * 24
TTL_REC_TREND = 60 * 60 * 12
TTL_SURPRISE = 60 * 60 * 6
TTL_SHORT_INTEREST = 60 * 60 * 6


def _clean(v: Any) -> Any:
    """Convert pandas / numpy types to plain JSON-serialisable values."""
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, (pd.Timestamp, datetime, date)):
        return v.isoformat()
    if hasattr(v, "item"):
        try:
            x = v.item()
            if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
                return None
            return x
        except Exception:
            pass
    return v


def _df_to_records(df: pd.DataFrame | None) -> list[dict[str, Any]]:
    if df is None or df.empty:
        return []
    df = df.reset_index()
    df.columns = [str(c) for c in df.columns]
    out: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        out.append({c: _clean(row[c]) for c in df.columns})
    return out


def _statement_to_records(df: pd.DataFrame | None) -> list[dict[str, Any]]:
    """Transpose a financial statement so each row is one period."""
    if df is None or df.empty:
        return []
    df = df.T
    df.index = [
        d.isoformat() if isinstance(d, (pd.Timestamp, datetime, date)) else str(d)
        for d in df.index
    ]
    out: list[dict[str, Any]] = []
    for period, row in df.iterrows():
        rec: dict[str, Any] = {"period": period}
        for k, v in row.items():
            rec[str(k)] = _clean(v)
        out.append(rec)
    return out


async def _cached(key: str, ttl: int, loader, cache_if=None):
    """Generic Redis-backed JSON cache wrapper.

    cache_if: optional predicate(data) -> bool. When given, the result is only
    written to the cache if it returns True. Used to avoid caching an empty
    payload (e.g. a transient Yahoo rate-limit / block) for the full TTL, which
    would otherwise keep a view blank long after the upstream recovers.
    """
    r = await get_redis()
    cached = await r.get(key)
    if cached:
        try:
            return json.loads(cached)
        except json.JSONDecodeError:
            pass
    data = await asyncio.to_thread(loader)
    try:
        if cache_if is None or cache_if(data):
            await r.set(key, json.dumps(data, default=str), ex=ttl)
    except (TypeError, ValueError) as e:
        logger.warning("cache_set_failed", key=key, error=str(e))
    return data


# ── Profile / key stats ───────────────────────────────────────────
async def get_profile(symbol: str) -> dict[str, Any]:
    sym = symbol.upper()

    def loader() -> dict[str, Any]:
        t = yf.Ticker(sym)
        info = t.info or {}
        keys = [
            "shortName", "longName", "symbol", "quoteType", "exchange",
            "sector", "industry", "longBusinessSummary", "website", "country",
            "city", "state", "address1", "fullTimeEmployees", "ipoExpectedDate",
            "marketCap", "enterpriseValue", "sharesOutstanding", "floatShares",
            "trailingPE", "forwardPE", "priceToBook", "priceToSalesTrailing12Months",
            "trailingEps", "forwardEps", "pegRatio", "beta",
            "fiftyTwoWeekHigh", "fiftyTwoWeekLow", "fiftyDayAverage",
            "twoHundredDayAverage", "averageVolume", "averageVolume10days",
            "dividendRate", "dividendYield", "payoutRatio", "exDividendDate",
            "lastDividendDate", "lastDividendValue",
            "profitMargins", "grossMargins", "operatingMargins",
            "returnOnAssets", "returnOnEquity",
            "totalRevenue", "revenuePerShare", "revenueGrowth",
            "earningsGrowth", "earningsQuarterlyGrowth",
            "ebitda", "totalCash", "totalCashPerShare", "totalDebt",
            "debtToEquity", "currentRatio", "quickRatio",
            "regularMarketPrice", "regularMarketPreviousClose",
            "regularMarketOpen", "regularMarketDayHigh", "regularMarketDayLow",
            "regularMarketVolume", "bid", "ask", "bidSize", "askSize",
            "currency",
        ]
        return {"symbol": sym, **{k: _clean(info.get(k)) for k in keys}}

    return await _cached(f"fund:profile:{sym}", TTL_PROFILE, loader)


# ── Fundamentals: financial statements + key ratios ───────────────
async def get_fundamentals(symbol: str, period: str = "annual") -> dict[str, Any]:
    sym = symbol.upper()
    period = "quarterly" if period == "quarterly" else "annual"

    def loader() -> dict[str, Any]:
        t = yf.Ticker(sym)
        if period == "quarterly":
            income = t.quarterly_financials
            balance = t.quarterly_balance_sheet
            cash = t.quarterly_cashflow
        else:
            income = t.financials
            balance = t.balance_sheet
            cash = t.cashflow
        return {
            "symbol": sym,
            "period": period,
            "income_statement": _statement_to_records(income),
            "balance_sheet": _statement_to_records(balance),
            "cash_flow": _statement_to_records(cash),
        }

    return await _cached(f"fund:financials:{sym}:{period}", TTL_FUNDAMENTALS, loader)


# ── Options chain ─────────────────────────────────────────────────
async def get_option_expirations(symbol: str) -> list[str]:
    sym = symbol.upper()

    def loader() -> list[str]:
        t = yf.Ticker(sym)
        return list(t.options or [])

    return await _cached(f"fund:opt:exp:{sym}", TTL_OPT_EXPIRIES, loader)


async def get_option_chain(symbol: str, expiry: str) -> dict[str, Any]:
    sym = symbol.upper()

    def loader() -> dict[str, Any]:
        t = yf.Ticker(sym)
        try:
            chain = t.option_chain(expiry)
        except Exception as e:
            logger.warning("options_fetch_failed", symbol=sym, expiry=expiry, error=str(e))
            return {"symbol": sym, "expiry": expiry, "calls": [], "puts": [], "underlying": None}

        info = t.info or {}
        underlying = _clean(info.get("regularMarketPrice")) or _clean(info.get("previousClose"))

        def normalise(df: pd.DataFrame) -> list[dict[str, Any]]:
            keep = [
                "contractSymbol", "strike", "lastPrice", "bid", "ask",
                "change", "percentChange", "volume", "openInterest",
                "impliedVolatility", "inTheMoney", "lastTradeDate",
            ]
            out = []
            for _, row in df.iterrows():
                out.append({k: _clean(row[k]) for k in keep if k in df.columns})
            return out

        return {
            "symbol": sym,
            "expiry": expiry,
            "underlying": underlying,
            "calls": normalise(chain.calls),
            "puts": normalise(chain.puts),
        }

    return await _cached(f"fund:opt:chain:{sym}:{expiry}", TTL_OPTIONS, loader)


# ── Earnings ──────────────────────────────────────────────────────
async def get_earnings_history(symbol: str) -> dict[str, Any]:
    sym = symbol.upper()

    def loader() -> dict[str, Any]:
        t = yf.Ticker(sym)
        try:
            hist = t.earnings_history
        except Exception:
            hist = None
        try:
            dates = t.earnings_dates
        except Exception:
            dates = None
        return {
            "symbol": sym,
            "history": _df_to_records(hist),
            "upcoming": _df_to_records(dates.head(8) if dates is not None and not dates.empty else None),
        }

    return await _cached(f"fund:earn:hist:{sym}", TTL_EARNINGS, loader)


async def get_earnings_calendar(symbols: list[str]) -> list[dict[str, Any]]:
    """Aggregate upcoming earnings across the given symbols."""
    syms = sorted({s.upper() for s in symbols if s})
    if not syms:
        return []
    key = f"fund:earn:cal:{','.join(syms)}"

    def loader() -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        failed: list[str] = []
        for s in syms:
            row: dict[str, Any] | None = None
            try:
                t = yf.Ticker(s)
                cal = t.calendar
                if isinstance(cal, dict):
                    earn_dates = cal.get("Earnings Date") or []
                    if earn_dates:
                        row = {
                            "symbol": s,
                            "earnings_date": _clean(earn_dates[0]),
                            "eps_estimate": _clean(cal.get("Earnings Average")),
                            "eps_high": _clean(cal.get("Earnings High")),
                            "eps_low": _clean(cal.get("Earnings Low")),
                            "revenue_estimate": _clean(cal.get("Revenue Average")),
                        }
                elif isinstance(cal, pd.DataFrame) and not cal.empty:
                    rowdata = cal.iloc[:, 0]
                    row = {
                        "symbol": s,
                        "earnings_date": _clean(rowdata.get("Earnings Date")),
                        "eps_estimate": _clean(rowdata.get("Earnings Average")),
                        "revenue_estimate": _clean(rowdata.get("Revenue Average")),
                    }
            except Exception as e:
                logger.debug("calendar_symbol_error", symbol=s, error=str(e))
            if row:
                out.append(row)
            else:
                failed.append(s)
        if failed:
            # Surfaced at WARNING (not debug) so the upstream cause — almost
            # always Yahoo rate-limiting / blocking the deploy's egress IP — is
            # visible in production logs instead of silently rendering blank.
            logger.warning(
                "earnings_calendar_no_data",
                failed=len(failed), total=len(syms), symbols=failed[:25],
            )
        out.sort(key=lambda x: (x.get("earnings_date") or "9999"))
        return out

    # Don't cache an all-empty result: a transient upstream failure shouldn't
    # keep the calendar blank for the full TTL after Yahoo recovers.
    return await _cached(key, TTL_CALENDAR, loader, cache_if=bool)


# ── Analyst recommendations + price targets ───────────────────────
async def get_analyst_data(symbol: str) -> dict[str, Any]:
    sym = symbol.upper()

    def loader() -> dict[str, Any]:
        t = yf.Ticker(sym)
        info = t.info or {}
        try:
            recs = t.recommendations
        except Exception:
            recs = None
        try:
            ratings = t.upgrades_downgrades
        except Exception:
            ratings = None
        return {
            "symbol": sym,
            "recommendation_mean": _clean(info.get("recommendationMean")),
            "recommendation_key": _clean(info.get("recommendationKey")),
            "number_of_analysts": _clean(info.get("numberOfAnalystOpinions")),
            "target_high": _clean(info.get("targetHighPrice")),
            "target_low": _clean(info.get("targetLowPrice")),
            "target_mean": _clean(info.get("targetMeanPrice")),
            "target_median": _clean(info.get("targetMedianPrice")),
            "recommendations": _df_to_records(recs.tail(12) if recs is not None and not recs.empty else None),
            "rating_changes": _df_to_records(ratings.head(25) if ratings is not None and not ratings.empty else None),
        }

    return await _cached(f"fund:analyst:{sym}", TTL_ANALYSTS, loader)


# ── Institutional + insider holders ───────────────────────────────
async def get_dividends(symbol: str) -> dict[str, Any]:
    sym = symbol.upper()

    def loader() -> dict[str, Any]:
        t = yf.Ticker(sym)
        info = t.info or {}
        try:
            divs = t.dividends  # pandas Series indexed by date
        except Exception:
            divs = None
        records: list[dict[str, Any]] = []
        if divs is not None and not divs.empty:
            for d, v in divs.tail(60).items():
                records.append({
                    "date": d.isoformat() if hasattr(d, "isoformat") else str(d),
                    "amount": _clean(v),
                })
            records.reverse()
        return {
            "symbol": sym,
            "dividend_rate": _clean(info.get("dividendRate")),
            "dividend_yield": _clean(info.get("dividendYield")),
            "payout_ratio": _clean(info.get("payoutRatio")),
            "ex_dividend_date": _clean(info.get("exDividendDate")),
            "last_dividend_date": _clean(info.get("lastDividendDate")),
            "last_dividend_value": _clean(info.get("lastDividendValue")),
            "five_year_avg_yield": _clean(info.get("fiveYearAvgDividendYield")),
            "history": records,
        }

    return await _cached(f"fund:div:{sym}", TTL_DIVIDENDS, loader)


async def get_splits(symbol: str) -> dict[str, Any]:
    sym = symbol.upper()

    def loader() -> dict[str, Any]:
        t = yf.Ticker(sym)
        try:
            splits = t.splits
        except Exception:
            splits = None
        records: list[dict[str, Any]] = []
        if splits is not None and not splits.empty:
            for d, v in splits.items():
                records.append({
                    "date": d.isoformat() if hasattr(d, "isoformat") else str(d),
                    "ratio": _clean(v),
                })
            records.reverse()
        return {"symbol": sym, "history": records}

    return await _cached(f"fund:splits:{sym}", TTL_SPLITS, loader)


async def get_sustainability(symbol: str) -> dict[str, Any]:
    sym = symbol.upper()

    def loader() -> dict[str, Any]:
        t = yf.Ticker(sym)
        try:
            s = t.sustainability
        except Exception:
            s = None
        if s is None or (hasattr(s, "empty") and s.empty):
            return {"symbol": sym, "scores": None}
        scores: dict[str, Any] = {}
        try:
            for k, v in s.itertuples():
                scores[str(k)] = _clean(v)
        except Exception:
            try:
                col = s.columns[0]
                for k in s.index:
                    scores[str(k)] = _clean(s.loc[k, col])
            except Exception:
                pass
        return {"symbol": sym, "scores": scores}

    return await _cached(f"fund:esg:{sym}", TTL_SUSTAINABILITY, loader)


async def get_recommendation_trend(symbol: str) -> dict[str, Any]:
    sym = symbol.upper()

    def loader() -> dict[str, Any]:
        t = yf.Ticker(sym)
        try:
            recs = t.recommendations
        except Exception:
            recs = None
        return {
            "symbol": sym,
            "trend": _df_to_records(recs.tail(6) if recs is not None and not recs.empty else None),
        }

    return await _cached(f"fund:rectrend:{sym}", TTL_REC_TREND, loader)


async def get_earnings_surprise(symbol: str) -> dict[str, Any]:
    """Recent quarterly EPS actual vs estimate with surprise %."""
    sym = symbol.upper()

    def loader() -> dict[str, Any]:
        t = yf.Ticker(sym)
        try:
            hist = t.earnings_history
        except Exception:
            hist = None
        records: list[dict[str, Any]] = []
        if hist is not None and not hist.empty:
            df = hist.reset_index()
            df.columns = [str(c) for c in df.columns]
            for _, row in df.iterrows():
                actual = row.get("epsActual")
                est = row.get("epsEstimate")
                surprise = row.get("epsDifference")
                surprise_pct = row.get("surprisePercent")
                if surprise_pct is None and est not in (None, 0) and actual is not None:
                    try:
                        surprise_pct = (float(actual) - float(est)) / abs(float(est))
                    except Exception:
                        surprise_pct = None
                records.append({
                    "quarter": _clean(row.get("quarter") or row.get("index")),
                    "actual": _clean(actual),
                    "estimate": _clean(est),
                    "surprise": _clean(surprise),
                    "surprise_pct": _clean(surprise_pct),
                })
        beats = sum(1 for r in records if (r.get("surprise") or 0) > 0)
        misses = sum(1 for r in records if (r.get("surprise") or 0) < 0)
        return {
            "symbol": sym,
            "beat_count": beats,
            "miss_count": misses,
            "history": records[-12:],
        }

    return await _cached(f"fund:surprise:{sym}", TTL_SURPRISE, loader)


async def get_short_interest(symbol: str) -> dict[str, Any]:
    """Short interest snapshot."""
    sym = symbol.upper()

    def loader() -> dict[str, Any]:
        t = yf.Ticker(sym)
        info = t.info or {}
        keys = [
            "sharesShort", "sharesShortPriorMonth", "sharesShortPreviousMonthDate",
            "shortRatio", "shortPercentOfFloat", "shortPercentSharesOut",
            "dateShortInterest", "floatShares", "sharesOutstanding",
        ]
        data = {k: _clean(info.get(k)) for k in keys}
        # Compute change vs prior month
        cur = info.get("sharesShort")
        prior = info.get("sharesShortPriorMonth")
        change_pct = None
        if cur is not None and prior not in (None, 0):
            try:
                change_pct = (float(cur) - float(prior)) / float(prior) * 100
            except Exception:
                pass
        data["change_pct_vs_prior_month"] = _clean(change_pct)
        return {"symbol": sym, **data}

    return await _cached(f"fund:short:{sym}", TTL_SHORT_INTEREST, loader)


async def get_holders(symbol: str) -> dict[str, Any]:
    sym = symbol.upper()

    def loader() -> dict[str, Any]:
        t = yf.Ticker(sym)
        try:
            inst = t.institutional_holders
        except Exception:
            inst = None
        try:
            mut = t.mutualfund_holders
        except Exception:
            mut = None
        try:
            insiders = t.insider_transactions
        except Exception:
            insiders = None
        try:
            major = t.major_holders
        except Exception:
            major = None
        return {
            "symbol": sym,
            "major": _df_to_records(major),
            "institutional": _df_to_records(inst),
            "mutual_fund": _df_to_records(mut),
            "insider_transactions": _df_to_records(insiders.head(30) if insiders is not None and not insiders.empty else None),
        }

    return await _cached(f"fund:holders:{sym}", TTL_HOLDERS, loader)
