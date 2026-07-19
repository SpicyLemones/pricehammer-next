"use client";

// Start your life again: pick a birth year, make the choices a normal
// childhood offers, and find out at the end what you should have been
// doing instead. Every hindsight line is a real, dated market fact with
// rough numbers. The joke is structural: the right answers were never
// on the card.

import { useMemo, useState } from "react";

const nf = new Intl.NumberFormat("en-AU");

type Decision = { age: number; question: string; options: string[] };

const DECISIONS: Decision[] = [
  { age: 5, question: "Your parents ask what instrument you want to learn.", options: ["Piano", "Violin", "Guitar", "The recorder, like everyone else"] },
  { age: 8, question: "Pick a Saturday sport.", options: ["Soccer", "Swimming", "Auskick", "Cricket"] },
  { age: 11, question: "A hobby takes hold.", options: ["Video games", "Drawing", "Scouts", "Reading everything in the library"] },
  { age: 14, question: "Choose your Year 9 elective.", options: ["French", "Woodwork", "Drama", "Extra maths"] },
  { age: 16, question: "First part-time job?", options: ["Maccas", "Woolies checkout", "Umpiring the under-10s", "No job, focusing on school"] },
  { age: 18, question: "Life after school.", options: ["Uni: something sensible", "Uni: something you love", "A trade", "Gap year, finding yourself"] },
  { age: 21, question: "Housing arrangements.", options: ["Stay home and save", "Share house with mates", "Move cities for the job", "Overseas for a bit"] },
  { age: 24, question: "The career fork.", options: ["Grind for the promotion", "Job-hop for the pay rise", "Go back and study more", "Start something of your own"] },
  { age: 27, question: "Time to think long-term.", options: ["Salary sacrifice into super", "Save for the deposit", "Index funds, set and forget", "Get really into sourdough"] },
];

// what you actually should have done, by calendar year. grand = roughly what
// $1,000 placed on the move is worth in 2026, where a fair estimate exists.
type Hindsight = { text: string; grand?: number };

