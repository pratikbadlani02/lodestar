// ─────────────────────────────────────────────────────────────────────────
// Learn — content for the beginner graduation ladder.
//
// Every rung is a list of steps run by the same player in pages/Learn.jsx.
// Step types: quiz | chart | decision | character | breakit | builder | recap.
// Copy is deliberately jargon-light and callback-rich (each rung references
// ideas from earlier rungs). Charts in rung 2 hide all numbers on purpose —
// you read the *story*, not the digits.
// ─────────────────────────────────────────────────────────────────────────
import {
  Compass, Map, HeartPulse, Swords, FlaskConical, Wand2, Rocket,
  Smartphone, Ticket, Dices, PiggyBank, Boxes, ShieldAlert,
  TrendingUp, TrendingDown, LineChart as LineIcon, Layers, Gauge,
  Zap, Anchor, Shield, Sparkles, Target, Scale,
} from 'lucide-react'

// ── The ladder metadata (order = the climb) ──────────────────────────────
export const RUNGS = [
  { id: 'ground', n: 1, icon: Compass,    title: 'What even is this?',   blurb: 'No numbers, no charts — just the ideas, using things you already know.' },
  { id: 'map',    n: 2, icon: Map,        title: 'Reading the map',      blurb: 'Your first charts — read as stories, not numbers. What “the market” really is.' },
  { id: 'calls',  n: 3, icon: HeartPulse, title: 'Your first calls',     blurb: 'Make buy / hold / sell decisions on real situations — and feel a drop, safely.' },
  { id: 'rules',  n: 4, icon: Swords,     title: 'Rules beat guessing',  blurb: 'Meet the strategies as characters — each with a superpower and a fatal flaw.' },
  { id: 'test',   n: 5, icon: FlaskConical,title: 'Would it have worked?', blurb: 'Replay a rule across history — then try to break it. Learn to distrust a pretty result.' },
  { id: 'build',  n: 6, icon: Wand2,      title: 'Build your own',       blurb: 'Describe an idea in plain English and watch it become a real, testable strategy.' },
  { id: 'fly',    n: 7, icon: Rocket,     title: 'Fly solo',             blurb: 'Training wheels off — step onto the real platform with the words finally making sense.' },
  { id: 'coach',  n: 8, icon: Target,     title: 'Your first guided trade', blurb: 'Put it all together — read a real stock’s analysis and place a safe practice trade with a safety net.', kind: 'coach' },
]

