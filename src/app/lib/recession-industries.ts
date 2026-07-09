// src/app/lib/recession-industries.ts
//
// Config and data assembly for the per-industry Recession Indicator pages.
// Every industry gets the same treatment: an IVI trend series (bundled in
// data/recession/ivi-industries.json), live Seek counts when the collector
// has delivered them, and its own cynical explanation of why the line moves.

import { promises as fs } from "node:fs";
import path from "node:path";
import { all } from "@/app/lib/sql";

export type IndustrySlug = "tech" | "nursing" | "childcare" | "education" | "marketing";

export type IndustryHook = {
  kicker: string;
  title: string;
  blurb: string;
  tiles: { big: string; small: string }[];
  punchline: string;
  sources: string;
  flow?: boolean; // strip layout joins the stats with arrows instead of rules
  // optional pictogram conversion, e.g. three residents -> two care jobs
  conversion?: {
    from: { emoji: string; count: number; label: string };
    to: { emoji: string; count: number; label: string };
  };
};

export type IndustryConfig = {
  slug: IndustrySlug;
  name: string;
  edition: string; // masthead edition line
  tagline: string;
  occupationNote: string; // what the IVI group actually covers
  seekClassification: string;
  seekExtraParams?: string; // e.g. keyword narrowing for childcare
  searchTerms: string[]; // what the fake search bar matches on
  headcount?: { value: number; label: string; source: string }; // real people in the job
  hook: IndustryHook;
  extraHook?: IndustryHook; // a second exhibit for industries with more to say
  quips: Record<number, string>; // yearsAgo -> line
  pickerLine: string; // one-liner on the landing page card
};

