// Bundled symbol directory — lets search resolve the broad US universe by
// ticker OR company name (not just watchlist/recents). Curated set of the most
// recognizable large/mid-caps, popular retail names, and major ETFs. Arbitrary
// tickers still work via the "Go to" fallback in the search surfaces, so this
// list only needs to cover what users are likely to *type a name* for.
//
// Format: [ticker, name, type]  (type: 's' stock, 'e' ETF, 'c' crypto)

const RAW = [
  // ── Mega-cap tech / communication ──────────────────────────────
  ['AAPL', 'Apple Inc.', 's'], ['MSFT', 'Microsoft Corp.', 's'], ['NVDA', 'NVIDIA Corp.', 's'],
  ['GOOGL', 'Alphabet (Google) Class A', 's'], ['GOOG', 'Alphabet (Google) Class C', 's'],
  ['AMZN', 'Amazon.com Inc.', 's'], ['META', 'Meta Platforms Inc.', 's'], ['TSLA', 'Tesla Inc.', 's'],
  ['AVGO', 'Broadcom Inc.', 's'], ['ORCL', 'Oracle Corp.', 's'], ['CRM', 'Salesforce Inc.', 's'],
  ['ADBE', 'Adobe Inc.', 's'], ['AMD', 'Advanced Micro Devices', 's'], ['INTC', 'Intel Corp.', 's'],
  ['CSCO', 'Cisco Systems', 's'], ['QCOM', 'Qualcomm Inc.', 's'], ['TXN', 'Texas Instruments', 's'],
  ['IBM', 'IBM Corp.', 's'], ['NOW', 'ServiceNow Inc.', 's'], ['INTU', 'Intuit Inc.', 's'],
  ['MU', 'Micron Technology', 's'], ['AMAT', 'Applied Materials', 's'], ['LRCX', 'Lam Research', 's'],
  ['KLAC', 'KLA Corp.', 's'], ['ADI', 'Analog Devices', 's'], ['SNPS', 'Synopsys Inc.', 's'],
  ['CDNS', 'Cadence Design Systems', 's'], ['PANW', 'Palo Alto Networks', 's'], ['CRWD', 'CrowdStrike Holdings', 's'],
  ['SNOW', 'Snowflake Inc.', 's'], ['PLTR', 'Palantir Technologies', 's'], ['NET', 'Cloudflare Inc.', 's'],
  ['DDOG', 'Datadog Inc.', 's'], ['ZS', 'Zscaler Inc.', 's'], ['MDB', 'MongoDB Inc.', 's'],
  ['SHOP', 'Shopify Inc.', 's'], ['UBER', 'Uber Technologies', 's'], ['ABNB', 'Airbnb Inc.', 's'],
  ['SMCI', 'Super Micro Computer', 's'], ['ARM', 'Arm Holdings', 's'], ['TSM', 'Taiwan Semiconductor', 's'],
  ['ASML', 'ASML Holding', 's'], ['MRVL', 'Marvell Technology', 's'], ['ON', 'ON Semiconductor', 's'],
  ['NFLX', 'Netflix Inc.', 's'], ['DIS', 'Walt Disney Co.', 's'], ['CMCSA', 'Comcast Corp.', 's'],
  ['T', 'AT&T Inc.', 's'], ['VZ', 'Verizon Communications', 's'], ['TMUS', 'T-Mobile US', 's'],
  ['SPOT', 'Spotify Technology', 's'], ['RBLX', 'Roblox Corp.', 's'], ['SNAP', 'Snap Inc.', 's'],
  ['PINS', 'Pinterest Inc.', 's'], ['ROKU', 'Roku Inc.', 's'], ['DASH', 'DoorDash Inc.', 's'],
  ['COIN', 'Coinbase Global', 's'], ['MSTR', 'MicroStrategy Inc.', 's'], ['HOOD', 'Robinhood Markets', 's'],

  // ── Financials ─────────────────────────────────────────────────
  ['JPM', 'JPMorgan Chase', 's'], ['BAC', 'Bank of America', 's'], ['WFC', 'Wells Fargo', 's'],
  ['GS', 'Goldman Sachs', 's'], ['MS', 'Morgan Stanley', 's'], ['C', 'Citigroup Inc.', 's'],
  ['BLK', 'BlackRock Inc.', 's'], ['AXP', 'American Express', 's'], ['SCHW', 'Charles Schwab', 's'],
  ['V', 'Visa Inc.', 's'], ['MA', 'Mastercard Inc.', 's'], ['PYPL', 'PayPal Holdings', 's'],
  ['BRK.B', 'Berkshire Hathaway B', 's'], ['SQ', 'Block Inc. (Square)', 's'], ['SOFI', 'SoFi Technologies', 's'],
  ['USB', 'U.S. Bancorp', 's'], ['PNC', 'PNC Financial', 's'], ['TFC', 'Truist Financial', 's'],
  ['COF', 'Capital One Financial', 's'], ['SPGI', 'S&P Global', 's'], ['CME', 'CME Group', 's'],
  ['ICE', 'Intercontinental Exchange', 's'], ['CB', 'Chubb Ltd.', 's'], ['MMC', 'Marsh & McLennan', 's'],

  // ── Healthcare ─────────────────────────────────────────────────
  ['UNH', 'UnitedHealth Group', 's'], ['JNJ', 'Johnson & Johnson', 's'], ['LLY', 'Eli Lilly & Co.', 's'],
  ['PFE', 'Pfizer Inc.', 's'], ['ABBV', 'AbbVie Inc.', 's'], ['MRK', 'Merck & Co.', 's'],
  ['TMO', 'Thermo Fisher Scientific', 's'], ['ABT', 'Abbott Laboratories', 's'], ['DHR', 'Danaher Corp.', 's'],
  ['BMY', 'Bristol-Myers Squibb', 's'], ['AMGN', 'Amgen Inc.', 's'], ['GILD', 'Gilead Sciences', 's'],
  ['CVS', 'CVS Health', 's'], ['MDT', 'Medtronic plc', 's'], ['ISRG', 'Intuitive Surgical', 's'],
  ['VRTX', 'Vertex Pharmaceuticals', 's'], ['REGN', 'Regeneron Pharmaceuticals', 's'], ['MRNA', 'Moderna Inc.', 's'],
  ['HUM', 'Humana Inc.', 's'], ['ELV', 'Elevance Health', 's'], ['ZTS', 'Zoetis Inc.', 's'],

  // ── Consumer ───────────────────────────────────────────────────
  ['WMT', 'Walmart Inc.', 's'], ['COST', 'Costco Wholesale', 's'], ['HD', 'Home Depot', 's'],
  ['LOW', 'Lowe\'s Companies', 's'], ['MCD', 'McDonald\'s Corp.', 's'], ['NKE', 'Nike Inc.', 's'],
  ['SBUX', 'Starbucks Corp.', 's'], ['TGT', 'Target Corp.', 's'], ['BKNG', 'Booking Holdings', 's'],
  ['CMG', 'Chipotle Mexican Grill', 's'], ['TJX', 'TJX Companies', 's'], ['PG', 'Procter & Gamble', 's'],
  ['KO', 'Coca-Cola Co.', 's'], ['PEP', 'PepsiCo Inc.', 's'], ['MDLZ', 'Mondelez International', 's'],
  ['PM', 'Philip Morris International', 's'], ['MO', 'Altria Group', 's'], ['CL', 'Colgate-Palmolive', 's'],
  ['KHC', 'Kraft Heinz', 's'], ['GIS', 'General Mills', 's'], ['F', 'Ford Motor Co.', 's'],
  ['GM', 'General Motors', 's'], ['RIVN', 'Rivian Automotive', 's'], ['LCID', 'Lucid Group', 's'],
  ['NIO', 'NIO Inc.', 's'], ['LULU', 'Lululemon Athletica', 's'], ['DKNG', 'DraftKings Inc.', 's'],

  // ── Industrials / Energy / Materials ──────────────────────────
  ['CAT', 'Caterpillar Inc.', 's'], ['BA', 'Boeing Co.', 's'], ['HON', 'Honeywell International', 's'],
  ['GE', 'GE Aerospace', 's'], ['UPS', 'United Parcel Service', 's'], ['RTX', 'RTX Corp.', 's'],
  ['LMT', 'Lockheed Martin', 's'], ['UNP', 'Union Pacific', 's'], ['DE', 'Deere & Co.', 's'],
  ['GD', 'General Dynamics', 's'], ['NOC', 'Northrop Grumman', 's'], ['FDX', 'FedEx Corp.', 's'],
  ['XOM', 'Exxon Mobil', 's'], ['CVX', 'Chevron Corp.', 's'], ['COP', 'ConocoPhillips', 's'],
  ['SLB', 'Schlumberger (SLB)', 's'], ['EOG', 'EOG Resources', 's'], ['PSX', 'Phillips 66', 's'],
  ['MPC', 'Marathon Petroleum', 's'], ['OXY', 'Occidental Petroleum', 's'], ['LIN', 'Linde plc', 's'],
  ['SHW', 'Sherwin-Williams', 's'], ['APD', 'Air Products & Chemicals', 's'], ['FCX', 'Freeport-McMoRan', 's'],
  ['NEM', 'Newmont Corp.', 's'],

  // ── Utilities / Real Estate ────────────────────────────────────
  ['NEE', 'NextEra Energy', 's'], ['SO', 'Southern Co.', 's'], ['DUK', 'Duke Energy', 's'],
  ['AEP', 'American Electric Power', 's'], ['PLD', 'Prologis Inc.', 's'], ['AMT', 'American Tower', 's'],
  ['EQIX', 'Equinix Inc.', 's'], ['O', 'Realty Income', 's'],

  // ── Popular retail / misc ──────────────────────────────────────
  ['GME', 'GameStop Corp.', 's'], ['AMC', 'AMC Entertainment', 's'], ['MARA', 'Marathon Digital', 's'],
  ['RIOT', 'Riot Platforms', 's'], ['BABA', 'Alibaba Group', 's'], ['PDD', 'PDD Holdings', 's'],
  ['JD', 'JD.com Inc.', 's'], ['NU', 'Nu Holdings', 's'], ['CVNA', 'Carvana Co.', 's'],
  ['AFRM', 'Affirm Holdings', 's'], ['UPST', 'Upstart Holdings', 's'], ['ENPH', 'Enphase Energy', 's'],
  ['FSLR', 'First Solar', 's'], ['CCJ', 'Cameco Corp.', 's'], ['DELL', 'Dell Technologies', 's'],

  // ── Major ETFs ─────────────────────────────────────────────────
  ['SPY', 'SPDR S&P 500 ETF', 'e'], ['QQQ', 'Invesco Nasdaq 100 ETF', 'e'],
  ['DIA', 'SPDR Dow Jones ETF', 'e'], ['IWM', 'iShares Russell 2000 ETF', 'e'],
  ['VOO', 'Vanguard S&P 500 ETF', 'e'], ['VTI', 'Vanguard Total Market ETF', 'e'],
  ['VEA', 'Vanguard Developed Markets ETF', 'e'], ['VWO', 'Vanguard Emerging Markets ETF', 'e'],
  ['ARKK', 'ARK Innovation ETF', 'e'], ['SOXX', 'iShares Semiconductor ETF', 'e'],
  ['SMH', 'VanEck Semiconductor ETF', 'e'], ['XLK', 'Technology Select Sector', 'e'],
  ['XLF', 'Financials Select Sector', 'e'], ['XLE', 'Energy Select Sector', 'e'],
  ['XLV', 'Health Care Select Sector', 'e'], ['XLY', 'Consumer Discretionary Sector', 'e'],
  ['XLP', 'Consumer Staples Sector', 'e'], ['XLI', 'Industrials Select Sector', 'e'],
  ['XLU', 'Utilities Select Sector', 'e'], ['XLB', 'Materials Select Sector', 'e'],
  ['XLRE', 'Real Estate Select Sector', 'e'], ['XLC', 'Communication Services Sector', 'e'],
  ['GLD', 'SPDR Gold Shares', 'e'], ['SLV', 'iShares Silver Trust', 'e'],
  ['USO', 'United States Oil Fund', 'e'], ['TLT', 'iShares 20+ Year Treasury', 'e'],
  ['HYG', 'iShares High Yield Bond ETF', 'e'], ['UUP', 'Invesco US Dollar Index', 'e'],
  ['VXX', 'iPath VIX Short-Term', 'e'], ['UVXY', 'ProShares Ultra VIX', 'e'],
  ['TQQQ', 'ProShares UltraPro QQQ', 'e'], ['SQQQ', 'ProShares UltraPro Short QQQ', 'e'],
  ['BITO', 'ProShares Bitcoin Strategy ETF', 'e'], ['SCHD', 'Schwab US Dividend Equity', 'e'],
  ['JEPI', 'JPMorgan Equity Premium Income', 'e'], ['IBIT', 'iShares Bitcoin Trust', 'e'],

  // ── Crypto pairs (for the crypto page) ─────────────────────────
  ['BTC/USD', 'Bitcoin', 'c'], ['ETH/USD', 'Ethereum', 'c'], ['SOL/USD', 'Solana', 'c'],
  ['DOGE/USD', 'Dogecoin', 'c'], ['XRP/USD', 'XRP', 'c'], ['ADA/USD', 'Cardano', 'c'],
  ['AVAX/USD', 'Avalanche', 'c'], ['LINK/USD', 'Chainlink', 'c'], ['MATIC/USD', 'Polygon', 'c'],
  ['LTC/USD', 'Litecoin', 'c'],
]

