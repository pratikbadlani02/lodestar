// ─────────────────────────────────────────────────────────────────────────
// Field Guide — a plain-English reference for the words a beginner runs into.
//
// Deliberately not a textbook: each entry is one plain line ("short") plus a
// "why it matters" in everyday terms. Grouped into the categories a learner
// actually asks about: indices, lingo, fundamentals, technical, news.
//
// This data is shared on purpose — the same entries can later power tappable
// "explain this" chips on the real Fundamentals / Analysis / News pages.
// Keep `id`s stable so those in-context links don't break.
// ─────────────────────────────────────────────────────────────────────────
import { Layers, MessageSquare, Building2, LineChart, Newspaper, ShieldAlert } from 'lucide-react'

export const CATEGORIES = [
  { id: 'indices',      label: 'Indices & the market', icon: Layers,
    blurb: 'The big bundles everyone quotes when they say “the market”.',
    live: { to: '/market', label: 'See live indices' } },
  { id: 'lingo',        label: 'Everyday trading words', icon: MessageSquare,
    blurb: 'The vocabulary that gets thrown around as if everyone already knows it.',
    live: { to: '/stocks', label: 'See it on a stock' } },
  { id: 'fundamentals', label: 'Reading a company', icon: Building2,
    blurb: 'How to tell whether the business behind the stock is actually healthy.',
    live: { to: '/fundamentals', label: 'Open fundamentals' } },
  { id: 'technical',    label: 'Reading a chart', icon: LineChart,
    blurb: 'What the lines, levels and indicators on a price chart are saying.',
    live: { to: '/analysis', label: 'Open chart analysis' } },
  { id: 'news',         label: 'News & events', icon: Newspaper,
    blurb: 'What actually moves a stock — and how to tell signal from noise.',
    live: { to: '/earnings', label: 'See the earnings calendar' } },
  { id: 'risk',         label: 'Risk & performance', icon: ShieldAlert,
    blurb: 'The numbers that tell you how bumpy the ride was — not just the destination.',
    live: { to: '/analysis', label: 'Open analysis' } },
]