// ── Rung 1 · Ground Floor — no numbers, no charts ────────────────────────
const GROUND = [
  {
    type: 'quiz', icon: Smartphone, concept: 'A share = part-ownership',
    scene: 'Look at the apps you opened today. Someone owns the companies that make them — and “owning a piece” of one is a real, ordinary thing anyone can do.',
    q: 'If you “bought a share” of the company that makes your favourite app, what did you actually get?',
    choices: [
      { v: 'a', label: 'A tiny piece of the company itself', gut: true },
      { v: 'b', label: 'A coupon for free stuff from them' },
      { v: 'c', label: 'A loan they have to pay back' },
    ],
    reveal: 'A share is a slice of ownership. Own one and you genuinely own a (very small) part of that company — its products, its profits, its future. You already chose these companies with your attention and money; owning a piece is just the next step.',
  },
  {
    type: 'quiz', icon: Ticket, concept: 'Price = supply & demand',
    scene: 'Think of a sold-out concert ticket or a hyped pair of sneakers. The maker prints one price — but what people actually pay can be wildly different.',
    q: 'Why does a resale ticket cost more than its printed price?',
    choices: [
      { v: 'a', label: 'More people want it than there are tickets', gut: true },
      { v: 'b', label: 'The venue secretly raised the price' },
      { v: 'c', label: 'It costs more to print a popular ticket' },
    ],
    reveal: "A company's slice works exactly the same way. When more people want to own it than want to sell, the price drifts up; when more want out, it drifts down. Nobody sets the price — the crowd does, second by second. That tug-of-war is the whole game.",
  },
  {
    type: 'quiz', icon: ShieldAlert, concept: 'Risk — told honestly',
    scene: "Here's the part most apps whisper. Prices don't move in a straight line — they wobble, sometimes a lot, sometimes for no reason you can see.",
    q: 'Can the value of a share you own go down?',
    choices: [
      { v: 'a', label: 'Yes — and sometimes a long way', gut: true },
      { v: 'b', label: 'No, shares only go up over time' },
      { v: 'c', label: 'Only if the company breaks the law' },
    ],
    reveal: "Yes. A slice of a strong company rarely goes to zero, but its price can fall hard and stay there a while. Anyone who tells you otherwise is selling something. The wobble is the price of admission — understanding it is most of the job.",
  },
  {
    type: 'quiz', icon: Dices, concept: 'Investing vs. gambling',
    scene: "So if prices wobble and you can lose money… isn't this just a casino with extra steps? It's the most important question you can ask, so let's answer it straight.",
    q: 'What makes owning part of a company different from a roulette bet?',
    choices: [
      { v: 'a', label: 'You own something real that earns money over time', gut: true },
      { v: 'b', label: 'Nothing — both are pure luck' },
      { v: 'c', label: "It's different because experts can't lose" },
    ],
    reveal: 'A casino is pure chance with the odds tilted against you, and time makes it worse. A good company actually earns money and tends to grow, so time tilts the odds gently in your favour. Speculating on a hot tip is gambling; owning a piece of something real and waiting is investing. Same market, opposite mindsets.',
  },
  {
    type: 'quiz', icon: PiggyBank, concept: 'Why bother at all',
    scene: 'Reasonable question: why not leave money in a bank and skip the wobble entirely?',
    q: 'What quietly happens to cash sitting still for ten years?',
    choices: [
      { v: 'a', label: 'It slowly buys less than it used to', gut: true },
      { v: 'b', label: 'It stays worth exactly the same' },
      { v: 'c', label: 'The bank doubles it for you' },
    ],
    reveal: "Prices of nearly everything creep up over time, so still cash quietly buys less each year — and a bank barely keeps pace. Owning slices of growing companies is how people try to outrun that slow leak. That's the actual reason anyone takes the risk.",
  },
  {
    type: 'quiz', icon: HeartPulse, concept: 'The real game is emotional',
    scene: "Picture this: a week after you buy, the price drops and your slice is worth noticeably less. Your stomach knots. Everyone online sounds panicked.",
    q: 'When a price you own drops sharply, the hardest skill is usually…',
    choices: [
      { v: 'a', label: 'Not panicking and selling at the bottom', gut: true },
      { v: 'b', label: 'Doing complicated maths quickly' },
      { v: 'c', label: 'Predicting the exact bottom' },
    ],
    reveal: "Here's the secret the pros know: the hard part isn't picking winners, it's not flinching. Most beginners lose not because they chose badly, but because they sold in fear at the worst moment. The market is a test of temperament long before it's a test of skill.",
  },
  {
    type: 'quiz', icon: Boxes, concept: "Don't put all your eggs…",
    scene: "You already know the proverb your grandparents used. It turns out to be the single most useful idea in investing.",
    q: "What's the safest way for a beginner to start owning companies?",
    choices: [
      { v: 'a', label: 'Own a tiny bit of hundreds of them at once', gut: true },
      { v: 'b', label: 'Put everything into the one you like most' },
      { v: 'c', label: 'Wait until you can pick the perfect single stock' },
    ],
    reveal: 'Don\'t put all your eggs in one basket — own a small piece of hundreds of companies at once (that bundle has a name: an "index"). If one stumbles, the others carry you. You just turned a proverb into the foundation of how careful people invest.',
  },
]

// helpers to make readable price-story curves (no real data, just shapes)
const RISE_CRASH = [10, 12, 15, 19, 24, 30, 33, 28, 19, 13, 11, 12]
const CALM_UP    = [10, 10.4, 10.9, 11.3, 11.9, 12.4, 13, 13.5, 14.1, 14.7, 15.3, 16]
const JAGGED_UP  = [10, 13, 9, 14, 8, 15, 11, 17, 12, 18, 13, 16]
const DIP_RECOVER= [20, 21, 19, 14, 9, 11, 13, 17, 22, 26, 29, 33]