export const INDUSTRIES: Record<IndustrySlug, IndustryConfig> = {
  tech: {
    slug: "tech",
    name: "Tech",
    edition: "Tech jobs edition",
    tagline: "An almanac of the Australian tech job market. Updated whenever it gets worse.",
    occupationNote: "IVI group: ICT Professionals",
    seekClassification: "6281",
    searchTerms: ["tech", "it", "ict", "software", "developer", "programmer", "engineer", "computer", "cyber", "data"],
    headcount: {
      value: 1000000,
      label: "people already in Australia's tech workforce, which passed the million mark in 2024",
      source: "ACS Digital Pulse 2024",
    },
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves",
      blurb: "",
      tiles: [],
      punchline: "",
      sources: "",
    },
    quips: {
      1: "You were told it had bottomed out.",
      2: "The bottom was also called this year. It was not the bottom.",
      3: "Layoffs everywhere, and still nearly double today's postings.",
      4: "Free-money era. Juniors were fielding counter-offers. Counter-offers!",
      5: "Everyone still complained. Nobody knew.",
    },
    pickerLine: "The one you already know about.",
  },
  nursing: {
    slug: "nursing",
    name: "Nursing & Medicine",
    edition: "Nursing and medicine edition",
    tagline: "An almanac of the Australian health job market. The only line on this site that mostly goes up.",
    occupationNote: "IVI group: Medical Practitioners and Nurses",
    seekClassification: "1211",
    searchTerms: ["nurs", "health", "medic", "doctor", "aged care", "hospital", "midwif"],
    headcount: {
      value: 512332,
      label: "nurses and midwives on the national register, the biggest health profession in the country",
      source: "Nursing and Midwifery Board of Australia registrant data, 2024",
    },
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: people got old",
      blurb: "The healthiest jobs line in the country, for the least inspiring reason going: demographics.",
      tiles: [
        { big: "2x", small: "the size the care and support workforce may need to be by 2049-50, versus 2020-21 (Intergenerational Report 2023)" },
        { big: "~79,500", small: "projected national nurse shortfall by 2035 (Department of Health modelling)" },
        { big: "3x", small: "the number of Australians aged 85+ over the coming decades, tripling from today" },
      ],
      punchline:
        "The generation that accumulated most of the housing stock is now accumulating hip replacements. Every year of boomer ageing converts directly into rosters, wards and vacancies. Your demand curve is, bluntly, their mortality schedule. Congratulations on the job security, and sorry about the reason.",
      sources: "Intergenerational Report 2023; Department of Health, Disability and Ageing workforce modelling via Ageing Australia.",
    },
    extraHook: {
      kicker: "Exhibit A½",
      title: "The conversion rate",
      blurb: "Since October 2024 the law requires 215 minutes of care per aged-care resident per day, 44 of them from a registered nurse. Which means boomers now convert into jobs at a fixed, legislated exchange rate.",
      tiles: [
        { big: "215 min", small: "of mandated care per resident per day, including 44 registered-nurse minutes (Department of Health, from 1 October 2024)" },
        { big: "3 → 2", small: "every three residents mandate roughly two full-time care jobs (215 min × 7 days vs a 38-hour week)" },
        { big: "7 → 1", small: "every seven residents mandate a full-time registered nurse, by the same arithmetic" },
      ],
      punchline:
        "Every boomer who checks into residential care legally manufactures about two-thirds of a full-time job on arrival. Your demand curve is written directly into legislation, with a stopwatch attached. Whether the wage is livable is a separate exhibit the sector would prefer we not print.",
      sources: "Care minutes mandate: Department of Health, Disability and Ageing. FTE maths shown on the tiles.",
      conversion: {
        from: { emoji: "👵", count: 3, label: "residents entering aged care" },
        to: { emoji: "🧑‍⚕️", count: 2, label: "full-time care jobs, mandated by law" },
      },
    },
    quips: {
      1: "Still hiring. The patients keep arriving on schedule.",
      2: "A rare downtick. The boomers took a year off from ageing, apparently.",
      3: "COVID backlog plus retirements. The roster gaps wrote the job postings themselves.",
      4: "Every state health department discovered vacancies at the same time.",
      5: "Already short-staffed then. The word 'ratios' does a lot of work in this industry.",
    },
    pickerLine: "Demand courtesy of everyone getting old at once.",
  },
  childcare: {
    slug: "childcare",
    name: "Childcare & Care Work",
    edition: "Care work edition",
    tagline: "An almanac of the Australian care job market. Someone has to hold everything together. Underpaid, obviously.",
    occupationNote: "IVI group: Carers and Aides, which bundles child carers with aged and disabled carers. The same line covers both ends of life, which says plenty",
    seekClassification: "6123",
    seekExtraParams: "&keywords=early+childhood",
    searchTerms: ["child", "care", "early childhood", "ecec", "daycare", "kinder", "educator"],
    headcount: {
      value: 173000,
      label: "people already working in children's education and care, on some of the lowest professional pay going",
      source: "Jobs and Skills Australia sector profiles",
    },
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: both parents are at work",
      blurb: "Demand here has little to do with a national love of early learning and everything to do with mortgage arithmetic.",
      tiles: [
        { big: "21,000", small: "extra qualified educators needed right now just to meet current demand (Jobs and Skills Australia)" },
        { big: "173,000", small: "people already working in children's education and care, with below-average retention and pay to match" },
        { big: "2", small: "incomes now required to service a median mortgage. The kids have to go somewhere between 9 and 5" },
      ],
      punchline:
        "A single income stopped covering the median mortgage around the same time the mortgage doubled, so both parents work, so the kids need somewhere to be. That is the demand. The sector answers it on some of the lowest professional wages in the country, which is why the vacancies never close.",
      sources: "Jobs and Skills Australia, The Future of the Early Childhood Education Profession (2024); The Parenthood; sector workforce profiles.",
    },
    extraHook: {
      kicker: "Exhibit A½",
      title: "The pipeline: mortgage → two jobs → childcare",
      flow: true,
      blurb: "The correlation nobody markets: as the cost of living climbed, the single-income family turned into a luxury product. Every family that lost it became a childcare customer.",
      tiles: [
        { big: "52.5%", small: "of couple families with dependent children had both parents working in 1993 (AIFS)" },
        { big: "70%+", small: "the same figure today (ABS Labour Force Status of Families). The stay-at-home parent is now a minority position" },
        { big: "11.8 → 21.6", small: "years of a graduate salary to buy the median Sydney house, 2006 versus now. This is the machine driving the other two numbers" },
      ],
      punchline:
        "Follow the pipeline: the house got dearer, so both parents work, so the kids need somewhere to go, so childcare demand grows every year the housing market does. Early learning is the only industry whose order book is written by the mortgage belt.",
      sources: "AIFS Family Facts (June 1993); ABS Labour Force Status of Families; house-to-salary maths as per the tech edition's Race to Home exhibit.",
    },
    quips: {
      1: "Vacancies everywhere. Wages, less so.",
      2: "The 'wage crisis in care work' articles ran this year. And every year.",
      3: "Subsidy changes pushed demand up. Pay stayed put. Interesting experiment.",
      4: "Every centre in the country had a 'we're hiring' sign out. Many still do.",
      5: "Short-staffed then too. This industry has never once been fully staffed.",
    },
    pickerLine: "Powered by the two-income mortgage.",
  },
  education: {
    slug: "education",
    name: "Education",
    edition: "Education edition",
    tagline: "An almanac of the Australian teaching job market. The vacancies are real, the reasons are grim.",
    occupationNote: "IVI group: Education Professionals",
    seekClassification: "6123",
    searchTerms: ["teach", "education", "school", "lecturer", "tutor"],
    headcount: {
      value: 550000,
      label: "registered teachers nationally, about 325,000 of them full-time-equivalent in schools",
      source: "AITSL Australian Teacher Workforce Data / ACARA, 2025",
    },
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: the exits are crowded",
      blurb: "Teaching vacancies are not a growth story. They are a churn story.",
      tiles: [
        { big: "1 in 3", small: "teachers considering leaving the profession, depending on which survey you read. None of the surveys are cheerful" },
        { big: "1000s", small: "projected secondary teacher shortfall this decade, per the federal government's own workforce reviews" },
        { big: "100%", small: "of the job's admin load that was definitely not in the brochure" },
      ],
      punchline:
        "Every posting on this line is mostly a chair someone just left. The demand for teachers is permanent because children keep existing; the vacancies are permanent because the working conditions keep convincing teachers to stop. You are being recruited to replace someone who warned you on their way out.",
      sources: "Federal teacher workforce reviews and shortage projections; AEU and state workforce surveys.",
    },
    quips: {
      1: "The retention crisis articles ran again. The word 'crisis' is now furniture.",
      2: "Every state announced a teacher recruitment drive. Simultaneously. Again.",
      3: "Post-COVID exits peaked. The staffroom group chat got quieter.",
      4: "Remote learning ended and a lot of teachers ended with it.",
      5: "The shortage was already 'looming' then. It has since arrived and unpacked.",
    },
    pickerLine: "Hiring because the last person quit.",
  },
  marketing: {
    slug: "marketing",
    name: "Marketing",
    edition: "Marketing edition",
    tagline: "An almanac of the Australian marketing job market. First budget cut, first out the door.",
    occupationNote: "IVI group: Sales, Marketing & Public Relations Professionals",
    seekClassification: "6008",
    searchTerms: ["market", "advertis", "brand", "pr", "comms", "media", "content", "social"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: the budget went first",
      blurb: "Marketing headcount is a leading indicator of corporate panic. When money tightens, this line drops before anyone else's.",
      tiles: [
        { big: "~7.7%", small: "of company revenue going to marketing budgets in 2024, down from over 9% the year before (Gartner CMO survey)" },
        { big: "1st", small: "line item cut when a CFO gets nervous. It has always been this one" },
        { big: "∞", small: "LinkedIn posts about 'doing more with less'. The less was you" },
      ],
      punchline:
        "No board has ever cut the legal team first. When budgets tighten, marketing goes. Generative tools just handed every CFO a fresh excuse. The postings that survive now want one person to do the work of the four who left, with a title like 'growth ninja' as compensation.",
      sources: "Gartner annual CMO spend surveys; the collective sighing of r/marketing.",
    },
    quips: {
      1: "Budgets 'stabilised', which is corporate for 'stopped falling because there was nothing left'.",
      2: "AI content tools arrived and every brief became 'can we do this in-house'.",
      3: "The great budget cull. CMOs called it 'efficiency'. The team called it Tuesday.",
      4: "Peak brand-spend. Agencies had waiting lists. Waiting lists!",
      5: "Everyone was hiring content teams. The content remains. The teams do not.",
    },
    pickerLine: "A leading indicator of corporate panic.",
  },
};