const HINDSIGHT: Record<number, Hindsight[]> = {
  1997: [
    { text: "put the christening money into CSL, floated a few years earlier at $2.30 a share. It passes $300.", grand: 130000 },
    { text: "buy Amazon, listed a few months back at about 8 cents split-adjusted.", grand: 2500000 },
  ],
  1998: [
    { text: "buy a Sydney house. Median: about $240,000.", grand: 7000 },
    { text: "hold Amazon through the dot-com wobble that is coming. All of it.", grand: 1500000 },
  ],
  1999: [
    { text: "skip the Beanie Babies, buy Apple under a dollar split-adjusted.", grand: 250000 },
    { text: "buy any capital city house before the decade turns.", grand: 6000 },
  ],
  2000: [
    { text: "sell every tech share you own in February. Tell no one why.", grand: 3000 },
    { text: "buy a Brisbane house. Median: about $150,000.", grand: 8000 },
  ],
  2001: [
    { text: "buy Apple at about 30 cents split-adjusted, post-crash. It goes past $250.", grand: 700000 },
    { text: "keep cash until October, then buy the recovery.", grand: 4000 },
  ],
  2002: [
    { text: "buy Netflix at listing. A grand becomes about a million by the 2021 peak.", grand: 1000000 },
    { text: "buy Fortescue at a few cents a share. It touches $25 in the boom.", grand: 400000 },
  ],
  2003: [
    { text: "Fortescue again. Still cents. Still ignored.", grand: 300000 },
    { text: "buy a Perth house before the mining boom doubles it by 2007.", grand: 9000 },
  ],
  2004: [
    { text: "take the Google IPO at $85. Roughly 70x since.", grand: 70000 },
    { text: "buy Apple. Still about a dollar split-adjusted. The iPod is already out.", grand: 220000 },
  ],
  2005: [
    { text: "Apple at about $1.50 split-adjusted. The iPhone is two years away.", grand: 150000 },
    { text: "Perth medians pass $300,000 on the way to double. Get on.", grand: 5000 },
  ],
  2006: [
    { text: "buy literally any capital city house. Most medians roughly triple from here.", grand: 6000 },
    { text: "Amazon at about $2 split-adjusted, while everyone still thinks it sells books.", grand: 110000 },
  ],
  2007: [
    { text: "sell everything in October. The letters G, F and C are about to matter.", grand: 3000 },
    { text: "buy Apple the week the iPhone launches, which everyone reviews as too expensive.", grand: 40000 },
  ],
  2008: [
    { text: "buy anything in November. The ASX bottoms four months later.", grand: 6000 },
    { text: "buy an American house. They are briefly on sale.", grand: 8000 },
  ],
  2009: [
    { text: "mine Bitcoin on the family computer. It launched in January and costs electricity.", grand: 90000000 },
    { text: "buy the ASX in March, at the exact bottom, like it was obvious.", grand: 7000 },
  ],
  2010: [
    { text: "in May a man pays 10,000 bitcoin for two pizzas. Be the man who sells the pizzas.", grand: 50000000 },
    { text: "take the Tesla IPO at about $1.10 split-adjusted.", grand: 250000 },
  ],
  2011: [
    { text: "Bitcoin crosses one dollar in February. One. Dollar.", grand: 80000000 },
    { text: "the Aussie dollar is worth $1.10 US. Buy greenbacks and wait.", grand: 2000 },
  ],
  2012: [
    { text: "Bitcoin sits around $10 all year while you attend school.", grand: 9000000 },
    { text: "Sydney median: about $640,000. The last exit before it doubles.", grand: 3000 },
  ],
  2013: [
    { text: "buy Tesla at about $2.30 split-adjusted before the first big run.", grand: 120000 },
    { text: "Bitcoin hits $100 in April. Everyone calls it a bubble. Buy the bubble.", grand: 1000000 },
  ],
  2014: [
    { text: "buy Nvidia at about 45 cents split-adjusted. Roughly 400x from here.", grand: 400000 },
    { text: "buy a Hobart house, the cheapest capital in the country, about to double.", grand: 4000 },
  ],
  2015: [
    { text: "join the Ethereum presale at about 30 cents a coin.", grand: 10000000 },
    { text: "Nvidia. Still under a dollar split-adjusted. Still just a gaming company, apparently.", grand: 300000 },
  ],
  2016: [
    { text: "Ethereum is under $10 in January.", grand: 300000 },
    { text: "Afterpay lists at $1. It touches $160 in 2021. Sell then, obviously.", grand: 160000 },
  ],
  2017: [
    { text: "buy Bitcoin in January at $1,000, sell in December at $19,000, thank nobody.", grand: 19000 },
    { text: "Ethereum starts the year at $8 and ends it past $700.", grand: 90000 },
  ],
  2018: [
    { text: "buy the crypto winter bottom in December while the obituaries run.", grand: 30000 },
    { text: "buy AMD under $10 while everyone laughs. It 20x's.", grand: 20000 },
  ],
  2019: [
    { text: "Tesla at about $12 split-adjusted, months before the 2020 run.", grand: 25000 },
    { text: "Bitcoin is back at $3,500 in January, which everyone agrees proves it is over.", grand: 30000 },
  ],
  2020: [
    { text: "buy everything the week of March 23. Everything.", grand: 4000 },
    { text: "Solana launches under a dollar. It peaks near $260 the following year.", grand: 300000 },
  ],
  2021: [
    { text: "sell everything in November. All of it. Every single thing.", grand: 2500 },
    { text: "GameStop in January. In by Monday, out by Thursday, delete the app.", grand: 15000 },
  ],
  2022: [
    { text: "buy Nvidia at the October bottom, about $11 split-adjusted.", grand: 16000 },
    { text: "buy the coal and gas shares everyone had declared unbuyable.", grand: 3000 },
  ],
  2023: [
    { text: "hold Nvidia while it triples on the AI run.", grand: 3500 },
    { text: "lock in savings rates before they fall. Thrilling stuff. Still beat your super.", grand: 1300 },
  ],
  2024: [
    { text: "Bitcoin ETFs are approved in January and it doubles. The suits made it respectable.", grand: 2200 },
    { text: "gold starts a run that makes the crypto people quietly furious.", grand: 1700 },
  ],
  2025: [
    { text: "gold again, somehow. The oldest asset outruns the newest ones.", grand: 1400 },
    { text: "hold the boring index fund. It grinds up while everything exciting goes sideways.", grand: 1150 },
  ],
  2026: [
    { text: "nothing. You are here now. The machine has no more advice, only records." },
    { text: "start a satirical jobs almanac. Monetisation pending." },
  ],
};