// ── Rung 2 · Reading the map — charts as stories (numbers hidden) ────────
const MAP = [
  {
    type: 'chart', icon: LineIcon, concept: 'A chart is a story',
    scene: "A price chart looks intimidating, but it's just one thing: a picture of a crowd changing its mind over time. Left is the past, right is now. Up means the crowd wanted in; down means they wanted out.",
    chart: { series: [{ data: RISE_CRASH, color: 'accent' }] },
    q: 'What story does this line tell?',
    choices: [
      { v: 'a', label: 'Excitement built up… then the crowd panicked and rushed out', gut: true },
      { v: 'b', label: 'The company re-printed its prices halfway through' },
      { v: 'c', label: 'Nothing — these lines are totally random' },
    ],
    reveal: "You just read a chart. Notice we hid every number — you didn't need them. The shape alone tells the story: a climb of growing excitement, then a sharp drop as the crowd changed its mind. That's all a chart ever is.",
  },
  {
    type: 'chart', icon: Gauge, concept: 'Volatility = the size of the wiggle',
    scene: 'Here are two companies. Both finished higher than they started — so both "made money". But look at how differently they got there.',
    chart: { series: [{ data: CALM_UP, color: 'up' }, { data: JAGGED_UP, color: 'warn' }] },
    q: 'You own one of these. Which one lets you sleep at night?',
    choices: [
      { v: 'a', label: 'The smooth green one — same destination, less stomach-churning', gut: true },
      { v: 'b', label: 'The jagged one — more excitement means more money' },
      { v: 'c', label: "It doesn't matter, they end up the same" },
    ],
    reveal: 'The size of the wiggle has a name: volatility. Both lines ended up, but the jagged one would have tested your nerves the whole way — and remember from the last rung, the hard part is not flinching. Smoother is usually easier to actually hold onto.',
  },
  {
    type: 'quiz', icon: Layers, concept: 'An index = your basket, drawn as one line',
    scene: 'When the news says "the market went up today," they don\'t mean one company. They mean a giant bundle of them, averaged into a single line.',
    q: 'So what is something like the "S&P 500"?',
    choices: [
      { v: 'a', label: 'About 500 big companies bundled into one line', gut: true },
      { v: 'b', label: 'One enormous company called S&P' },
      { v: 'c', label: 'The building where trading happens' },
    ],
    reveal: 'An index is exactly the "don\'t put all your eggs in one basket" idea from rung 1, drawn as a single line. "The market" is just the biggest basket of all. When someone owns "the market," they own a sliver of hundreds of companies at once.',
  },
  {
    type: 'chart', icon: TrendingUp, concept: 'Zoom out',
    scene: 'This is a broad-market basket over many years. See that terrifying plunge in the middle? Imagine living through it — that\'s where most beginners panic-sell.',
    chart: { series: [{ data: DIP_RECOVER, color: 'accent' }] },
    q: 'Zoomed out, what did that scary plunge eventually turn into?',
    choices: [
      { v: 'a', label: 'A dip on a longer climb upward', gut: true },
      { v: 'b', label: 'The permanent end of the market' },
      { v: 'c', label: 'Proof that charts are meaningless' },
    ],
    reveal: 'Zoomed out, many scary drops in a broad basket became bumps on a longer climb. Important honesty: this is history, not a promise, and individual companies can stay down forever — but it shows why "zoom out" and "don\'t panic" are a careful investor\'s best friends.',
  },
]