// growth since 2006, indexed multiples, for the pay-vs-everything exhibit
export const GROWTH_SINCE_2006 = {
  baseline: "2006",
  rows: [
    {
      label: "Average full-time pay",
      mult: 1.94,
      detail: "AWOTE $1,058.90/wk (Nov 2006) to $2,051.10/wk (Nov 2025)",
      source: "ABS Average Weekly Earnings",
    },
    {
      label: "The price of everything",
      mult: 1.67,
      detail: "consumer prices, 2006 to 2026",
      source: "RBA inflation calculator / ABS CPI",
    },
    {
      label: "The median Sydney house",
      mult: 3.44,
      detail: "$470,000 to $1,617,000",
      source: "APM and CoreLogic-era medians",
    },
  ],
};

export type IviIndustries = {
  source: string;
  sourceUrl: string;
  retrieved: string;
  licence: string;
  unit: string;
  months: string[];
  series: Record<string, { anzsco: string; title: string; values: number[] }>;
};

export type IndustryData = {
  config: IndustryConfig;
  ivi: { source: string; sourceUrl: string; retrieved: string; licence: string };
  months: string[];
  values: number[];
  seriesTitle: string;
  peak: { month: string; value: number };
  latest: { month: string; value: number };
  vsPeakPct: number;
  vs2006Pct: number;
  yearly: { yearsAgo: number; month: string; value: number; pct: number }[];
  indexLabel: string;
  hiring: boolean;
  daysSincePeak: number;
  seekLatest: Record<string, number>;
};