export const SYMBOLS = RAW.map(([s, n, t]) => ({ s, n, t }))

// Quick lookup of a display name for a ticker (used to annotate recents, etc.).
const NAME_MAP = new Map(SYMBOLS.map((x) => [x.s, x.n]))
export function nameFor(ticker) {
  return NAME_MAP.get(String(ticker || '').toUpperCase()) || null
}

const TYPE_LABEL = { s: 'Stock', e: 'ETF', c: 'Crypto' }
export function typeLabel(t) { return TYPE_LABEL[t] || '' }

// Ranked search over ticker + company name. `boost` (e.g. recents/watchlist)
// floats already-known symbols to the top. Returns [{ s, n, t, score }].
export function searchSymbols(query, limit = 8, boost = []) {
  const q = String(query || '').trim()
  if (!q) return []
  const qu = q.toUpperCase()
  const ql = q.toLowerCase()
  const boostSet = new Set((boost || []).map((b) => String(b).toUpperCase()))
  const out = []
  for (const it of SYMBOLS) {
    const s = it.s
    const nl = it.n.toLowerCase()
    let score = 0
    if (s === qu) score = 1000
    else if (s.startsWith(qu)) score = 720 - s.length
    else if (nl.startsWith(ql)) score = 540 - Math.min(40, it.n.length)
    else if (nl.includes(` ${ql}`)) score = 420   // word-boundary match in name
    else if (s.includes(qu)) score = 300
    else if (nl.includes(ql)) score = 240 - Math.min(40, nl.indexOf(ql))
    else continue
    if (boostSet.has(s)) score += 300
    out.push({ ...it, score })
  }
  out.sort((a, b) => b.score - a.score || a.s.localeCompare(b.s))
  return out.slice(0, limit)
}
