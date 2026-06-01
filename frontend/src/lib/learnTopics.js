// ─────────────────────────────────────────────────────────────────────────
// Topic tracks — short (2–3 min) interactive deep-dives that complement the
// Field Guide reference. Same step engine as the journey ladder (quiz/chart),
// so they render through the shared RungPlayer. Each track turns a Field Guide
// category from passive reference into active practice.
// ─────────────────────────────────────────────────────────────────────────
import {
  Layers, MessageSquare, Building2, LineChart as LineIcon, Newspaper,
  TrendingUp,
} from 'lucide-react'

export const TOPICS = [
  { id: 'indices',      icon: Layers,        title: 'Indices & the market', blurb: 'What “the market” actually is, ETFs, and what makes a company “big”.' },
  { id: 'lingo',        icon: MessageSquare, title: 'The trading lingo',     blurb: 'Bid/ask, volume, order types and bull-vs-bear, in plain practice.' },
  { id: 'fundamentals', icon: Building2,     title: 'Reading a company',     blurb: 'Revenue vs profit, P/E, margins and why guidance moves stocks.' },
  { id: 'technical',    icon: LineIcon,      title: 'Reading a chart',       blurb: 'Trend, moving averages, RSI and support — the chart’s vocabulary.' },
  { id: 'news',         icon: Newspaper,     title: 'News & events',         blurb: 'Earnings, beats & misses, and telling signal from noise.' },
]

const UPTREND = [10, 11, 10.5, 12, 13, 12.5, 14, 15, 16, 17]
const FLOOR_BOUNCE = [16, 12, 10, 13, 12, 10, 14, 11, 10, 15]