export const TERMS = [
  // ── Indices & the market ───────────────────────────────────────────────
  { id: 'sp500', cat: 'indices', term: 'S&P 500',
    short: 'About 500 of the biggest US companies bundled into one number.',
    why: 'When the news says “the market” went up or down, this is usually what they mean. Owning it = owning a sliver of 500 companies at once — the eggs-in-many-baskets idea.' },
  { id: 'dow', cat: 'indices', term: 'Dow Jones (the Dow)',
    short: '30 huge, famous US companies tracked together — the oldest gauge.',
    why: 'It’s in every headline, but it’s only 30 names and weighted oddly, so the S&P 500 is a truer picture of the whole market.' },
  { id: 'nasdaq', cat: 'indices', term: 'Nasdaq',
    short: 'An index packed with tech and growth companies.',
    why: 'It swings harder than the S&P because tech is more volatile. When tech is hot or cold, the Nasdaq shows it first.' },
  { id: 'etf', cat: 'indices', term: 'Index fund / ETF',
    short: 'One thing you can buy that owns an entire basket for you.',
    why: 'The simplest, most beginner-friendly way to “own the market” without picking individual stocks. Buy one share, own hundreds of companies.' },
  { id: 'sector', cat: 'indices', term: 'Sector',
    short: 'A group of similar companies — tech, energy, healthcare, banks.',
    why: 'Companies in a sector tend to move as a herd. Knowing which sector a stock is in tells you a lot about why it’s moving.' },
  { id: 'marketcap', cat: 'indices', term: 'Market cap',
    short: 'A company’s total price tag = share price × number of shares.',
    why: 'It’s the real “size” of a company (not the share price alone). Big, stable companies are “large cap”; small, risky ones are “small cap”.' },

  // ── Everyday trading words ──────────────────────────────────────────────
  { id: 'ticker', cat: 'lingo', term: 'Ticker',
    short: 'The short code that stands for a company (AAPL = Apple).',
    why: 'It’s how you look up and trade a stock. Like a username for a company.' },
  { id: 'bidask', cat: 'lingo', term: 'Bid & Ask',
    short: 'Bid = the most a buyer will pay right now; Ask = the least a seller will take.',
    why: 'Every trade happens between these two. You usually buy at the ask and sell at the bid — the small gap is a hidden cost.' },
  { id: 'spread', cat: 'lingo', term: 'Spread',
    short: 'The little gap between the bid and the ask price.',
    why: 'A narrow spread means it’s cheap and easy to trade; a wide spread quietly eats into your money every time you buy or sell.' },
  { id: 'volume', cat: 'lingo', term: 'Volume',
    short: 'How many shares changed hands in a period.',
    why: 'High volume means lots of people care — a move on high volume is more convincing than one on a quiet day.' },
  { id: 'volatility', cat: 'lingo', term: 'Volatility',
    short: 'How wildly a price swings — the size of the wiggle.',
    why: 'High volatility means bigger ups AND downs. It’s the main thing that tests your nerves, so it’s really a measure of stress.' },
  { id: 'bullbear', cat: 'lingo', term: 'Bull vs Bear market',
    short: 'Bull = a rising, optimistic market; Bear = a falling, fearful one.',
    why: 'They describe the overall mood. Strategies that win in a bull market often get hurt in a bear — the mood matters as much as the stock.' },
  { id: 'dividend', cat: 'lingo', term: 'Dividend',
    short: 'A cash payment some companies send shareholders, usually quarterly.',
    why: 'It’s a way to get paid just for holding — common in older, steadier companies. Fast-growing ones usually reinvest instead.' },
  { id: 'liquidity', cat: 'lingo', term: 'Liquidity',
    short: 'How easily you can buy or sell without moving the price.',
    why: 'Big stocks are liquid (easy in and out). Tiny ones aren’t — you can get stuck holding, or move the price against yourself.' },
  { id: 'ordertypes', cat: 'lingo', term: 'Market vs Limit order',
    short: 'Market = buy/sell now at whatever the price is; Limit = only at the price you set.',
    why: 'A market order is fast but you take whatever price; a limit order gives you control but might never fill. Beginners often prefer limits.' },

  // ── Reading a company (fundamentals) ────────────────────────────────────
  { id: 'revenue', cat: 'fundamentals', term: 'Revenue (the “top line”)',
    short: 'All the money coming in before any costs.',
    why: 'It shows how big the business is and whether it’s growing. Rising revenue is the first sign a company is winning.' },
  { id: 'earnings', cat: 'fundamentals', term: 'Earnings / Net income (the “bottom line”)',
    short: 'The profit left after all costs are paid.',
    why: 'Revenue is money in; earnings is money kept. A company can sell a lot and still lose money — earnings tells you if it’s actually profitable.' },
  { id: 'eps', cat: 'fundamentals', term: 'EPS (earnings per share)',
    short: 'The company’s profit sliced up per share you own.',
    why: 'It puts profit on a per-share basis so you can compare and track it. Growing EPS usually pulls the stock up over time.' },
  { id: 'pe', cat: 'fundamentals', term: 'P/E ratio (price-to-earnings)',
    short: 'Share price ÷ earnings per share — roughly how many years of profit you’re paying for.',
    why: 'A high P/E means the crowd expects big growth (expensive, high hopes); a low P/E means modest expectations (cheap, or troubled). It’s the most-quoted “is this expensive?” gauge.' },
  { id: 'margin', cat: 'fundamentals', term: 'Profit margin',
    short: 'What fraction of revenue turns into profit.',
    why: 'A high margin means the business keeps a lot of every dollar it makes — a sign of pricing power and efficiency.' },
  { id: 'fcf', cat: 'fundamentals', term: 'Free cash flow',
    short: 'The actual cash left over after running and investing in the business.',
    why: 'Harder to fudge than reported earnings. Real, growing cash flow is one of the strongest signs of a healthy company.' },
  { id: 'balance', cat: 'fundamentals', term: 'Balance sheet (debt vs assets)',
    short: 'A snapshot of what a company owns versus what it owes.',
    why: 'Lots of debt is fine when times are good and dangerous when they aren’t. A strong balance sheet is a survival cushion.' },
  { id: 'guidance', cat: 'fundamentals', term: 'Guidance',
    short: 'The company’s own forecast for next quarter or year.',
    why: 'Often moves the stock MORE than the actual results — markets care about the future, not the past. Weak guidance can sink a stock that just had a great quarter.' },

  // ── Reading a chart (technical) ─────────────────────────────────────────
  { id: 'trend', cat: 'technical', term: 'Trend',
    short: 'The general direction of the price — up, down, or sideways.',
    why: '“The trend is your friend.” Most strategies do far better going with the trend than fighting it.' },
  { id: 'supportresistance', cat: 'technical', term: 'Support & Resistance',
    short: 'Price floors (support) and ceilings (resistance) the crowd tends to defend.',
    why: 'Prices often bounce off these levels because lots of people remember them. They’re where the tug-of-war between buyers and sellers shows up.' },
  { id: 'ma', cat: 'technical', term: 'Moving average',
    short: 'A smoothed line of recent prices that filters out the daily noise.',
    why: 'It reveals the underlying trend and is the classic “are we above or below the line?” signal — exactly how The Bodyguard decides when to play safe.' },
  { id: 'rsi', cat: 'technical', term: 'RSI (overbought / oversold)',
    short: 'A 0–100 gauge of how stretched a recent move is.',
    why: 'Very high (~70+) suggests a run may be overdone; very low (~30−) suggests it’s been beaten down. A hint, never a guarantee.' },
  { id: 'breakout', cat: 'technical', term: 'Breakout',
    short: 'When price punches through a ceiling it couldn’t pass before.',
    why: 'It can mark the start of a new run — the kind of move The Sprinter chases. (It can also be a fake-out, which is The Sprinter’s weakness.)' },
  { id: 'candlestick', cat: 'technical', term: 'Candlestick',
    short: 'One bar showing a period’s open, high, low, and close price.',
    why: 'Each candle packs four numbers into one shape, so a chart of them tells a richer story than a plain line.' },
  { id: 'macd', cat: 'technical', term: 'MACD',
    short: 'A momentum gauge built from two moving averages of the price.',
    why: 'When it turns up it hints momentum is building; when it turns down, fading. A popular “is the move gaining or losing steam?” signal.' },
  { id: 'bollinger', cat: 'technical', term: 'Bollinger Bands',
    short: 'A price channel that widens when things get volatile and narrows when calm.',
    why: 'Price near the top band looks stretched-high, near the bottom looks stretched-low. It frames “how far from normal is this move?”.' },

  // ── Risk & performance ──────────────────────────────────────────────────
  { id: 'sharpe', cat: 'risk', term: 'Sharpe ratio',
    short: 'Return earned for each unit of stomach-churning risk taken.',
    why: 'Two investments can earn the same, but the one with a higher Sharpe did it with a smoother ride. Above ~1 is good; higher is better.' },
  { id: 'beta', cat: 'risk', term: 'Beta',
    short: 'How much a stock moves relative to the whole market.',
    why: 'Beta 1 moves with the market; above 1 swings more (racier); below 1 swings less (calmer). It tells you how wild the ride will be vs the index.' },
  { id: 'maxdrawdown', cat: 'risk', term: 'Max drawdown',
    short: 'The worst peak-to-bottom drop it ever suffered.',
    why: 'The single most honest “could I actually have stomached this?” number. A 50% drawdown means you’d have watched half your money vanish before any recovery.' },
  { id: 'roe', cat: 'fundamentals', term: 'ROE (return on equity)',
    short: 'How much profit a company squeezes from shareholders’ money.',
    why: 'A consistently high ROE is a sign of a high-quality, efficient business — one of the clearest “is this a good company?” signals.' },

  // ── News & events ───────────────────────────────────────────────────────
  { id: 'earningsreport', cat: 'news', term: 'Earnings report',
    short: 'A company’s quarterly scorecard — revenue, profit, and guidance.',
    why: 'The single biggest scheduled event for a stock. Prices often jump or drop sharply right after, so it’s worth knowing when it’s due.' },
  { id: 'beatmiss', cat: 'news', term: 'Beat / Miss (earnings surprise)',
    short: 'Whether results came in above (beat) or below (miss) what analysts expected.',
    why: 'The reaction is about expectations, not the raw number — a great quarter can still tank a stock if hopes were even higher.' },
  { id: 'analystrating', cat: 'news', term: 'Analyst rating & price target',
    short: 'Professional opinions: buy/hold/sell and a guessed future price.',
    why: 'Useful context and they can move a stock short-term — but they’re opinions, often wrong, and not a reason to buy on their own.' },
  { id: 'exdiv', cat: 'news', term: 'Ex-dividend date',
    short: 'The cutoff — you must own the stock before it to receive the next dividend.',
    why: 'Buy the day after and you miss that payment. The price usually drops by roughly the dividend on that date, so it’s not free money.' },
  { id: 'macro', cat: 'news', term: 'Macro & the Fed',
    short: 'Big-picture forces — interest rates, inflation, the economy.',
    why: 'When the Fed moves rates, almost everything moves at once. Sometimes a stock falls for reasons that have nothing to do with the company.' },
  { id: 'signalnoise', cat: 'news', term: 'Signal vs noise',
    short: 'A few headlines truly matter; most are background chatter.',
    why: 'Reacting to every headline is how beginners overtrade and lose. The skill is ignoring the noise and acting only on what really changes the story.' },
]

export function termsByCategory(catId) {
  return TERMS.filter((t) => t.cat === catId)
}

const _byId = Object.fromEntries(TERMS.map((t) => [t.id, t]))
export function getTerm(id) {
  return _byId[id] || null
}
