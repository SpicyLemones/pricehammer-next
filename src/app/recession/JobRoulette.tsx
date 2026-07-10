"use client";

// The application roulette: spin the wheel, where the winning slice is your
// actual statistical chance that one cold application becomes a job. The
// model is one hire per posting and every applicant equal, which is generous.
// The applicants-per-posting default scales with how cooked the market is,
// anchored to the famous ~250-applications-per-corporate-opening figure, and
// there is a slider because nobody publishes the real number.
//
// Below the wheel, your odds are placed on a ladder of real, checkable odds
// (coin runs, poker hands, lightning) that adapts as the slider moves.

import { useMemo, useRef, useState } from "react";

const REJECTIONS = [
  "We were impressed by your background, however...",
  "We've decided to move forward with other candidates.",
  "The position has been filled internally.",
  "Ghosted. Not even a rejection email.",
  "We'll keep your resume on file.",
  "After careful consideration...",
  "The role has been re-advertised. Apply again?",
  "Unfortunately the position is now on hold.",
  "The hiring manager went on leave. Forever.",
  "We found someone with 2 more years of the framework.",
];

// real odds, exact where maths, sourced where not
const ODDS_LADDER: { n: number; text: string; kind: "exact" | "estimate" }[] = [
  { n: 52, text: "drawing the ace of spades from a fresh deck", kind: "exact" },
  { n: 64, text: "flipping six heads in a row", kind: "exact" },
  { n: 70, text: "a birth being twins", kind: "estimate" },
  { n: 221, text: "being dealt pocket aces in poker", kind: "exact" },
  { n: 256, text: "flipping eight heads in a row", kind: "exact" },
  { n: 1296, text: "rolling double sixes twice in a row", kind: "exact" },
  { n: 4165, text: "being dealt four of a kind in five cards", kind: "exact" },
  { n: 12500, text: "an amateur golfer hitting a hole-in-one on a given round", kind: "estimate" },
  { n: 300000, text: "being struck by lightning this year", kind: "estimate" },
  { n: 649740, text: "being dealt a royal flush in five cards", kind: "exact" },
];

function comparisonFor(odds: number): string {
  // find the flanking rungs on the ladder
  let below: (typeof ODDS_LADDER)[number] | null = null;
  let above: (typeof ODDS_LADDER)[number] | null = null;
  for (const rung of ODDS_LADDER) {
    if (rung.n <= odds) below = rung;
    if (rung.n >= odds && !above) above = rung;
  }
  if (below && above && below.n !== above.n) {
    return `Your odds sit between ${below.text} (1 in ${below.n.toLocaleString("en-AU")}) and ${above.text} (1 in ${above.n.toLocaleString("en-AU")}).`;
  }
  const rung = below ?? above!;
  if (odds < rung.n) {
    return `You are more likely to land this job than ${rung.text} (1 in ${rung.n.toLocaleString("en-AU")}). Small mercies.`;
  }
  return `At these odds, ${rung.text} (1 in ${rung.n.toLocaleString("en-AU")}) is more likely than your application working.`;
}