// ── Rung 3 · Your first calls — decisions with consequences ──────────────
const CALLS = [
  {
    type: 'decision', icon: PiggyBank,
    scene: "It's a calm stretch. Your broad basket has been drifting gently upward for months. You have some cash sitting on the side, doing nothing.",
    q: 'What do you do?',
    options: [
      { v: 'a', label: 'Buy into the basket', you: 9, baseline: -2, tone: 'up',
        verdict: 'Over the next year your slice grew while the cash you would\'ve kept quietly lost ground to rising prices.',
        lesson: 'Doing something had a reward — and doing nothing had a hidden cost (that slow leak from rung 1).' },
      { v: 'b', label: 'Keep it all in cash, wait for a "perfect" moment', you: -2, baseline: 9, tone: 'down',
        verdict: 'The "perfect" moment never rang a bell. A year on, your cash bought a little less, and the basket you skipped drifted higher.',
        lesson: 'Waiting forever is itself a decision — and usually the costly one. There is rarely a bell at the bottom.' },
    ],
  },
  {
    type: 'decision', icon: TrendingDown,
    scene: 'Three weeks after you buy, the market drops hard — your basket is down 12%. Every headline screams crisis. Your stomach is in your throat.',
    q: 'This is the moment that defines most investors. What do you do?',
    options: [
      { v: 'a', label: 'Sell everything — make the pain stop', you: -12, baseline: 6, tone: 'down',
        verdict: 'Selling locked in the 12% loss. Weeks later the basket recovered and kept climbing — without you on board.',
        lesson: 'This is the classic beginner mistake from rung 1: fear sold at the bottom. The loss only became real when you sold.' },
      { v: 'b', label: 'Hold — do nothing, breathe', you: 6, baseline: 6, tone: 'up',
        verdict: 'You sat through the scary weeks. The drop reversed and your basket recovered to a gain.',
        lesson: 'Holding through fear is unglamorous and hard — and it\'s exactly what separates investors from gamblers.' },
      { v: 'c', label: 'Buy a little more at the lower price', you: 15, baseline: 6, tone: 'up',
        verdict: 'You treated the drop as a discount on something you already wanted. The recovery rewarded the nerve.',
        lesson: 'Advanced and not for everyone — but notice the reframe: a drop in a basket you believe in can be a sale, not a disaster.' },
    ],
  },
  {
    type: 'decision', icon: Scale,
    scene: 'A year on, you\'re up nicely. But one lucky stock you also own has tripled, and it\'s quietly grown to half of everything you hold.',
    q: 'It\'s been a great winner. Now what?',
    options: [
      { v: 'a', label: 'Trim it back, spread the winnings across the basket', you: 8, baseline: 8, tone: 'up',
        verdict: 'You locked in some of the gain and restored your balance. If that one stock stumbles now, it can\'t sink you.',
        lesson: 'Eggs and baskets again: letting one winner become everything quietly rebuilt the risk you started out avoiding.' },
      { v: 'b', label: 'Let it ride — go all-in on the winner', you: -20, baseline: 8, tone: 'down',
        verdict: 'The single stock had a bad quarter and dropped 40%. Because it was half your money, it dragged your whole year negative.',
        lesson: 'Concentration cuts both ways: it amplifies wins and losses equally. One bad day on a huge position can erase a great year.' },
    ],
  },
]

// ── Rung 4 · Rules beat guessing — strategies as characters ──────────────
const RULES = [
  {
    type: 'quiz', icon: Sparkles, concept: 'A rule replaces guessing',
    scene: 'Making every call by gut (like you just did) is exhausting and emotional. So investors do something clever: they write down a rule and follow it, every time, no matter how they feel.',
    q: 'What\'s the main advantage of following a written rule instead of your gut?',
    choices: [
      { v: 'a', label: 'It takes the panic and second-guessing out of the moment', gut: true },
      { v: 'b', label: 'Rules are guaranteed to make money' },
      { v: 'c', label: 'It means you never have to think again' },
    ],
    reveal: 'A rule is a pre-made decision. When the scary moment comes, you\'re not improvising through fear — you\'re just following the plan you made calmly. Let\'s meet three classic rules, as characters. Each is brilliant in the right moment and dangerous in the wrong one.',
  },
  {
    type: 'character', icon: Zap, name: 'The Sprinter', alias: 'buys whatever is speeding up',
    color: 'up', spark: [10, 11, 13, 16, 20, 25, 31, 30, 24],
    superpower: 'Catches roaring trends early and rides them hard. When a few names are pulling away from the pack, nobody makes more.',
    flaw: 'Hates choppy, directionless markets — gets faked out, buying just before things reverse (a "whipsaw").',
    bestWhen: 'A few clear winners are racing ahead of everything else.',
  },
  {
    type: 'character', icon: Anchor, name: 'The Bargain Hunter', alias: 'buys whatever looks beaten-down',
    color: 'info', spark: [22, 17, 12, 9, 11, 15, 19, 23, 26],
    superpower: 'Thrives when things that fell too far bounce back. Buys fear and sells relief.',
    flaw: 'Sometimes "cheap" is cheap for a real reason — it catches a falling knife that keeps falling.',
    bestWhen: 'Solid things have been oversold in a panic and are due to recover.',
  },
  {
    type: 'character', icon: Shield, name: 'The Bodyguard', alias: 'steps to safety when the whole market turns down',
    color: 'warn', spark: [20, 22, 21, 18, 18, 18, 18, 20, 23],
    superpower: 'Pulls you out of harm\'s way before the worst of a crash — so you keep your gains instead of giving them back.',
    flaw: 'A little slow. It reacts after the turn has started, and occasionally ducks out during a false alarm and misses some upside.',
    bestWhen: 'The entire market — not just one stock — rolls over into a downtrend.',
  },
  {
    type: 'quiz', icon: Target, concept: 'Match the moment to the character',
    scene: 'Real strategies are these characters working together. The champion strategy living on this very platform is The Sprinter with The Bodyguard watching its back.',
    q: 'The market just crashed and you\'re terrified of the next leg down. Whose moment is it?',
    choices: [
      { v: 'a', label: 'The Bodyguard — get to safety before more damage', gut: true },
      { v: 'b', label: 'The Sprinter — chase the falling prices down' },
      { v: 'c', label: 'Nobody, just close the app forever' },
    ],
    reveal: 'Right. The Bodyguard\'s whole job is the crash. Pair it with The Sprinter (who makes the money in good times) and you get a strategy that runs hard when it\'s safe and steps aside when it isn\'t — which is exactly how the +501% champion on this platform works.',
  },
]