// filler for the years nobody asked your opinion
const FILLER: Record<string, string[]> = {
  baby: ["Born. The property market was already moving without you.", "Learned to walk. Sydney medians outpaced you anyway.", "Peak nap years. Zero income.", "Drew on a wall. Not yet monetisable.", "Kinder. Superannuation balance: $0."],
  kid: ["Lost a tooth, spent the $2 immediately.", "School. Nothing monetisable occurred.", "Collected trading cards. The wrong ones.", "A year of homework with no equity attached.", "Grew out of the good shoes."],
  teen: ["School continued. The market did not wait.", "Downloaded music instead of buying shares.", "A year spent on a group chat.", "Studied for exams in a subject with no ticker symbol."],
  adult: ["Rent went up.", "LinkedIn congratulated you on a work anniversary.", "You attended a wedding and two farewells.", "Considered getting into investing. Considered it.", "A subscription you forgot about renewed."],
};

function fillerFor(age: number, seed: number): string {
  const pool = age <= 4 ? FILLER.baby : age <= 12 ? FILLER.kid : age <= 17 ? FILLER.teen : FILLER.adult;
  return pool[seed % pool.length];
}

export function LifeGame() {
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState(false);
  // one reroll of the hindsight variants per reveal
  const [rollKey, setRollKey] = useState(0);

  const decisions = useMemo(
    () => (birthYear === null ? [] : DECISIONS.filter((d) => birthYear + d.age <= 2026)),
    [birthYear],
  );
  const answeredCount = decisions.filter((d) => answers[d.age] !== undefined).length;
  const current = decisions.find((d) => answers[d.age] === undefined);

  const timeline = useMemo(() => {
    if (birthYear === null || !revealed) return [];
    const rows: { year: number; age: number; you: string; shouldHave?: Hindsight }[] = [];
    for (let year = birthYear; year <= 2026; year++) {
      const age = year - birthYear;
      const decision = DECISIONS.find((d) => d.age === age);
      const you =
        age === 0
          ? "Born. Your opening position: nothing."
          : decision && answers[age]
            ? `${decision.question.replace(/\.$/, "")} You chose: ${answers[age]}.`
            : fillerFor(age, (year * 7 + rollKey * 13) % 97);
      const pool = HINDSIGHT[year];
      const shouldHave = pool ? pool[Math.floor(((year * 31 + rollKey * 17) % 100) / 50) % pool.length] : undefined;
      rows.push({ year, age, you, shouldHave });
    }
    return rows;
  }, [birthYear, revealed, answers, rollKey]);

  const total = timeline.reduce((a, r) => a + (r.shouldHave?.grand ?? 0), 0);

  const reset = () => {
    setBirthYear(null);
    setAnswers({});
    setRevealed(false);
  };

  return (
    <div className="border border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      {birthYear === null && (
        <>
          <p className="font-serif text-sm text-slate-600 dark:text-slate-300">
            Pick the year you were born. Live your life again, one reasonable decision at a time. At the end,
            the machine will show you what you should have done instead.
          </p>
          <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {Array.from({ length: 16 }, (_, i) => 1997 + i).map((y) => (
              <button
                key={y}
                onClick={() => setBirthYear(y)}
                className="border-2 border-slate-300 px-2 py-2 font-display text-lg transition-colors hover:border-slate-900 hover:bg-slate-900 hover:text-white dark:border-slate-700 dark:hover:border-slate-100 dark:hover:bg-slate-100 dark:hover:text-slate-900"
              >
                {y}
              </button>
            ))}
          </div>
        </>
      )}

      {birthYear !== null && !revealed && current && (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Born {birthYear} · age {current.age} · the year is {birthYear + current.age}
            </div>
            <div className="font-mono text-[11px] text-slate-400">
              {answeredCount + 1}/{decisions.length}
            </div>
          </div>
          <p className="font-display mt-2 text-2xl tracking-wide">{current.question}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {current.options.map((opt) => (
              <button
                key={opt}
                onClick={() => setAnswers((a) => ({ ...a, [current.age]: opt }))}
                className="border-2 border-slate-300 px-4 py-3 text-left font-serif text-sm transition-colors hover:border-slate-900 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-slate-100 dark:hover:bg-slate-800"
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}

      {birthYear !== null && !revealed && !current && (
        <div className="text-center">
          <p className="font-display text-3xl tracking-wide">That was your life.</p>
          <p className="mt-2 font-serif text-sm text-slate-600 dark:text-slate-300">
            Every decision made carefully, every option perfectly reasonable. Ready to see how it went?
          </p>
          <button
            onClick={() => { setRollKey(Math.floor(Math.random() * 1000)); setRevealed(true); }}
            className="font-display mt-4 border-2 border-slate-900 bg-slate-900 px-8 py-3 text-xl tracking-wider text-white transition-colors hover:bg-red-700 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-red-500 dark:hover:text-white"
          >
            Judge me
          </button>
        </div>
      )}

      {revealed && (
        <>
          <ol className="divide-y divide-slate-100 dark:divide-slate-800">
            {timeline.map((r) => (
              <li key={r.year} className="py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-display text-lg leading-none">{r.year}</span>
                  <span className="font-mono text-[10px] text-slate-400">age {r.age}</span>
                </div>
                <p className="mt-0.5 font-serif text-sm text-slate-600 dark:text-slate-300">{r.you}</p>
                {r.shouldHave && (
                  <p className="mt-0.5 font-serif text-sm text-red-700 dark:text-red-400">
                    <span className="text-[10px] uppercase tracking-widest">You should have:</span>{" "}
                    {r.shouldHave.text}
                    {r.shouldHave.grand ? (
                      <span className="text-slate-400"> (~${nf.format(r.shouldHave.grand)} today per $1,000)</span>
                    ) : null}
                  </p>
                )}
              </li>
            ))}
          </ol>
          <div className="mt-4 border-2 border-slate-900 p-4 dark:border-slate-100">
            <p className="font-serif text-sm text-slate-600 dark:text-slate-300">
              If you had put $1,000 on each of those calls instead of doing whatever &ldquo;{Object.values(answers)[0] ?? "growing up"}&rdquo; was:
            </p>
            <p className="font-display mt-1 text-4xl leading-none">~${nf.format(total)}</p>
            <p className="mt-3 border-t border-slate-200 pt-3 font-serif text-sm italic text-slate-600 dark:border-slate-700 dark:text-slate-300">
              Notice that none of it was ever on the card. You were choosing between recorder and violin while
              the correct answer was a stock ticker you had never heard of. That is the game, and you were
              enrolled at birth.
            </p>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={reset}
              className="border-2 border-slate-300 px-4 py-2 text-[11px] uppercase tracking-widest text-slate-500 transition-colors hover:border-slate-900 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-100 dark:hover:text-slate-100"
            >
              Live again
            </button>
            <button
              onClick={() => setRollKey(Math.floor(Math.random() * 1000))}
              className="border-2 border-slate-300 px-4 py-2 text-[11px] uppercase tracking-widest text-slate-500 transition-colors hover:border-slate-900 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-100 dark:hover:text-slate-100"
            >
              Different regrets
            </button>
          </div>
        </>
      )}
    </div>
  );
}