export function JobRoulette({
  industryName,
  defaultApplicants,
  oddsNote,
}: {
  industryName: string;
  defaultApplicants: number;
  oddsNote?: string;
}) {
  const [applicants, setApplicants] = useState(defaultApplicants);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [wins, setWins] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const rejectionIdx = useRef(0);

  const winDeg = Math.max(0.75, 360 / applicants); // the winning slice, to scale (floored so it stays visible)

  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    setResult(null);
    const won = Math.random() < 1 / applicants;
    // land inside or outside the win slice (which is centred at 0°, the pointer)
    const landing = won
      ? (Math.random() - 0.5) * winDeg
      : winDeg / 2 + Math.random() * (360 - winDeg);
    const target = rotation + 5 * 360 + (360 - landing);
    setRotation(target);
    setTimeout(() => {
      setSpinning(false);
      setAttempts((a) => a + 1);
      if (won) {
        setWins((w) => w + 1);
        setResult("📞 THEY ACTUALLY CALLED BACK. Buy a lottery ticket today as well.");
      } else {
        setResult(REJECTIONS[rejectionIdx.current++ % REJECTIONS.length]);
      }
    }, 3200);
  };

  const wheelBackground = useMemo(
    () =>
      `conic-gradient(from ${-winDeg / 2}deg, #059669 0deg ${winDeg}deg, transparent ${winDeg}deg 360deg)`,
    [winDeg],
  );

  return (
    <div className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col items-center gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-center sm:gap-10">
        {/* the wheel */}
        <div className="relative shrink-0">
          <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1 text-xl" aria-hidden>▼</div>
          <div
            className="h-48 w-48 rounded-full border-4 border-slate-900 bg-red-700/85 transition-transform ease-out dark:border-slate-200 dark:bg-red-500/80"
            style={{
              transform: `rotate(${rotation}deg)`,
              transitionDuration: spinning ? "3200ms" : "0ms",
              backgroundImage: wheelBackground,
            }}
            aria-label={`Wheel with a winning slice of ${winDeg.toFixed(1)} degrees out of 360`}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="font-display rounded-full bg-white/90 px-3 py-2 text-center text-xs leading-tight text-slate-900 dark:bg-slate-950/90 dark:text-slate-100">
              1 in {applicants.toLocaleString("en-AU")}
            </span>
          </div>
        </div>

        {/* controls + tally */}
        <div className="w-full max-w-sm">
          <button
            onClick={spin}
            disabled={spinning}
            className="font-display w-full border-2 border-slate-900 bg-slate-900 px-6 py-3 text-2xl tracking-wider text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-red-500 dark:hover:text-white"
          >
            {spinning ? "Under review…" : "Submit application"}
          </button>
          <div className="mt-3 flex justify-between font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            <span>applications: {attempts}</span>
            <span>offers: {wins}</span>
          </div>
          {result && (
            <p className={`mt-3 border-l-2 pl-3 font-serif text-sm ${result.startsWith("📞") ? "border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300" : "border-red-700 text-slate-600 dark:border-red-500 dark:text-slate-300"}`}>
              {result}
            </p>
          )}
          <div className="mt-4 text-xs text-slate-600 dark:text-slate-300">
            applicants per posting: <strong className="tabular-nums">{applicants.toLocaleString("en-AU")}</strong>
            {!unlocked && (
              <span className="text-slate-400"> (set from real data, see below)</span>
            )}
            {unlocked ? (
              <input
                type="range"
                min={25}
                max={1000}
                step={1}
                value={applicants}
                onChange={(e) => setApplicants(Number(e.target.value))}
                className="mt-1 block h-1 w-full accent-red-700 dark:accent-red-500"
                aria-label="Applicants per posting"
              />
            ) : attempts > 0 && !spinning ? (
              <button
                onClick={() => setUnlocked(true)}
                className="mt-2 block w-full border border-dashed border-slate-400 px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-500 transition-colors hover:border-slate-600 hover:text-slate-800 dark:border-slate-600 dark:hover:text-slate-200"
              >
                change your odds
              </button>
            ) : (
              <p className="mt-1 text-[11px] text-slate-400">
                the house sets the odds. spin once to unlock them.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
        <p className="font-serif text-sm text-slate-700 dark:text-slate-200">{comparisonFor(applicants)}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          Model: one hire per posting, every applicant equal, so one cold application into {industryName.toLowerCase()}{" "}
          wins at 1 in {applicants.toLocaleString("en-AU")}.{" "}
          {oddsNote ??
            "The starting odds come from real data: the average Australian job ad drew 184 applications in April 2025 (SEEK data, a record high, with single roles topping 4,000), scaled by how this market currently reads."}{" "}
          Coin, dice and card odds are exact; twins, holes-in-one and lightning are published estimates (lightning: US
          National Weather Service, annual).
        </p>
      </div>
    </div>
  );
}