// ── Rung 5 · Would it have worked? — backtest + break it ─────────────────
const TEST = [
  {
    type: 'quiz', icon: FlaskConical, concept: 'Backtesting',
    scene: 'You\'ve got a rule (a Sprinter + Bodyguard combo). Before risking a penny, there\'s one honest question to ask.',
    q: 'What should you ask before trusting any trading rule?',
    choices: [
      { v: 'a', label: '"Would this rule have actually worked in the past?"', gut: true },
      { v: 'b', label: '"Does it sound clever when I explain it?"' },
      { v: 'c', label: '"Did someone famous use it?"' },
    ],
    reveal: 'Replaying a rule across years of real history to see how it would have done is called backtesting — and it\'s this platform\'s superpower. Let\'s run one.',
  },
  {
    type: 'breakit', icon: TrendingUp,
    intro: 'We replayed The Sprinter-with-a-Bodyguard on a basket of big tech names over about four years. Here\'s how $100 would have grown — versus just buying the whole market and holding.',
    base: { label: 'The strategy, on big-tech', pct: 501 },
    bench: { label: 'Just holding the market', pct: 58 },
    variants: [
      { label: 'Same rule, on boring utility stocks', pct: -58, dead: true },
      { label: 'Same rule, on cheap “value” stocks', pct: -8, dead: true },
    ],
    lesson: 'Same exact rule — wildly different results. A backtest is a story about the past on one particular stage. Change the stage (the basket of stocks) and a triumphant strategy can fall apart completely. This one only shines on high-flying, trending names.',
  },
  {
    type: 'quiz', icon: ShieldAlert, concept: 'Healthy skepticism',
    scene: 'You find a strategy online boasting a +900% backtest. The chart is gorgeous.',
    q: 'What\'s the right first reaction?',
    choices: [
      { v: 'a', label: '"Where might this break? What stage was it tested on?"', gut: true },
      { v: 'b', label: '"Put my whole savings in immediately"' },
      { v: 'c', label: '"A high number means it\'s guaranteed"' },
    ],
    reveal: 'A backtest is a question, not a promise. The skill that separates beginners from pros isn\'t finding big numbers — it\'s being suspicious of them and hunting for where they break. You now have that instinct.',
  },
]

