// src/app/lib/recession.ts
//
// Data assembly for the Recession Indicator page. Reads:
//   - data/recession/ivi-ict.json  (Jobs and Skills Australia IVI, 2006 -> now)
//   - recession_series             (daily Seek job counts, from the collector)
//   - recession_reddit_posts       (per-post reddit activity, from the collector)
//   - recession_fun_posts          (monthly top/controversial posts per sub)
// Everything is computed server side; the page just renders numbers.

import { promises as fs } from "node:fs";
import path from "node:path";
import { all } from "@/app/lib/sql";

export type IviData = {
  source: string;
  sourceUrl: string;
  retrieved: string;
  licence: string;
  unit: string;
  months: string[];
  series: {
    ictProfessionals: { title: string; values: number[] };
    allOccupations: { title: string; values: number[] };
  };
};

export type RedditMonthly = { sub: string; month: string; count: number };
export type RedditWeekly = { weekStart: string; count: number };
export type SeekPoint = { day: string; series: string; value: number };
export type FunPost = {
  sub: string;
  kind: "top" | "controversial";
  rank: number;
  title: string | null;
  link: string | null;
  author: string | null;
};

export type ThenVsNow = {
  heading: string;
  then: string;
  now: string;
  punchline: string;
  maths: string;
};

export type RefStat = { value: number; label: string; source: string; name?: string };
export type ReferenceStats = {
  retrieved: string;
  medianGradSalary: RefStat;
  gradSalary2006: RefStat;
  awote: RefStat;
  pmSalary: RefStat;
  medianCeoPay: RefStat;
  topCeoPay: RefStat;
  muskNetWorth: RefStat;
  sydneyHouse2006: RefStat;
  sydneyHouseNow: RefStat;
  applicationsPerAd: { default: number; min: number; max: number; label: string; source: string };
  paperMaths: {
    pagesPerApplication: number;
    sheetsPerReamCm: { sheets: number; cm: number };
    gramsPerSheet: number;
  };
};

export type RecessionData = {
  ivi: IviData;
  peak: { month: string; value: number };
  recentPeak: { month: string; value: number }; // free-money era local peak
  daysSincePeak: number;
  daysSinceRecentPeak: number;
  latest: { month: string; value: number };
  vsPeakPct: number; // negative = below peak
  vsFiveYearsPct: number;
  vs2006Pct: number;
  yearly: { yearsAgo: number; month: string; value: number; pct: number }[];
  indexLabel: string;
  redditMonthly: RedditMonthly[];
  redditWeekly: RedditWeekly[]; // AU subs combined, complete weeks only
  seekSeries: SeekPoint[];
  seekLatest: Record<string, number>;
  funPosts: FunPost[];
  auSubs: string[];
  globalSubs: string[];
  thenVsNow: ThenVsNow[];
  adsPerWhinge: { ads: number; whinges: number; ratio: number } | null;
  refStats: ReferenceStats;
  adsPerYear: number; // latest IVI monthly value annualised
};

export const AU_SUBS = ["ausjobs", "auscorp"];
export const GLOBAL_SUBS = ["cscareerquestions", "csMajors", "recruitinghell", "ITCareerQuestions"];

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1)).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function loadIvi(): Promise<IviData> {
  const raw = await fs.readFile(path.join(process.cwd(), "data", "recession", "ivi-ict.json"), "utf8");
  return JSON.parse(raw) as IviData;
}

async function loadRefStats(): Promise<ReferenceStats> {
  const raw = await fs.readFile(path.join(process.cwd(), "data", "recession", "reference-stats.json"), "utf8");
  return JSON.parse(raw) as ReferenceStats;
}

function daysSinceMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  // middle of the month keeps the number honest either side
  return Math.floor((Date.now() - Date.UTC(y, m - 1, 15)) / 86_400_000);
}

async function tableExists(name: string): Promise<boolean> {
  const rows = (await all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [name])) as any[];
  return rows.length > 0;
}