export const TOPIC_STEPS = {
  // ── Indices ─────────────────────────────────────────────────────────────
  indices: [
    { type: 'quiz', icon: Layers, concept: 'The S&P 500',
      scene: 'The news anchor says “the market climbed today.”',
      q: 'What are they almost always talking about?',
      choices: [
        { v: 'a', label: 'The S&P 500 — about 500 big companies bundled into one number', gut: true },
        { v: 'b', label: 'One company literally named “The Market”' },
        { v: 'c', label: 'The building where trading happens' },
      ],
      reveal: '“The market” is shorthand for a big bundle like the S&P 500 — the eggs-in-many-baskets idea, drawn as a single line.' },
    { type: 'quiz', icon: Layers, concept: 'Index funds / ETFs',
      scene: 'You like the idea of owning lots of companies but don’t want to pick them one by one.',
      q: 'What lets you own a whole basket in a single purchase?',
      choices: [
        { v: 'a', label: 'An index fund or ETF — one buy, hundreds of companies', gut: true },
        { v: 'b', label: 'You have to buy each company separately' },
        { v: 'c', label: 'A savings account' },
      ],
      reveal: 'An ETF is the simplest, most beginner-friendly way to “own the market” — instant diversification in one click.' },
    { type: 'quiz', icon: Layers, concept: 'Market cap = real size',
      scene: 'Company A and Company B both trade at $50 a share. But A is worth $2 trillion and B is worth $2 billion.',
      q: 'Which company is actually “bigger”?',
      choices: [
        { v: 'a', label: 'Company A — share price isn’t size, total market cap is', gut: true },
        { v: 'b', label: 'They’re the same — both are $50' },
        { v: 'c', label: 'Impossible to tell' },
      ],
      reveal: 'Share price alone tells you nothing about size. Market cap (price × all shares) is the real price tag — that’s why a $50 stock can be a giant or a minnow.' },
  ],

  // ── Lingo ─────────────────────────────────────────────────────────────
  lingo: [
    { type: 'quiz', icon: MessageSquare, concept: 'Bid, ask & spread',
      scene: 'You want to buy a stock this very second.',
      q: 'Which price do you generally pay?',
      choices: [
        { v: 'a', label: 'The ask — the lowest price a seller will accept right now', gut: true },
        { v: 'b', label: 'The bid — what buyers are offering' },
        { v: 'c', label: 'Whatever price you type in' },
      ],
      reveal: 'You buy at the ask and sell at the bid. The little gap between them — the spread — is a hidden cost you pay on every round trip.' },
    { type: 'quiz', icon: MessageSquare, concept: 'Volume = conviction',
      scene: 'Two stocks both jump 5% today. One did it on huge trading volume, the other on a trickle.',
      q: 'Which move should you trust more?',
      choices: [
        { v: 'a', label: 'The high-volume move — lots of people backed it', gut: true },
        { v: 'b', label: 'The low-volume move — it’s a secret' },
        { v: 'c', label: 'Volume doesn’t matter' },
      ],
      reveal: 'Volume is how many shares changed hands. A big move on big volume has conviction behind it; the same move on light volume can vanish just as fast.' },
    { type: 'quiz', icon: MessageSquare, concept: 'Market vs limit order',
      scene: 'You’d buy this stock, but only if you can get it for $100 or less — never more.',
      q: 'Which order type protects you?',
      choices: [
        { v: 'a', label: 'A limit order — only fills at your price or better', gut: true },
        { v: 'b', label: 'A market order — buys instantly at any price' },
        { v: 'c', label: 'Neither can control price' },
      ],
      reveal: 'A market order is fast but takes whatever price is going; a limit order gives you price control but might never fill. Beginners often prefer limits for exactly this reason.' },
    { type: 'quiz', icon: MessageSquare, concept: 'Bull vs bear',
      scene: 'Someone says “we’re in a bear market.”',
      q: 'What does that mean?',
      choices: [
        { v: 'a', label: 'Prices are falling and the mood is fearful', gut: true },
        { v: 'b', label: 'Prices are rising and everyone’s optimistic' },
        { v: 'c', label: 'Trading is closed' },
      ],
      reveal: 'Bull = rising and optimistic, Bear = falling and fearful. The mood matters: a strategy that wins in a bull market can get mauled in a bear.' },
  ],

  // ── Fundamentals ──────────────────────────────────────────────────────
  fundamentals: [
    { type: 'quiz', icon: Building2, concept: 'Revenue vs earnings',
      scene: 'A company sells $1 billion of product — but it cost them $1.1 billion to make and sell it.',
      q: 'Is this a healthy business?',
      choices: [
        { v: 'a', label: 'No — big sales, but it’s losing money; profit is what’s kept', gut: true },
        { v: 'b', label: 'Yes — a billion in sales is always great' },
        { v: 'c', label: 'Can’t tell from this' },
      ],
      reveal: 'Revenue is money in (“top line”); earnings is money kept after costs (“bottom line”). A company can sell a fortune and still lose money — earnings is the truth.' },
    { type: 'quiz', icon: Building2, concept: 'P/E ratio',
      scene: 'Stock A trades at 50× its earnings; Stock B at 10×.',
      q: 'What does Stock A’s high P/E tell you?',
      choices: [
        { v: 'a', label: 'The crowd is paying up because it expects much faster growth', gut: true },
        { v: 'b', label: 'Stock A is definitely a better buy' },
        { v: 'c', label: 'Stock A is cheaper' },
      ],
      reveal: 'A high P/E means “expensive / high hopes”; a low P/E means “cheap / modest expectations (or trouble)”. It’s the go-to gauge for “how much am I paying for each dollar of profit?”' },
    { type: 'quiz', icon: Building2, concept: 'Profit margin',
      scene: 'Two companies each bring in $1 billion of revenue. One keeps $300M as profit; the other keeps $30M.',
      q: 'Which business is more efficient?',
      choices: [
        { v: 'a', label: 'The one keeping $300M — a far higher profit margin', gut: true },
        { v: 'b', label: 'They’re equal — same revenue' },
        { v: 'c', label: 'The one keeping $30M' },
      ],
      reveal: 'Margin is the slice of every revenue dollar that becomes profit. High margins signal pricing power and efficiency — a hallmark of a strong business.' },
    { type: 'quiz', icon: Building2, concept: 'Guidance moves stocks',
      scene: 'A company just reported a great quarter — yet its stock dropped sharply.',
      q: 'What’s the most likely reason?',
      choices: [
        { v: 'a', label: 'Its guidance — the forecast for next quarter — was weak', gut: true },
        { v: 'b', label: 'Good results always make a stock fall' },
        { v: 'c', label: 'The market makes no sense' },
      ],
      reveal: 'Markets look forward, not back. Weak guidance can sink a stock that just posted great results — the future story matters more than the past quarter.' },
  ],

  // ── Technical ─────────────────────────────────────────────────────────
  technical: [
    { type: 'chart', icon: TrendingUp, concept: 'Trend',
      scene: 'Forget the daily wiggles for a second and look at the overall direction of this line.',
      chart: { series: [{ data: UPTREND, color: 'up' }] },
      q: 'What’s the trend here?',
      choices: [
        { v: 'a', label: 'Up — and “the trend is your friend”', gut: true },
        { v: 'b', label: 'Down' },
        { v: 'c', label: 'There’s no trend at all' },
      ],
      reveal: 'The trend is the general direction once you ignore the noise. Most strategies do far better going with it than fighting it.' },
    { type: 'quiz', icon: LineIcon, concept: 'Moving average',
      scene: 'A price chart is jagged and noisy day to day.',
      q: 'What does drawing a “moving average” line do?',
      choices: [
        { v: 'a', label: 'Smooths the noise to reveal the underlying direction', gut: true },
        { v: 'b', label: 'Predicts tomorrow’s exact price' },
        { v: 'c', label: 'Makes the stock go up' },
      ],
      reveal: 'A moving average is a smoothed line of recent prices. “Are we above or below the line?” is exactly how The Bodyguard from your journey decides when to play it safe.' },
    { type: 'quiz', icon: LineIcon, concept: 'RSI (overbought)',
      scene: 'A stock has rocketed up for two weeks and its RSI now reads 78 (anything above ~70 is “stretched”).',
      q: 'What is RSI hinting?',
      choices: [
        { v: 'a', label: 'The run may be overdone — “overbought”. A hint, not a guarantee', gut: true },
        { v: 'b', label: 'It will definitely keep going up' },
        { v: 'c', label: 'The company is bankrupt' },
      ],
      reveal: 'RSI is a 0–100 “how stretched is this move?” gauge. High (~70+) = possibly overbought, low (~30−) = possibly oversold. Always a hint, never a promise.' },
    { type: 'chart', icon: LineIcon, concept: 'Support',
      scene: 'Watch how this price keeps falling to roughly the same low point and then bounces back up.',
      chart: { series: [{ data: FLOOR_BOUNCE, color: 'accent' }] },
      q: 'That repeated “floor” the price bounces off is called…',
      choices: [
        { v: 'a', label: 'Support — a price level buyers keep defending', gut: true },
        { v: 'b', label: 'Resistance — a ceiling' },
        { v: 'c', label: 'A coincidence with no name' },
      ],
      reveal: 'A floor where buyers keep stepping in is “support”; a ceiling where sellers keep appearing is “resistance”. They’re where the buyer-vs-seller tug-of-war shows up on the chart.' },
  ],

  // ── News ──────────────────────────────────────────────────────────────
  news: [
    { type: 'quiz', icon: Newspaper, concept: 'Earnings report',
      scene: 'Every company has one scheduled event that reliably moves its stock the most.',
      q: 'What is it?',
      choices: [
        { v: 'a', label: 'Its quarterly earnings report', gut: true },
        { v: 'b', label: 'The CEO’s birthday' },
        { v: 'c', label: 'A random Tuesday' },
      ],
      reveal: 'The earnings report is the quarterly scorecard — revenue, profit, and guidance. Prices often gap up or down right after, so it’s worth knowing when it’s due.' },
    { type: 'quiz', icon: Newspaper, concept: 'Beat vs miss',
      scene: 'A company “beat” expectations — yet the stock fell anyway.',
      q: 'How can a beat send a stock down?',
      choices: [
        { v: 'a', label: 'The reaction is about expectations, and hopes were even higher', gut: true },
        { v: 'b', label: 'Beating is always bad' },
        { v: 'c', label: 'The report was fake' },
      ],
      reveal: 'It’s expectations vs reality, not the raw number. A great quarter can still disappoint if the crowd expected even more — “buy the rumour, sell the news.”' },
    { type: 'quiz', icon: Newspaper, concept: 'Signal vs noise',
      scene: 'You open your app and there are 40 headlines about a stock you own today.',
      q: 'What’s the actual skill here?',
      choices: [
        { v: 'a', label: 'Ignoring the noise and reacting only to what truly changes the story', gut: true },
        { v: 'b', label: 'Trading once for every headline' },
        { v: 'c', label: 'Reading all 40 and panicking' },
      ],
      reveal: 'A few headlines matter; most are background chatter. Reacting to every one is how beginners overtrade and lose. The skill is filtering — and it ties straight back to “the hard part is not flinching.”' },
  ],
}