// ── Rung 6 · Build your own — plain-English strategy builder ──────────────
const BUILD = [
  {
    type: 'quiz', icon: Wand2, concept: 'Plain English is enough',
    scene: 'Here\'s the part that feels like magic: you don\'t need formulas or code. You can describe an idea in plain words and the platform turns it into a real, testable strategy.',
    q: 'Ready to build one in your own words?',
    choices: [
      { v: 'a', label: "Yes — let's build a strategy from a sentence", gut: true },
      { v: 'b', label: 'I assumed this required heavy maths' },
    ],
    reveal: 'No maths required. You pick the idea in plain language; the platform handles the rest. Build your sentence on the next step and watch it become a named strategy with a real track record.',
  },
  {
    type: 'builder', icon: Wand2,
    intro: 'Finish the sentence: "Buy ___, and ___." Pick one option for each blank, then see what you just created.',
    slots: [
      { key: 'what', label: 'Buy…', options: [
        { v: 'sprint',  text: 'stocks that are speeding up' },
        { v: 'bargain', text: 'stocks that look cheap' },
        { v: 'index',   text: 'a little of everything' },
      ]},
      { key: 'safe', label: 'and…', options: [
        { v: 'guard',    text: 'play it safe when the whole market is falling' },
        { v: 'allin',    text: 'always stay fully invested' },
        { v: 'diversify',text: 'never let one name get too big' },
      ]},
    ],
    combos: {
      'sprint|guard':    { name: 'The All-Weather Sprinter', pct: 501, tone: 'up',   note: 'That\'s The Sprinter + The Bodyguard — and it\'s literally the live champion strategy on this platform. You just described a +501% rule in one sentence.' },
      'sprint|allin':    { name: 'The Pure Sprinter',         pct: 118, tone: 'warn', note: 'Great in good times, but with no Bodyguard it took some brutal crashes along the way. More return, much rougher ride.' },
      'sprint|diversify':{ name: 'The Spread-Out Sprinter',   pct: 96,  tone: 'up',   note: 'Chases winners but never bets the farm on one. Calmer than the pure version, a bit less explosive.' },
      'bargain|guard':   { name: 'The Careful Contrarian',    pct: 41,  tone: 'up',   note: 'Buys the beaten-down, but heads for safety in a real storm. Steady rather than spectacular.' },
      'bargain|allin':   { name: 'The Bold Bargain Hunter',   pct: 22,  tone: 'warn', note: 'Buys fear and never flinches — sometimes catching a falling knife. High conviction, bumpy.' },
      'bargain|diversify':{name: 'The Patient Value Basket',  pct: 35,  tone: 'up',   note: 'Cheap names, well spread out. The tortoise: slow, steady, hard to blow up.' },
      'index|guard':     { name: 'The Cautious Index Holder', pct: 49,  tone: 'up',   note: 'Owns the whole market but sidesteps the worst crashes. A very sensible starting point.' },
      'index|allin':     { name: 'The Simple Index Holder',   pct: 58,  tone: 'up',   note: 'The simplest, most beginner-friendly plan of all: own everything, hold through everything. This is what "the market" returned.' },
      'index|diversify': { name: 'The Classic Index Holder',  pct: 58,  tone: 'up',   note: 'Owning a little of everything IS diversification — this is the textbook "just buy the index" strategy. Boring, and it works.' },
    },
    outro: 'Every sentence became a real strategy with its own personality and track record. That\'s exactly how the pros think — and you can do this for real, with your own ideas, in the platform\'s strategy builder.',
  },
]

// ── Rung 7 · Fly solo — graduation + handoff ─────────────────────────────
const FLY = [
  {
    type: 'recap', icon: Rocket, title: "You did it. The words make sense now.",
    learned: [
      'A share is owning a real slice of a company — and the crowd sets its price.',
      'Risk and the wobble are real; the hardest skill is not panicking.',
      'Don\'t put all your eggs in one basket — that\'s an index, and it\'s "the market".',
      'A chart is just a story; zoom out and don\'t flinch.',
      'Strategies are characters — The Sprinter, Bargain Hunter, Bodyguard — each with a flaw.',
      'A backtest is a question, not a promise. Always ask where it breaks.',
      'You can describe a real strategy in one plain-English sentence.',
    ],
    links: [
      { label: 'Explore live charts', to: '/stocks' },
      { label: 'Run a real backtest', to: '/backtests' },
      { label: 'Open the strategy builder', to: '/strategies' },
      { label: 'Step into the platform', to: '/workspace' },
    ],
    closing: 'The training wheels are off. The same screens the pros use are now yours — and you\'ve earned the map to read them. Welcome aboard.',
  },
]

export const RUNG_STEPS = {
  ground: GROUND,
  map: MAP,
  calls: CALLS,
  rules: RULES,
  test: TEST,
  build: BUILD,
  fly: FLY,
}