export async function getRecessionData(): Promise<RecessionData> {
  const ivi = await loadIvi();
  const ict = ivi.series.ictProfessionals.values;
  const months = ivi.months;

  const refStats = await loadRefStats();

  const latestIdx = ict.length - 1;
  const latest = { month: months[latestIdx], value: ict[latestIdx] };
  let peakIdx = 0;
  for (let i = 1; i < ict.length; i++) if (ict[i] > ict[peakIdx]) peakIdx = i;
  const peak = { month: months[peakIdx], value: ict[peakIdx] };

  // free-money era local peak: highest month from 2021 onwards
  let recentPeakIdx = months.findIndex((m) => m >= "2021-01");
  for (let i = recentPeakIdx + 1; i < ict.length; i++) {
    if (ict[i] > ict[recentPeakIdx]) recentPeakIdx = i;
  }
  const recentPeak = { month: months[recentPeakIdx], value: ict[recentPeakIdx] };

  const fiveYearsIdx = Math.max(0, latestIdx - 60);
  const vsPeakPct = Math.round(((latest.value - peak.value) / peak.value) * 100);
  const vsFiveYearsPct = Math.round(((latest.value - ict[fiveYearsIdx]) / ict[fiveYearsIdx]) * 100);
  const yearly = [1, 2, 3, 4, 5].map((yearsAgo) => {
    const idx = Math.max(0, latestIdx - yearsAgo * 12);
    return {
      yearsAgo,
      month: months[idx],
      value: ict[idx],
      pct: Math.round(((latest.value - ict[idx]) / ict[idx]) * 100),
    };
  });
  const avg2006 = Math.round(ict.slice(0, 12).reduce((a, b) => a + b, 0) / 12);
  const vs2006Pct = Math.round(((latest.value - avg2006) / avg2006) * 100);

  const indexLabel =
    vsPeakPct > -15 ? "Mild sniffles" :
    vsPeakPct > -30 ? "Concerning cough" :
    vsPeakPct > -45 ? "See a doctor" :
    vsPeakPct > -60 ? "Family has been notified" :
    "Cooked";

  // DB-backed pieces degrade gracefully before the collector has run
  let redditMonthly: RedditMonthly[] = [];
  let seekSeries: SeekPoint[] = [];
  let funPosts: FunPost[] = [];

  let redditWeekly: RedditWeekly[] = [];
  if (await tableExists("recession_reddit_posts")) {
    redditMonthly = (await all(
      `SELECT sub, strftime('%Y-%m', created_utc, 'unixepoch') AS month, COUNT(*) AS count
       FROM recession_reddit_posts
       GROUP BY sub, month
       ORDER BY month ASC`,
    )) as RedditMonthly[];

    // AU subs, bucketed by ISO week (Monday start); drop the partial first
    // week of collected history and the partial current week
    const placeholders = AU_SUBS.map(() => "?").join(",");
    const weeks = (await all(
      `SELECT date(created_utc, 'unixepoch', 'weekday 1', '-7 days') AS weekStart, COUNT(*) AS count
       FROM recession_reddit_posts
       WHERE sub IN (${placeholders})
       GROUP BY weekStart
       ORDER BY weekStart ASC`,
      AU_SUBS,
    )) as RedditWeekly[];
    const currentWeekStart = new Date();
    const dow = (currentWeekStart.getUTCDay() + 6) % 7; // Monday = 0
    currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() - dow);
    const currentWeek = currentWeekStart.toISOString().slice(0, 10);
    redditWeekly = weeks.slice(1).filter((w) => w.weekStart < currentWeek);
  }
  if (await tableExists("recession_series")) {
    seekSeries = (await all(
      `SELECT day, series, value FROM recession_series ORDER BY day ASC`,
    )) as SeekPoint[];
  }
  if (await tableExists("recession_fun_posts")) {
    funPosts = (await all(
      `SELECT sub, kind, rank, title, link, author FROM recession_fun_posts ORDER BY sub, kind, rank`,
    )) as FunPost[];
  }

  const seekLatest: Record<string, number> = {};
  for (const p of seekSeries) seekLatest[p.series] = p.value; // ordered ASC, last write wins

  // whinge ratio: current tech job ads on Seek per r/ausjobs post in the last 30 days
  let adsPerWhinge: RecessionData["adsPerWhinge"] = null;
  if (await tableExists("recession_reddit_posts")) {
    const cutoff = Math.floor(Date.now() / 1000) - 30 * 86400;
    const row = (await all(
      `SELECT COUNT(*) AS c FROM recession_reddit_posts WHERE sub = 'ausjobs' AND created_utc >= ?`,
      [cutoff],
    )) as { c: number }[];
    const whinges = Number(row?.[0]?.c ?? 0);
    const ads = seekLatest["seek-ict-all"];
    if (whinges > 0 && Number.isFinite(ads)) {
      adsPerWhinge = { ads, whinges, ratio: Math.round((ads / whinges) * 10) / 10 };
    }
  }

  // Then vs now cards, all backed by the numbers above
  const ratioPeak = Math.round((peak.value / latest.value) * 10) / 10;
  const ratio2006 = Math.round((avg2006 / latest.value) * 10) / 10;
  const fiveYearsAgo = ict[fiveYearsIdx];
  const ratio5y = Math.round((fiveYearsAgo / latest.value) * 10) / 10;

  const grad = seekLatest["seek-ict-graduate"];
  const allIct = seekLatest["seek-ict-all"];
  const senior = seekLatest["seek-ict-senior"];

  const thenVsNow: ThenVsNow[] = [
    {
      heading: "The peak, a lifetime ago",
      then: `${monthLabel(peak.month)}: ${peak.value.toLocaleString("en-AU")} tech job ads`,
      now: `${monthLabel(latest.month)}: ${latest.value.toLocaleString("en-AU")} tech job ads`,
      punchline: `For every ad today there were ${ratioPeak} at the peak. Your timing is impeccable.`,
      maths: `IVI trend, ICT Professionals, ${monthLabel(peak.month)} vs ${monthLabel(latest.month)}.`,
    },
    {
      heading: "Five years ago",
      then: `${monthLabel(months[fiveYearsIdx])}: ${fiveYearsAgo.toLocaleString("en-AU")} ads a month`,
      now: `${latest.value.toLocaleString("en-AU")} ads a month`,
      punchline: ratio5y >= 1
        ? `${ratio5y} ads then for every 1 now. The person who ghosted you in 2021 had ${ratio5y}x the options and still didn't reply.`
        : `Somehow more ads now than then. Do not get used to this sentence.`,
      maths: `IVI trend, ICT Professionals, same month five years apart.`,
    },
    {
      heading: "Twenty years ago",
      then: `2006 average: ${avg2006.toLocaleString("en-AU")} tech ads a month, applied to by fax and hope`,
      now: `${latest.value.toLocaleString("en-AU")} a month, applied to by you and four hundred rivals per listing`,
      punchline: `A 2006 grad had ${ratio2006}x the ads and zero LinkedIn thought leaders. Different universe.`,
      maths: `IVI trend, ICT Professionals, 2006 calendar-year average vs ${monthLabel(latest.month)}.`,
    },
  ];

  if (Number.isFinite(grad) && Number.isFinite(allIct) && allIct > 0) {
    const share = Math.max(1, Math.round(allIct / Math.max(1, grad)));
    thenVsNow.push({
      heading: "The graduate hunger games",
      then: `Tech ads on Seek right now: ${allIct.toLocaleString("en-AU")}`,
      now: `Ones that mention "graduate": ${grad.toLocaleString("en-AU")}`,
      punchline: `1 in ${share} tech ads wants a graduate. ${Number.isFinite(senior) ? `"Senior" appears in ${senior.toLocaleString("en-AU")} of them, so the entry-level path is: be senior.` : `The rest would like five years of experience with tools released last year.`}`,
      maths: `Live Seek counts, ICT classification, keyword slices, captured ${new Date().toLocaleDateString("en-AU")}.`,
    });
  }

  return {
    ivi,
    peak,
    recentPeak,
    daysSincePeak: daysSinceMonth(peak.month),
    daysSinceRecentPeak: daysSinceMonth(recentPeak.month),
    latest,
    vsPeakPct,
    vsFiveYearsPct,
    vs2006Pct,
    yearly,
    indexLabel,
    redditMonthly,
    redditWeekly,
    seekSeries,
    seekLatest,
    funPosts,
    auSubs: AU_SUBS,
    globalSubs: GLOBAL_SUBS,
    thenVsNow,
    adsPerWhinge,
    refStats,
    adsPerYear: latest.value * 12,
  };
}

export { monthLabel };