export function indexLabelFor(vsPeakPct: number, hiring: boolean): string {
  if (hiring) return "Hiring";
  return vsPeakPct <= -55 ? "Cooked" : "Ehhh";
}

async function loadIviIndustries(): Promise<IviIndustries> {
  const raw = await fs.readFile(path.join(process.cwd(), "data", "recession", "ivi-industries.json"), "utf8");
  return JSON.parse(raw) as IviIndustries;
}

async function tableExists(name: string): Promise<boolean> {
  const rows = (await all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [name])) as any[];
  return rows.length > 0;
}

function daysSinceMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return Math.floor((Date.now() - Date.UTC(y, m - 1, 15)) / 86_400_000);
}

function summarise(config: IndustryConfig, months: string[], values: number[]) {
  const latestIdx = values.length - 1;
  const latest = { month: months[latestIdx], value: values[latestIdx] };
  let peakIdx = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[peakIdx]) peakIdx = i;
  const peak = { month: months[peakIdx], value: values[peakIdx] };
  const vsPeakPct = Math.round(((latest.value - peak.value) / peak.value) * 100);
  const fiveYearsAgo = values[Math.max(0, latestIdx - 60)];
  // "hiring" = near its all-time high, or meaningfully (10%+) above five years ago
  const hiring = vsPeakPct >= -20 || latest.value >= fiveYearsAgo * 1.1;
  return { latest, peak, vsPeakPct, hiring, indexLabel: indexLabelFor(vsPeakPct, hiring) };
}

export async function getIndustrySummaries() {
  const ivi = await loadIviIndustries();
  return (Object.keys(INDUSTRIES) as IndustrySlug[]).map((slug) => {
    const config = INDUSTRIES[slug];
    const s = ivi.series[slug];
    const { latest, vsPeakPct, hiring, indexLabel } = summarise(config, ivi.months, s.values);
    return {
      slug,
      name: config.name,
      pickerLine: config.pickerLine,
      searchTerms: config.searchTerms,
      latest,
      vsPeakPct,
      hiring,
      indexLabel,
    };
  });
}

export async function getIndustryData(slug: IndustrySlug): Promise<IndustryData> {
  const config = INDUSTRIES[slug];
  const ivi = await loadIviIndustries();
  const s = ivi.series[slug];
  const months = ivi.months;
  const values = s.values;
  const { latest, peak, vsPeakPct, hiring, indexLabel } = summarise(config, months, values);

  const latestIdx = values.length - 1;
  const yearly = [1, 2, 3, 4, 5].map((yearsAgo) => {
    const idx = Math.max(0, latestIdx - yearsAgo * 12);
    return {
      yearsAgo,
      month: months[idx],
      value: values[idx],
      pct: Math.round(((latest.value - values[idx]) / values[idx]) * 100),
    };
  });
  const avg2006 = Math.round(values.slice(0, 12).reduce((a, b) => a + b, 0) / 12);
  const vs2006Pct = Math.round(((latest.value - avg2006) / avg2006) * 100);

  const seekLatest: Record<string, number> = {};
  if (await tableExists("recession_series")) {
    const rows = (await all(
      `SELECT day, series, value FROM recession_series WHERE series LIKE ? ORDER BY day ASC`,
      [`seek-${slug}-%`],
    )) as { day: string; series: string; value: number }[];
    for (const r of rows) seekLatest[r.series] = r.value;
  }

  return {
    config,
    ivi: { source: ivi.source, sourceUrl: ivi.sourceUrl, retrieved: ivi.retrieved, licence: ivi.licence },
    months,
    values,
    seriesTitle: s.title,
    peak,
    latest,
    vsPeakPct,
    vs2006Pct,
    yearly,
    indexLabel,
    hiring,
    daysSincePeak: daysSinceMonth(peak.month),
    seekLatest,
  };
}

export function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1)).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
