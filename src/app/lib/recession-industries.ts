// src/app/lib/recession-industries.ts
//
// Config and data assembly for the per-industry Recession Indicator pages.
// Every industry gets the same treatment: an IVI trend series (bundled in
// data/recession/ivi-industries.json), live Seek counts when the collector
// has delivered them, and its own cynical explanation of why the line moves.

import { promises as fs } from "node:fs";
import path from "node:path";
import { all } from "@/app/lib/sql";

export type IndustrySlug =
  | "tech" | "nursing" | "childcare" | "education" | "marketing"
  | "engineering" | "civil" | "electrical" | "mechanical" | "aerospace"
  | "hospitality" | "construction" | "architecture" | "actuarial"
  | "accounting" | "law" | "retail" | "media"
  | "design" | "science" | "environment" | "psychology" | "socialwork"
  | "veterinary" | "libraries" | "economics" | "justice";

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
  workforce?: number; // working headcount for competition maths, when the register overstates it
  hook: IndustryHook;
  extraHook?: IndustryHook; // a second exhibit for industries with more to say
  quips: Record<number, string>; // yearsAgo -> line
  pickerLine: string; // one-liner on the landing page card
  bigPlayers?: { name: string; note: string }[]; // the money in this industry
  hope?: { blurb: string; items: { tip: string; why: string; source?: string }[]; funFact?: string }; // rendered when the reading is not Hiring
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
    bigPlayers: [
      { name: "Atlassian", note: "US$4b+ revenue and still famously posting accounting losses. The jokes write themselves in Jira" },
      { name: "Canva", note: "design juggernaut, private, one of the biggest startups on earth" },
      { name: "WiseTech Global", note: "logistics software, quietly one of the most profitable tech firms in the country" },
      { name: "Xero", note: "accounting software, finally profitable after a long growth era" },
      { name: "REA Group", note: "realestate.com.au; property listings print money in this economy, of course they do" },
      { name: "Seek", note: "yes, the job board. The house always wins" },
      { name: "TechnologyOne", note: "government and university software, profitable every year like clockwork" },
      { name: "NextDC", note: "data centres for the AI build-out, spending like it" },
    ],
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
    bigPlayers: [
      { name: "CSL", note: "blood plasma and vaccines, roughly US$2.6b profit a year, Australia's biggest biotech by far" },
      { name: "Ramsay Health Care", note: "private hospitals, around $16b revenue" },
      { name: "Sonic Healthcare", note: "pathology across three continents" },
      { name: "Cochlear", note: "hearing implants, roughly $0.4b profit" },
      { name: "ResMed", note: "sleep devices, listed in the US, very profitable" },
      { name: "Medibank", note: "insurer, roughly half a billion in profit" },
      { name: "Bupa ANZ", note: "insurer and aged care operator" },
      { name: "Regis Healthcare", note: "listed aged care, the sector the demographics feed" },
    ],
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
    bigPlayers: [
      { name: "Goodstart Early Learning", note: "the country's biggest provider, not-for-profit, born from the ABC Learning collapse" },
      { name: "G8 Education", note: "biggest listed operator, profit in the tens of millions" },
      { name: "Affinity Education", note: "private-equity owned, 200+ centres" },
      { name: "Busy Bees Asia Pacific", note: "global chain, backed by a Canadian teachers' pension fund, which is a sentence" },
      { name: "Guardian Childcare & Education", note: "private-equity owned again. Noticing a pattern" },
      { name: "Nido Education", note: "listed in 2023" },
      { name: "KU Children's Services", note: "not-for-profit, over a century old" },
      { name: "C&K", note: "Queensland's community kindergarten giant" },
    ],
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
    workforce: 325000,
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
    bigPlayers: [
      { name: "IDP Education", note: "student placement and English testing, roughly $130m profit in a good year" },
      { name: "University of Melbourne", note: "about $3b a year in revenue. A university, technically" },
      { name: "Monash University", note: "Australia's biggest by enrolment" },
      { name: "University of Sydney", note: "international student fees built most of the new buildings" },
      { name: "UNSW", note: "same story, different postcode" },
      { name: "University of Queensland", note: "and again" },
      { name: "Navitas", note: "private pathway colleges, private-equity owned" },
      { name: "Cluey Learning", note: "listed online tutoring; listed and profitable are different words" },
    ],
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
    bigPlayers: [
      { name: "WPP", note: "global holding company behind Ogilvy, VML and half the industry" },
      { name: "Publicis Groupe", note: "the current king of the holdcos, Saatchi & Saatchi and Leo Burnett live here" },
      { name: "Omnicom", note: "Clemenger BBDO's parent, mid-merger with IPG to make one even bigger company" },
      { name: "Interpublic (IPG)", note: "Mediabrands and Initiative, soon part of Omnicom" },
      { name: "Dentsu", note: "Japanese giant with a large ANZ footprint" },
      { name: "Accenture Song", note: "a consultancy that ate an ad industry" },
      { name: "TBWA", note: "Omnicom again. It is holdcos all the way down" },
      { name: "M&C Saatchi", note: "one of the few still listed under its own name" },
    ],
    hope: {
      blurb: "The genuine, boring, proven playbook. None of this is secret, it is just work.",
      items: [
        { tip: "Build a public portfolio of measurable results", why: "marketing hiring is work-sample driven; one campaign with real numbers beats any GPA", source: "Employer surveys consistently rank demonstrated work above credentials for marketing roles (HubSpot State of Marketing; LinkedIn hiring reports)" },
        { tip: "Get the free industry certifications", why: "Google Ads, GA4 and Meta Blueprint are free, take days, and are literal keyword filters in applicant tracking systems", source: "Google Skillshop and Meta Blueprint are free and industry-standard; keyword screening is documented ATS behaviour (Jobscan and ATS vendor docs)" },
        { tip: "Chase the new job titles, not the old ones", why: "postings for 'marketing coordinator' shrank; social media, content, performance, CRM and lifecycle roles are where the postings went", source: "LinkedIn's Jobs on the Rise lists growth, lifecycle and content roles among the fastest-growing marketing titles year after year" },
        { tip: "Go in-house, not agency", why: "retailers, health funds, universities and governments all run marketing teams, hire steadily and pay better than entry-level agency work", source: "Most marketing employment is client-side, not agency (ABS labour force by industry); the employer table above is dominated by in-house teams" },
        { tip: "Do real work for a small business", why: "a local cafe whose bookings you doubled is a case study; an unpaid agency internship is a queue", source: "Work-sample hiring again: a documented result is the strongest signal in every hiring-manager survey going" },
      ],
      funFact: "The marketing jobs did not vanish, they changed names. Most of the fastest-growing titles in the field, social media manager, content designer, performance marketer, lifecycle specialist, barely existed fifteen years ago, and most of them never say the word 'marketing'.",
    },
  },

  engineering: {
    slug: "engineering",
    name: "Engineering",
    edition: "Engineering edition",
    tagline: "An almanac of the Australian engineering job market. Everyone says shortage, the chart says otherwise, both are right.",
    occupationNote: "IVI group: Engineers (all disciplines)",
    seekClassification: "1209",
    searchTerms: ["engineer", "engineering"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: the shortage paradox",
      blurb: "Postings sit two-thirds below the mining-boom peak while every peak body screams shortage. Both things are true.",
      tiles: [
        { big: "100,000", small: "additional engineers Australia needs by 2030 to meet existing demand (Engineers Australia)" },
        { big: "15+", small: "engineering occupations currently listed in national shortage (Jobs and Skills Australia)" },
        { big: "70%", small: "of engineering workforce growth over five years came from overseas-born engineers, nearly half of whom end up working outside engineering" },
      ],
      punchline:
        "The 2008-era peak was miners paying anyone with a pulse and a hard hat. Today's demand hides in government project pipelines, defence programs and energy projects that hire slowly, need clearances and run behind schedule. The shortage is real. The postings just take the scenic route.",
      sources: "Engineers Australia workforce reports; Jobs and Skills Australia occupation shortage list.",
    },
    quips: {
      1: "Still waiting on that infrastructure pipeline to hit the job boards.",
      2: "Every state announced megaprojects. The postings said 'we'll see'.",
      3: "Post-COVID catch-up construction. Briefly, everyone was wanted.",
      4: "The word 'shortage' appeared in roughly one thousand headlines.",
      5: "Consultancies hoovered up grads, then billed them out at 4x.",
    },
    pickerLine: "A shortage and a slump at the same time.",
    bigPlayers: [
      { name: "Worley", note: "global energy and resources engineering, Australia's biggest" },
      { name: "CIMIC Group", note: "construction giant, parent of CPB and UGL" },
      { name: "John Holland", note: "megaproject regular, Chinese-owned since 2015" },
      { name: "Downer", note: "infrastructure services everywhere you look" },
      { name: "Monadelphous", note: "mining services, famously well run" },
      { name: "GHD", note: "consultancy, employee-owned" },
      { name: "Aurecon", note: "design and advisory across everything" },
      { name: "SMEC", note: "born from the Snowy Scheme, literally" },
    ],
    hope: {
      blurb: "The reading above is measured against a mining boom. The shortage lists are real, and so is this playbook.",
      items: [
        { tip: "Get chartered (CPEng) as early as the rules allow", why: "chartered status is a hard filter on government and tier-one project work, and most engineers put it off for years", source: "Registration is now law for many engineering services in QLD (Professional Engineers Act), VIC and NSW; Engineers Australia administers CPEng" },
        { tip: "Chase a security clearance", why: "defence programs forecast 30,000 roles by 2030 and require citizenship plus clearance, which shrinks your competition to a puddle", source: "Defence workforce plans, 30,000 roles by 2030; AGSVA clearances legally require Australian citizenship" },
        { tip: "Apply to state infrastructure authorities and utilities", why: "they run structured graduate intakes every year and are chronically understaffed, per their own workforce plans", source: "Published graduate programs at Transport for NSW, major water utilities and transmission operators; shortages per Jobs and Skills Australia" },
        { tip: "Point your degree at the energy transition", why: "the clean energy workforce needs to nearly triple this decade (AEMO); renewables, transmission and storage projects cannot find people", source: "AEMO Integrated System Plan 2024 workforce projections (21,500 to 59,300); Clean Energy Council calls labour the biggest constraint on delivery" },
        { tip: "Take the site job", why: "two years of site experience outqueues five years of design-office applications, and every recruiter says so", source: "Engineering recruiter commentary and salary guides (Hays, ConsultANZ) consistently rank site experience as the scarcest early-career asset" },
      ],
    },
  },
  civil: {
    slug: "civil",
    name: "Civil Engineering",
    edition: "Civil engineering edition",
    tagline: "An almanac of the Australian civil engineering job market. The pipeline is bigger than the workforce. The postings didn't get the memo.",
    occupationNote: "IVI group: Civil Engineering Professionals (3-month average)",
    seekClassification: "1209",
    seekExtraParams: "&keywords=civil",
    searchTerms: ["civil", "structural", "geotech", "infrastructure", "transport"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: the pipeline paradox",
      blurb: "Civil is on the national shortage list while posting numbers sit far below the boom years. Blame how megaprojects hire.",
      tiles: [
        { big: "#1", small: "civil engineering professionals top the volume of engineering postings in this data, every single month" },
        { big: "15+", small: "engineering occupations in national shortage, civil disciplines among them (Jobs and Skills Australia)" },
        { big: "10 yrs", small: "the length of the transport and energy project pipelines states have already committed to building" },
      ],
      punchline:
        "Megaprojects do not post two thousand jobs on Seek; they award a contract to a tier-one who quietly absorbs an entire cohort, then everyone else fights over whoever is left. The demand is real and multi-decade. It just hires like a cartel.",
      sources: "Jobs and Skills Australia shortage list; state infrastructure pipelines; Engineers Australia.",
    },
    quips: {
      1: "Same story: shortage on paper, silence on the boards.",
      2: "A tunnel project ate every geotech in three states.",
      3: "Rail megaprojects peaked. So did burnout posts on r/AusCorp.",
      4: "Post-COVID stimulus construction. The good old days, briefly.",
      5: "The infrastructure boom was announced. Again.",
    },
    pickerLine: "Shortage-listed, boom-hungover.",
    bigPlayers: [
      { name: "CPB Contractors", note: "CIMIC's delivery arm, on every second megaproject" },
      { name: "John Holland", note: "rail, road, tunnels, repeat" },
      { name: "Acciona", note: "Spanish giant, big in Australian civil works" },
      { name: "Lendlease", note: "development and construction, restructuring era" },
      { name: "Fulton Hogan", note: "roads, quietly everywhere" },
      { name: "Seymour Whyte", note: "mid-tier civil, Vinci-owned" },
      { name: "Georgiou", note: "west coast civil regular" },
      { name: "BMD Group", note: "family-owned, national civil contractor" },
    ],
    hope: {
      blurb: "Civil has the strongest fundamentals of any cooked-looking line on this site.",
      items: [
        { tip: "Target the tier-one graduate programs directly", why: "CPB, John Holland and Acciona hire graduate cohorts annually for committed multi-year projects; those roles rarely appear as ordinary postings", source: "Each tier-one publishes an annual graduate intake on its own careers site, sized to contracted project pipelines" },
        { tip: "Consider water, not just transport", why: "water utilities are on every shortage list, run their own grad intakes and compete with far fewer applicants", source: "Water and geotechnical engineering appear on the Jobs and Skills Australia national shortage list" },
        { tip: "Get RPEQ or state registration early", why: "engineer registration is now law in several states and instantly narrows the field", source: "Professional Engineers Act (QLD) and the VIC and NSW registration schemes make registration a legal requirement for much civil work" },
        { tip: "Site engineering first, design later", why: "contractors are permanently short of site engineers; it is the widest door into the industry", source: "Recruiter salary guides (Hays) list site engineers among the most in-demand civil roles every year" },
      ],
    },
  },
  electrical: {
    slug: "electrical",
    name: "Electrical Engineering",
    edition: "Electrical engineering edition",
    tagline: "An almanac of the Australian electrical engineering job market. Everything is being rewired and someone has to do it.",
    occupationNote: "IVI group: Electrical Engineers (3-month average)",
    seekClassification: "1209",
    seekExtraParams: "&keywords=electrical",
    searchTerms: ["electrical", "power", "energy", "grid", "renewables"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: everything is being rewired",
      blurb: "The only engineering line on this site that earns a green light, and it is because the entire grid is being rebuilt.",
      tiles: [
        { big: "3x", small: "the clean energy workforce needs to nearly triple this decade, from 21,500 to 59,300 workers (AEMO Integrated System Plan)" },
        { big: "32,000", small: "additional electricians needed by 2030 for the transition (Jobs and Skills Australia), and the engineers who design their work scale with them" },
        { big: "50%+", small: "of Australia's electrical engineers were born overseas; the local pipeline never kept up" },
      ],
      punchline:
        "Coal plants retiring, renewables connecting, transmission lines crossing three states, batteries everywhere: the energy transition is a legislated, funded, multi-decade rewiring of the country, and it is chronically short of people who understand power systems. Like nursing, the demand is written into policy. Unlike nursing, the pay reflects it.",
      sources: "AEMO Integrated System Plan 2024; Jobs and Skills Australia clean energy workforce study; Engineers Australia.",
    },
    quips: {
      1: "Transmission projects keep announcing. The line keeps climbing.",
      2: "Every battery project in the country fought over the same engineers.",
      3: "The ISP said triple the workforce. The workforce said with what people.",
      4: "Renewables investment wobbled, the engineers stayed scarce.",
      5: "Grid connection queues became a national sport.",
    },
    pickerLine: "The energy transition needs you, specifically.",
    bigPlayers: [
      { name: "AGL", note: "generator turned would-be green retailer" },
      { name: "Origin Energy", note: "the other big gentailer" },
      { name: "APA Group", note: "pipelines and increasingly electricity infrastructure" },
      { name: "Transgrid", note: "NSW transmission, building the interconnectors" },
      { name: "Ausgrid", note: "distribution, perpetually hiring" },
      { name: "Squadron Energy", note: "Forrest-backed renewables developer" },
      { name: "Vestas", note: "wind turbines, global, busy here" },
      { name: "UGL", note: "CIMIC's energy and utilities arm" },
    ],
  },
  mechanical: {
    slug: "mechanical",
    name: "Mechanical Engineering",
    edition: "Mechanical engineering edition",
    tagline: "An almanac of the Australian mechanical engineering job market. The factories left. The mines and the submarines stayed.",
    occupationNote: "IVI group: Industrial, Mechanical and Production Engineers (3-month average)",
    seekClassification: "1209",
    seekExtraParams: "&keywords=mechanical",
    searchTerms: ["mechanical", "mechatronic", "manufacturing", "industrial", "production"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: the factories left, the work didn't",
      blurb: "Car manufacturing died in 2017 and took a chunk of this line with it. What is left is mining, defence and whatever survived.",
      tiles: [
        { big: "2017", small: "the year Australian car manufacturing ended, and with it the biggest single employer of mechanical engineers" },
        { big: "30,000", small: "defence roles forecast by 2030; frigates and submarines are the new factories (Defence workforce plans)" },
        { big: "15+", small: "engineering occupations in national shortage, industrial and mechanical among them" },
      ],
      punchline:
        "The line never recovered from manufacturing's exit and never will, but the work moved rather than died: mining services, defence manufacturing, HVAC and building services, and maintenance on everything the boom built. Mechanical is the generalist degree in an economy that stopped making things and now mostly maintains them.",
      sources: "Jobs and Skills Australia; Defence workforce plans; Engineers Australia.",
    },
    quips: {
      1: "Defence primes hired anyone who could spell submarine.",
      2: "Mining maintenance quietly carried the whole discipline.",
      3: "Post-COVID supply chains made 'local manufacturing' a headline again. Briefly.",
      4: "Everyone rediscovered HVAC when the buildings reopened.",
      5: "The last car plants were already museums.",
    },
    pickerLine: "The economy stopped making things. Mostly.",
    bigPlayers: [
      { name: "BAE Systems Australia", note: "Hunter-class frigates, thousands of engineers" },
      { name: "ASC", note: "submarines, the AUKUS employer" },
      { name: "Monadelphous", note: "mining maintenance heavyweight" },
      { name: "Worley", note: "energy and resources engineering at scale" },
      { name: "Orica", note: "explosives and mining chemicals" },
      { name: "BlueScope", note: "steel, still standing" },
      { name: "ALS", note: "testing and inspection everywhere" },
      { name: "Mineral Resources", note: "mining services, eventful governance" },
    ],
    hope: {
      blurb: "The reading is grim against a peak that included car factories. The current playbook is narrower but real.",
      items: [
        { tip: "Aim at defence manufacturing", why: "AUKUS and shipbuilding forecast tens of thousands of roles, require citizenship, and the primes run yearly graduate intakes", source: "Defence workforce plans (30,000 roles by 2030); UNSW puts AUKUS engineering demand at 8,000+; BAE and ASC publish annual intakes" },
        { tip: "Mining services over mining houses", why: "the Monadelphous and UGL tier hires far more mechanical grads than BHP ever will", source: "Compare headcounts in their annual reports: services firms employ multiples of the miners' own engineering staff" },
        { tip: "Building services is the quiet winner", why: "every hospital, data centre and tower needs HVAC and fire engineers; the consultancies are permanently short", source: "Building services disciplines feature on the Jobs and Skills Australia shortage list and in every engineering salary guide's hot-roles section" },
        { tip: "Learn the maintenance and reliability toolkit", why: "an economy that stopped building factories still has to maintain everything it already owns", source: "Asset management and reliability roles dominate the mechanical listings in this page's own employer table" },
      ],
    },
  },
  aerospace: {
    slug: "aerospace",
    name: "Aerospace Engineering",
    edition: "Aerospace edition",
    tagline: "An almanac of the Australian aerospace job market. Defence is the customer now.",
    occupationNote: "IVI group: Other Engineering Professionals, the ANZSCO group that contains aeronautical engineers (3-month average), because the classification system predates the industry having a pulse",
    seekClassification: "1209",
    seekExtraParams: "&keywords=aerospace",
    searchTerms: ["aerospace", "aeronautical", "aviation", "space", "defence"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: defence is the customer",
      blurb: "Australia's aerospace industry is small, and nearly all of its growth is wearing a uniform.",
      tiles: [
        { big: "8,000+", small: "new engineers the AUKUS submarine program alone is projected to need (UNSW analysis)" },
        { big: "30,000", small: "defence roles forecast by 2030 across the industry" },
        { big: "1", small: "customer that matters. When your industry has one customer, its budget cycle is your job market" },
      ],
      punchline:
        "There is no Australian Boeing; there is Boeing Defence Australia, which is different. Aerospace here means defence primes, sustainment contracts and a small, genuinely exciting space sector living grant to grant. The jobs are real and growing, but they come with citizenship requirements, clearance queues and a single customer whose budget is a political football.",
      sources: "UNSW AUKUS workforce analysis; Defence workforce plans.",
    },
    quips: {
      1: "AUKUS hiring sprees, clearance queues longer than the runway.",
      2: "Every defence prime opened an Adelaide office. All of them.",
      3: "The space agency era: small grants, big renders.",
      4: "Sustainment contracts kept everyone fed while the subs stayed drawings.",
      5: "Qantas engineering was the dream job. Was.",
    },
    pickerLine: "One customer, and it wears a uniform.",
    bigPlayers: [
      { name: "BAE Systems Australia", note: "the biggest defence prime here" },
      { name: "Boeing Defence Australia", note: "biggest Boeing operation outside the US" },
      { name: "Lockheed Martin Australia", note: "F-35 sustainment and AUKUS work" },
      { name: "Airbus Australia Pacific", note: "helicopters and sustainment" },
      { name: "Thales Australia", note: "French prime, big local footprint" },
      { name: "ASC", note: "submarines, Adelaide's anchor tenant" },
      { name: "Qantas Engineering", note: "the civil side, leaner than it was" },
      { name: "Gilmour Space", note: "Queensland rockets, the genuinely new thing" },
    ],
    hope: {
      blurb: "Niche industry, narrow doors, but the doors are real and most people never try them.",
      items: [
        { tip: "Citizenship plus clearance is half the job application", why: "defence roles legally require it, which removes most of the global applicant pool before you even apply", source: "AGSVA security clearances require Australian citizenship by law" },
        { tip: "Apply to the primes' graduate programs, all of them", why: "BAE, Boeing, Lockheed, Thales and ASC each run annual intakes sized to multi-decade contracts", source: "Each prime publishes its graduate program annually; Boeing Defence Australia alone holds the most live postings in this page's employer table" },
        { tip: "Sustainment is the steady work", why: "keeping existing aircraft flying employs more engineers than building anything new, and it never stops", source: "Sustainment is the largest ongoing line in the Defence Integrated Investment Program budget papers" },
        { tip: "The space sector is tiny but desperate", why: "Gilmour and the satellite startups cannot compete with primes on pay, which means they hire on enthusiasm and portfolio", source: "Startup hiring is portfolio-driven by necessity; the Australian space sector's own workforce statements say as much" },
      ],
    },
  },

  hospitality: {
    slug: "hospitality",
    name: "Food & Beverage",
    edition: "Food and beverage edition",
    tagline: "An almanac of the Australian hospitality job market. The industry that staffs your weekend and cannot staff itself.",
    occupationNote: "IVI group: Hospitality Workers (chefs live in Food Trades, which is its own saga)",
    seekClassification: "1212",
    searchTerms: ["hospitality", "food", "beverage", "cafe", "restaurant", "bar", "chef", "waiter", "barista", "tourism"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: discretionary spending went first",
      blurb: "When household budgets tighten, eating out is the first thing cut, and hospitality postings follow the mood of the mortgage belt.",
      tiles: [
        { big: "-60%", small: "postings versus five years ago, the steepest fall of any industry on this site bar tech" },
        { big: "2021-22", small: "the reopening frenzy, when venues fought over anyone who could carry three plates" },
        { big: "#1", small: "the first line item households cut when rates rise: eating out. Your roster feels every RBA meeting" },
      ],
      punchline:
        "This industry hired anything with a pulse when borders reopened, then interest rates arrived and the bookings thinned. The jobs never vanish entirely because venues run on churn, but the boom-era desperation is over. Hospitality demand is a live feed of how the economy feels, which is why it appears on this site at all.",
      sources: "IVI series on this page; RBA cash rate history does the rest.",
    },
    quips: {
      1: "Venues quietly cut shifts before they cut menus.",
      2: "The cost-of-living pinch reached the brunch bill.",
      3: "Reopening frenzy cooled. The staff shortage headlines retired.",
      4: "Every cafe in the country had a sign in the window.",
      5: "Borders shut, industry flattened, nobody forgot it.",
    },
    pickerLine: "A live feed of the national mood.",
    bigPlayers: [
      { name: "Endeavour Group", note: "Dan Murphy's and 350-odd pubs, the biggest drinks-and-venues operator going" },
      { name: "Merivale", note: "Sydney's hospitality empire" },
      { name: "Australian Venue Co", note: "200+ pubs, private-equity assembled" },
      { name: "Accor Pacific", note: "the biggest hotel operator in the region" },
      { name: "Star Entertainment", note: "casinos, in the news for all the wrong reasons" },
      { name: "Crown Resorts", note: "Blackstone-owned casinos, same energy" },
      { name: "McDonald's Australia", note: "over 100,000 employees, the biggest youth employer in the country" },
      { name: "Compass Group", note: "the catering giant nobody has heard of feeding everyone" },
    ],
    hope: {
      blurb: "The proven paths in an industry built on churn.",
      items: [
        { tip: "Get the certificates nobody else bothers with", why: "RSA is table stakes; add barista, gaming (RSG) and food safety supervisor tickets and you are hireable at every venue type in the state", source: "State licensing requirements; venues legally need certified staff on every shift" },
        { tip: "Aim at clubs, pubs and hotels rather than cafes", why: "big venue groups run actual careers with penalty rates, supervisor tracks and management programs; cafes mostly run on goodwill", source: "Enterprise agreements at the large groups versus award-rate cafe work" },
        { tip: "Functions and events pay better than floors", why: "corporate catering and events run on skeleton casual crews and chronically need reliable people", source: "The employer table above skews to catering and venue groups, not cafes" },
      ],
    },
  },
  construction: {
    slug: "construction",
    name: "Construction",
    edition: "Construction edition",
    tagline: "An almanac of the Australian construction job market. A national housing target and nobody to swing the hammers.",
    occupationNote: "IVI group: Construction Trades Workers",
    seekClassification: "1206",
    searchTerms: ["construction", "builder", "carpenter", "trade", "tradie", "plumber", "site", "building"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: 1.2 million homes, allegedly",
      blurb: "Australia has a legislated national target of 1.2 million new homes by mid-2029 and a construction trades shortage on every official list. Those two facts do not currently cooperate.",
      tiles: [
        { big: "1.2m", small: "new homes targeted by mid-2029 under the National Housing Accord. The run rate is famously behind" },
        { big: "15+", small: "construction and trades occupations sitting on the national skills shortage list (Jobs and Skills Australia)" },
        { big: "121%", small: "current postings versus this trade's own twenty-year typical level. The demand is real even when the headlines are grim" },
      ],
      punchline:
        "Builders keep going broke, approvals keep disappointing, and yet every state's shortage list still begs for carpenters, sparkies and plumbers, because the housing target does not build itself. Construction is the rare industry where the government has legislated your future demand and then made it structurally impossible to meet.",
      sources: "National Housing Accord target; Jobs and Skills Australia occupation shortage list; IVI series on this page.",
    },
    quips: {
      1: "Builder insolvencies made headlines. The shortage list did not shrink.",
      2: "The housing target was restated. Loudly. Again.",
      3: "Fixed-price contracts met inflation and lost.",
      4: "HomeBuilder stimulus hangover: everyone booked out for years.",
      5: "The pipeline was already bigger than the workforce.",
    },
    pickerLine: "Legislated demand, missing workforce.",
    bigPlayers: [
      { name: "CPB Contractors", note: "CIMIC's delivery arm, on every second megaproject" },
      { name: "Multiplex", note: "towers and stadiums" },
      { name: "Lendlease", note: "development giant, restructuring era" },
      { name: "John Holland", note: "rail, road, tunnels, repeat" },
      { name: "Hutchinson Builders", note: "the biggest family-owned builder" },
      { name: "Meriton", note: "Harry Triguboff's apartment machine" },
      { name: "Mirvac", note: "developer-builder with the ASX listing" },
      { name: "BGC", note: "Western Australia's housing heavyweight" },
    ],
    hope: {
      blurb: "The shortage lists are real and the door is wider than most industries here.",
      items: [
        { tip: "An apprenticeship beats a degree queue", why: "trades apprentices earn while training and walk into an occupation that is on the national shortage list at the other end", source: "Jobs and Skills Australia shortage list; state government apprentice incentive schemes exist precisely because of it" },
        { tip: "Go where the megaprojects are", why: "tier-one contractors on committed transport and energy projects hire in cohorts and pay site allowances on top", source: "Published project pipelines and EBA rates at the tier-ones" },
        { tip: "Get the tickets: white card first, then plant", why: "every additional licence (EWP, forklift, crane dogging) is a direct pay bump and a wider set of sites that can legally employ you", source: "High-risk work licensing requirements; site labour-hire rate cards" },
      ],
    },
  },
  architecture: {
    slug: "architecture",
    name: "Architecture",
    edition: "Architecture edition",
    tagline: "An almanac of the Australian architecture job market. Seven years of training for a market that moves with building approvals.",
    occupationNote: "IVI group: Architects and Landscape Architects (3-month average)",
    seekClassification: "6263",
    seekExtraParams: "&keywords=architect",
    searchTerms: ["architect", "architecture", "landscape", "urban design", "drafting"],
    headcount: {
      value: 14000,
      label: "registered architects in Australia, one of the smallest professions on this site",
      source: "Architects Accreditation Council of Australia registers, roughly",
    },
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: you are downstream of approvals",
      blurb: "Architecture demand is a derivative of building approvals, and approvals have spent recent years near their weakest levels in a decade.",
      tiles: [
        { big: "-36%", small: "postings versus five years ago; the profession rides the property cycle with no seatbelt" },
        { big: "~14,000", small: "registered architects nationally. Small profession, small posting counts, big swings" },
        { big: "7 yrs", small: "of study and supervised practice to register, for a market that mood-swings with interest rates" },
      ],
      punchline:
        "Nobody commissions a building because an architect is available; they commission when the finance stacks up. That makes this one of the most rate-sensitive professions in the country: approvals fall, practices quietly shrink, and the postings line follows a year behind the RBA. The housing target should eventually pull it back up. Eventually is doing a lot of work.",
      sources: "ABS building approvals coverage; IVI series on this page.",
    },
    quips: {
      1: "Approvals stayed soft. So did the postings.",
      2: "Practices trimmed quietly. Nobody press-releases a hiring freeze.",
      3: "Rates went up, renders went unbuilt.",
      4: "The apartment pipeline thinned and everyone felt it.",
      5: "The boom-era backlog kept everyone fed. Then it ran out.",
    },
    pickerLine: "Downstream of building approvals, no seatbelt.",
    bigPlayers: [
      { name: "Cox Architecture", note: "stadiums and civic work, one of the biggest studios" },
      { name: "Hassell", note: "global design practice, Australian-born" },
      { name: "Woods Bagot", note: "same, with more towers" },
      { name: "Bates Smart", note: "170 years old and still billing" },
      { name: "Architectus", note: "big on transport and education work" },
      { name: "Populous", note: "if it is a stadium, they probably drew it" },
      { name: "GHDWoodhead", note: "the architecture arm of an engineering giant" },
      { name: "Warren and Mahoney", note: "trans-Tasman, growing here" },
    ],
    hope: {
      blurb: "Small profession, cyclical market, but the counter-cyclical corners are real.",
      items: [
        { tip: "Aim at government and institutional work", why: "health, education, defence and transport projects keep running when private residential stalls, and the practices holding those panels keep hiring", source: "State infrastructure pipelines are published; panel appointments are public" },
        { tip: "Registration is worth more in a downturn", why: "when practices shrink they keep the people who can sign off; finish your registration path early", source: "Architects registration acts; only registered architects can use the title and certify" },
        { tip: "Adjacent doors: landscape, urban design, client-side", why: "developers, councils and project managers hire architectural skills at better pay than many studios, and the training transfers", source: "Compare studio award rates with client-side salary bands in any recruiter guide" },
      ],
    },
  },
  actuarial: {
    slug: "actuarial",
    name: "Actuarial",
    edition: "Actuarial edition",
    tagline: "An almanac of the Australian actuarial job market. The people who priced your insurance can price their own scarcity.",
    occupationNote: "IVI group: Actuaries, Mathematicians and Statisticians (3-month average)",
    seekClassification: "1214",
    seekExtraParams: "&keywords=actuarial",
    searchTerms: ["actuary", "actuarial", "statistics", "statistician", "quant", "risk"],
    headcount: {
      value: 6000,
      label: "members of the Actuaries Institute, the smallest profession on this site by a mile",
      source: "Actuaries Institute membership, roughly",
    },
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: a tiny profession with brutal gates",
      blurb: "There are about six thousand actuaries in the country and the exams are famously punishing, which keeps supply scarce even when postings dip.",
      tiles: [
        { big: "~6,000", small: "Actuaries Institute members nationally. The entire profession fits in one conference centre" },
        { big: "~150", small: "postings a month in this occupation group. Small numbers, so every insurer's hiring freeze shows up instantly" },
        { big: "10 yrs", small: "a common time-to-Fellowship including exams. The moat is the exam schedule" },
      ],
      punchline:
        "Actuarial postings are down against the profession's own history, but the maths still favours the qualified: a decade of exams keeps the supply tiny, insurance is legally obliged to employ them, and climate risk keeps generating work faster than Fellows. The queue is short because the entry fee is a decade of Wednesday nights.",
      sources: "Actuaries Institute membership and Fellowship pathway; IVI series on this page.",
    },
    quips: {
      1: "Insurers froze hiring, then un-froze it quietly.",
      2: "Climate models made the day job more interesting than intended.",
      3: "Data science raided the graduate pool. The exams raided it back.",
      4: "Every insurer rediscovered pricing at the same time.",
      5: "Small profession, small postings, big salaries. Always was.",
    },
    pickerLine: "Six thousand people and a decade of exams.",
    bigPlayers: [
      { name: "QBE", note: "the global Australian insurer" },
      { name: "IAG", note: "NRMA and CGU's parent, the biggest general insurer" },
      { name: "Suncorp", note: "AAMI and friends" },
      { name: "TAL", note: "the life insurance giant" },
      { name: "Medibank", note: "health insurance, half a billion in profit" },
      { name: "Deloitte", note: "the biggest consulting actuarial bench" },
      { name: "Finity Consulting", note: "the local specialist everyone rotates through" },
      { name: "Taylor Fry", note: "the other one" },
    ],
    hope: {
      blurb: "The gates are the moat. Use them.",
      items: [
        { tip: "Pass exams faster than your cohort", why: "employers fund study leave and progression is largely exam-gated; each part passed is a literal pay rise in most programs", source: "Actuaries Institute pathway; graduate program study support policies are published" },
        { tip: "General insurance over life, right now", why: "climate and reinsurance pricing is where the work is growing; life insurance is consolidating", source: "APRA industry statistics on premium growth by class" },
        { tip: "The fallback is a feature", why: "the same skills price energy markets, superannuation and banking risk; an unfinished Fellowship still outqualifies most analysts", source: "Cross-hiring into banks and energy traders is visible in any actuarial recruiter's book" },
      ],
    },
  },
  accounting: {
    slug: "accounting",
    name: "Accounting",
    edition: "Accounting edition",
    tagline: "An almanac of the Australian accounting job market. Perpetually short of accountants, increasingly short of graduate desks.",
    occupationNote: "IVI group: Accountants (3-month average)",
    seekClassification: "1200",
    searchTerms: ["accountant", "accounting", "audit", "tax", "bookkeep", "cpa", "finance"],
    headcount: {
      value: 200000,
      label: "people employed as accountants nationally, give or take",
      source: "Jobs and Skills Australia occupation profile, roughly",
    },
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: shortage at the top, squeeze at the bottom",
      blurb: "Accountants sit permanently on the national shortage list while the entry-level work that used to train them gets automated and offshored.",
      tiles: [
        { big: "always", small: "how long accountants have been on the skilled occupation and shortage lists. It is a permanent fixture" },
        { big: "81%", small: "current postings versus the profession's own twenty-year typical level: below normal, nowhere near collapse" },
        { big: "2 in 3", small: "of the old graduate grunt work (reconciliation, basic audit fieldwork) now automated or offshored, per every big-firm strategy deck" },
      ],
      punchline:
        "The paradox: Australia imports accountants on skills visas while local graduates fight for shrinking first-year intakes, because the bottom rung their careers used to start on is now software or in Manila. The shortage is real at the qualified end. Getting to the qualified end is the game.",
      sources: "Skilled occupation and Jobs and Skills Australia shortage lists; IVI series on this page.",
    },
    quips: {
      1: "The big four cut, the mid-tier hired the fallout.",
      2: "A certain consulting scandal made the whole sector's year interesting.",
      3: "Offshoring quietly ate another rung of the ladder.",
      4: "EOFY happened. It always does.",
      5: "Shortage-listed then too. Some things are eternal.",
    },
    pickerLine: "Shortage-listed forever, ladder missing rungs.",
    bigPlayers: [
      { name: "PwC", note: "the scandal one, still enormous" },
      { name: "Deloitte", note: "biggest of the big four here" },
      { name: "KPMG", note: "audit, tax, consulting, repeat" },
      { name: "EY", note: "the fourth of the four" },
      { name: "BDO", note: "the mid-tier that hoovers up big-four refugees" },
      { name: "Grant Thornton", note: "same tier, same strategy" },
      { name: "Pitcher Partners", note: "the private-business specialist" },
      { name: "Xero", note: "not a firm; the software quietly eating the bottom of the profession" },
    ],
    hope: {
      blurb: "The qualified end is genuinely short. Aim there and pick doors with less queue.",
      items: [
        { tip: "The mid-tier and suburban firms are the open door", why: "big-four graduate intakes are lotteries; mid-tier and suburban practices chronically need juniors and give broader work faster", source: "Compare intake sizes on firm sites; CA ANZ training contract listings skew mid-tier" },
        { tip: "Start the CA or CPA immediately", why: "the shortage is for qualified accountants; every completed module separates you from the unqualified queue", source: "The skilled occupation list entry is for qualified accountants specifically" },
        { tip: "Industry beats practice for pay, practice beats industry for training", why: "two years in a firm then a jump into a company finance team is the standard arbitrage, and it still works", source: "Any accounting salary guide (Hays) shows the practice-to-industry pay step" },
      ],
    },
  },
  law: {
    slug: "law",
    name: "Law",
    edition: "Law edition",
    tagline: "An almanac of the Australian legal job market. The profession keeps growing and so does the queue to enter it.",
    occupationNote: "IVI group: Solicitors (3-month average)",
    seekClassification: "1216",
    searchTerms: ["law", "legal", "lawyer", "solicitor", "barrister", "paralegal", "clerk"],
    headcount: {
      value: 90000,
      label: "practising solicitors nationally, and the profession grows every single year",
      source: "Law Society National Profile of Solicitors, roughly",
    },
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: the profession that only grows",
      blurb: "Solicitor numbers have grown every year on record, postings are running above their long-term level, and yet the entry queue is still famous. Both things are true.",
      tiles: [
        { big: "+16%", small: "postings versus five years ago; one of the few genuinely growing lines on this site" },
        { big: "~90,000", small: "practising solicitors nationally, roughly double what it was two decades ago" },
        { big: "1 in 3?", small: "the endlessly quoted ratio of law graduates to law jobs. The precise number is folklore; the queue at clerkship season is not" },
      ],
      punchline:
        "Law is hiring. The catch has never been the market, it is the funnel: clerkships and graduate roles concentrate at a handful of firms everyone applies to at once, while suburban practices, government and in-house teams quietly take on juniors with a fraction of the applicants. The queue is a choice of door.",
      sources: "Law Society National Profile of Solicitors; IVI series on this page.",
    },
    quips: {
      1: "In-house teams kept absorbing firm refugees.",
      2: "Clerkship season broke application records. Again.",
      3: "Class actions and regulators kept everyone billing.",
      4: "The great resignation reached mid-level associates.",
      5: "Growing then too. This line mostly just grows.",
    },
    pickerLine: "Hiring, but the queue picks the door.",
    bigPlayers: [
      { name: "Herbert Smith Freehills", note: "top-tier, now merged with a US giant" },
      { name: "Allens", note: "top-tier, Linklaters alliance" },
      { name: "King & Wood Mallesons", note: "top-tier with the China network" },
      { name: "MinterEllison", note: "the biggest by headcount" },
      { name: "Clayton Utz", note: "top-tier, famously litigious" },
      { name: "Corrs Chambers Westgarth", note: "the independent one" },
      { name: "Gilbert + Tobin", note: "the corporate upstart that made it" },
      { name: "Maurice Blackburn", note: "the class-action machine" },
    ],
  },
  retail: {
    slug: "retail",
    name: "Retail",
    edition: "Retail edition",
    tagline: "An almanac of the Australian retail job market. The biggest employer of young Australians, run on rosters and thin margins.",
    occupationNote: "IVI group: Sales Assistants and Salespersons",
    seekClassification: "6043",
    searchTerms: ["retail", "sales assistant", "store", "shop", "supermarket", "checkout"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: margins, rosters and the RBA",
      blurb: "Retail postings track consumer spending almost perfectly, and consumer spending tracks interest rates. This line is the RBA minutes with a name badge.",
      tiles: [
        { big: "~10,000", small: "postings a month for sales assistants alone, one of the biggest volumes on this site even in a soft year" },
        { big: "98%", small: "of the occupation's twenty-year typical posting level right now: soft, not sick" },
        { big: "#1", small: "retail remains among the biggest first-employers of young Australians. Everyone starts somewhere, usually a register" },
      ],
      punchline:
        "Retail never really stops hiring because churn is built into the model; it just hires less enthusiastically when households are squeezed. The volume is always there. The hours, the penalty rates and the roster you actually get are the real economy.",
      sources: "IVI series on this page; ABS retail trade releases set the mood.",
    },
    quips: {
      1: "Spending soft, rosters softer.",
      2: "Self-checkout expanded. The headcount conversation followed.",
      3: "Christmas casual intakes shrank and everyone noticed.",
      4: "Online kept eating; stores kept consolidating.",
      5: "Same story, older registers.",
    },
    pickerLine: "The RBA minutes, with a name badge.",
    bigPlayers: [
      { name: "Woolworths Group", note: "the biggest private employer in the country" },
      { name: "Coles", note: "the other half of the duopoly" },
      { name: "Wesfarmers", note: "Bunnings, Kmart and Officeworks under one roof" },
      { name: "ALDI", note: "the third force, famously efficient" },
      { name: "Chemist Warehouse", note: "the pharmacy juggernaut" },
      { name: "JB Hi-Fi", note: "electronics, improbably excellent retailer" },
      { name: "Harvey Norman", note: "franchised furniture empire" },
      { name: "Amazon Australia", note: "the fulfilment centres keep coming" },
    ],
    hope: {
      blurb: "High churn cuts both ways: the ladder is real if you grab it.",
      items: [
        { tip: "The duopoly's management pipelines are genuinely open", why: "Woolworths and Coles promote store managers from the floor at scale, and a store manager runs a mid-size business", source: "Both publish their internal progression programs; store manager salaries are in every retail salary guide" },
        { tip: "Specialist retail pays better than general", why: "trade counters, electronics and pharmacy retail carry product-knowledge premiums over supermarket rates", source: "Award classifications and the salary spread across the employer table above" },
        { tip: "The skills transfer out", why: "rostering, stock control and KPI management are the same skills logistics and operations roles hire for at higher pay", source: "Retail-to-operations is one of the most common transitions in ABS job mobility data" },
      ],
    },
  },
  media: {
    slug: "media",
    name: "Media & Arts",
    edition: "Media and arts edition",
    tagline: "An almanac of the Australian media job market. Smaller than it was, hungrier than it looks.",
    occupationNote: "IVI group: Arts and Media Professionals",
    seekClassification: "6304",
    searchTerms: ["media", "journalist", "arts", "film", "tv", "radio", "producer", "writer", "creative"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: the industry that shrank into shape",
      blurb: "Two decades of newsroom cuts hollowed the middle out of this line, and what is left is growing again from a much smaller base.",
      tiles: [
        { big: "+15%", small: "postings versus five years ago, one of the few growing lines here, off a small base" },
        { big: "133%", small: "of the occupation's twenty-year typical level right now, which says more about how low typical became" },
        { big: "~1,200", small: "postings a month across all of arts and media. The whole industry hires less than nursing does in three days" },
      ],
      punchline:
        "The mastheads spent twenty years shrinking, then streaming, games and the content economy quietly rebuilt demand in different shapes: producers, editors, video, audio. The line is genuinely growing. It is just growing on top of an industry that already did its collapsing.",
      sources: "IVI series on this page; two decades of newsroom redundancy coverage, extensively self-reported.",
    },
    quips: {
      1: "Streaming budgets wobbled, production kept moving.",
      2: "Another masthead restructure; another podcast boom.",
      3: "The screen production incentives kept the lights on.",
      4: "Everyone became a content team. Someone had to staff them.",
      5: "The collapse was already old news then.",
    },
    pickerLine: "Already did its collapsing. Now it hires.",
    bigPlayers: [
      { name: "News Corp Australia", note: "the mastheads and much of the opinion" },
      { name: "Nine Entertainment", note: "TV, radio, the SMH and the Age" },
      { name: "Seven West Media", note: "the other commercial network" },
      { name: "ABC", note: "the national broadcaster and biggest newsroom" },
      { name: "Foxtel Group", note: "now DAZN-owned, still making sport TV" },
      { name: "oOh!media", note: "the billboards you did not notice noticing you" },
      { name: "ARN Media", note: "half the radio dial" },
      { name: "Are Media", note: "the magazine survivor" },
    ],
  },

  design: {
    slug: "design",
    name: "Design",
    edition: "Design edition",
    tagline: "An almanac of the Australian design job market. The tools got better at your job faster than the market got better at paying for it.",
    occupationNote: "IVI group: Graphic and Web Designers, and Illustrators (3-month average)",
    seekClassification: "6263",
    seekExtraParams: "&keywords=designer",
    searchTerms: ["design", "designer", "graphic", "ux", "ui", "illustrator", "creative", "visual"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: the template ate the brief",
      blurb: "Graphic design postings have halved in five years. Two guesses what happened, and both of them are software.",
      tiles: [
        { big: "-52%", small: "postings versus five years ago, matching tech for the steepest slide on this site" },
        { big: "67%", small: "of the occupation's own twenty-year typical level. Only tech sits lower" },
        { big: "2013", small: "the year a certain Australian template company launched. Correlation is not causation, but it is funny" },
      ],
      punchline:
        "Every small business that once paid a designer now drags a template around a browser, and the generative tools arrived before the market had finished digesting that. What survives is the top of the craft: brand systems, product design, UX with research behind it. The middle of the market went self-serve and it is not coming back.",
      sources: "IVI series on this page. The template company knows what it did.",
    },
    quips: {
      1: "Another year of briefs that started as templates.",
      2: "Generative tools arrived. Portfolios got quieter about process.",
      3: "In-house teams shrank to a Canva licence and hope.",
      4: "The rebrand boom papered over the freelance crunch.",
      5: "Rates were already falling when this chart began.",
    },
    pickerLine: "The template ate the brief.",
    bigPlayers: [
      { name: "Canva", note: "the elephant, the room, and the reason, all at once" },
      { name: "Adobe", note: "still selling the tools of the trade, now with a robot inside" },
      { name: "Pentagram", note: "the global prestige benchmark" },
      { name: "Re (M&C Saatchi)", note: "big-brand identity work out of Sydney" },
      { name: "For The People", note: "the local identity studio with the trophy shelf" },
      { name: "Designit", note: "global service design, Wipro-owned" },
      { name: "Frost*collective", note: "placemaking and identity" },
      { name: "Hulsbosch", note: "the airline and bank rebrand regulars" },
    ],
    hope: {
      blurb: "The middle went self-serve. The ends of the market still pay.",
      items: [
        { tip: "Move up the stack to product and UX", why: "software companies fund design roles from product budgets, not marketing budgets, and product budgets survive downturns better", source: "Compare design salary bands in tech versus agencies in any recruiter guide (Hays)" },
        { tip: "Sell outcomes, not files", why: "the clients still paying are buying brand systems and conversion, not logos; a case study with numbers beats a beautiful folio", source: "Work-sample hiring, same as marketing next door" },
        { tip: "Own the tools before they own you", why: "designers directing generative tools bill for taste and speed; designers competing with them bill for neither", source: "The postings that survive increasingly list the tools by name" },
      ],
    },
  },
  science: {
    slug: "science",
    name: "Science",
    edition: "Science edition",
    tagline: "An almanac of the Australian science job market. Years of study, grant cycles for pay, and the quiet hope of a permanent contract.",
    occupationNote: "IVI group: Science Professionals and Veterinarians, the classification bundles them",
    seekClassification: "1223",
    searchTerms: ["science", "scientist", "research", "lab", "chemistry", "biology", "physics", "phd"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: the grant cycle is the job market",
      blurb: "Most research employment hangs off government grants, so science postings track funding announcements more than economic cycles.",
      tiles: [
        { big: "~1,300", small: "science postings a month across the whole country, for every discipline combined" },
        { big: "95%", small: "of the field's twenty-year typical level. Steady, unspectacular, grant-shaped" },
        { big: "3-5 yrs", small: "the standard postdoc contract length. The permanent role is the industry's rarest species" },
      ],
      punchline:
        "A PhD takes longer than most economic cycles, and at the end of it the jobs run on soft money: fellowships, project grants and fixed-term contracts that expire with the funding round. Nobody who leaves the postdoc track for industry has failed out, they have simply read the chart.",
      sources: "IVI series on this page; ARC and NHMRC funding round coverage supplies the mood.",
    },
    quips: {
      1: "Another funding round, another cohort of CV updates.",
      2: "The medical research pipeline kept the lights on.",
      3: "Postdocs discovered data science pays double. Word spread.",
      4: "COVID money washed through and out again.",
      5: "Soft money then, soft money now.",
    },
    pickerLine: "The grant cycle is the job market.",
    bigPlayers: [
      { name: "CSIRO", note: "the national science agency and biggest single employer of scientists" },
      { name: "CSL", note: "biotech giant, roughly US$2.6b profit a year" },
      { name: "Cochlear", note: "hearing implants and a serious research bench" },
      { name: "ResMed", note: "sleep tech, big R&D spend" },
      { name: "ANSTO", note: "nuclear science, the reactor included" },
      { name: "Telix Pharmaceuticals", note: "the radiopharma success story" },
      { name: "ALS", note: "testing labs across every industry" },
      { name: "The Group of Eight universities", note: "collectively the largest research employer in the country" },
    ],
    hope: {
      blurb: "The permanent academic post is rare. The skills are not stuck there.",
      items: [
        { tip: "Industry R&D pays and it is growing", why: "biotech, radiopharma and medtech firms hire research scientists at salaries the postdoc track cannot match", source: "Compare the employer table above with any university enterprise agreement" },
        { tip: "Regulatory and quality roles are the quiet exit", why: "TGA submissions, GMP and clinical trials work chronically needs science graduates and offers actual permanency", source: "Pharma and medtech quality roles run continuously on the boards; academic postings do not" },
        { tip: "Learn the data stack before you leave the lab", why: "a scientist with statistics and code is employable in three industries; one without is competing for the same postdoc as everyone else", source: "The single most common career transition out of research, visible in any cohort" },
      ],
    },
  },
  environment: {
    slug: "environment",
    name: "Environmental Science",
    edition: "Environmental science edition",
    tagline: "An almanac of the Australian environmental job market. Every project needs an approval and every approval needs one of you.",
    occupationNote: "IVI group: Environmental Scientists (3-month average)",
    seekClassification: "1223",
    seekExtraParams: "&keywords=environmental",
    searchTerms: ["environment", "environmental", "ecology", "sustainability", "climate", "conservation"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: approvals are mandatory, and so are you",
      blurb: "Environmental assessment is a legal prerequisite for mines, transmission lines, wind farms and subdivisions alike, which gives this field demand from both sides of every argument.",
      tiles: [
        { big: "108%", small: "of the field's twenty-year typical level and rising. Legislated demand, again" },
        { big: "both", small: "sides of the energy transition hire you: the renewables need approvals and so do the mines" },
        { big: "EPBC", small: "the federal environment act; every reform round adds assessment work, whichever way it lands" },
      ],
      punchline:
        "Very few professions get paid by the mine and the wind farm in the same week. Environmental scientists do, because assessment is compulsory and the consultancies doing it are permanently recruiting. The work is field seasons, impact statements and a great deal of driving. The demand curve answers to parliament, not to fashion.",
      sources: "EPBC Act assessment requirements; IVI series on this page.",
    },
    quips: {
      1: "Transmission projects queued for ecologists. Literally queued.",
      2: "The offsets market made habitat surveys a growth industry.",
      3: "Renewables and mining bid for the same graduates.",
      4: "Every flood year multiplies the water studies.",
      5: "The consultancies were short-staffed then as well.",
    },
    pickerLine: "Paid by the mine and the wind farm alike.",
    bigPlayers: [
      { name: "GHD", note: "the environmental consulting heavyweight" },
      { name: "Aurecon", note: "advisory across the whole transition" },
      { name: "AECOM", note: "global, big impact-assessment bench" },
      { name: "Jacobs", note: "same tier, same panels" },
      { name: "ERM", note: "the pure-play environmental consultancy" },
      { name: "Umwelt", note: "the local specialist" },
      { name: "EMM Consulting", note: "growing fast on approvals work" },
      { name: "State environment departments", note: "the regulators, hiring on the other side of the table" },
    ],
  },
  psychology: {
    slug: "psychology",
    name: "Psychology",
    edition: "Psychology edition",
    tagline: "An almanac of the Australian psychology job market. Demand outran the profession years ago and never looked back.",
    occupationNote: "IVI group: Psychologists (3-month average)",
    seekClassification: "1211",
    seekExtraParams: "&keywords=psychologist",
    searchTerms: ["psychology", "psychologist", "mental health", "counselling", "therapy", "clinical"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: the waiting list is the evidence",
      blurb: "Postings sit at two and a half times the profession's own historical norm, and anyone who has tried to book a psychologist knows exactly why.",
      tiles: [
        { big: "253%", small: "of the occupation's twenty-year typical posting level. The mental health demand curve, in one number" },
        { big: "months", small: "the typical wait for a psychologist in most of the country; closed books are routine" },
        { big: "NDIS + Medicare", small: "two federal funding streams pouring demand into a profession whose training pipeline is deliberately narrow" },
      ],
      punchline:
        "Mental health went from unmentionable to a Medicare item within a generation, and the training bottleneck never widened to match: registration takes six years minimum and the masters places are scarce. The result is closed books, long waits and a jobs line that has been climbing for a decade. Grim cause, secure career.",
      sources: "Registration pathway per AHPRA and the Psychology Board; IVI series on this page.",
    },
    quips: {
      1: "Books stayed closed. Waiting lists stayed long.",
      2: "Telehealth made the shortage national instead of regional.",
      3: "The NDIS reassessment wave hit the same workforce.",
      4: "Pandemic demand arrived and simply never left.",
      5: "The bottleneck was already the masters intake.",
    },
    pickerLine: "The waiting list is the evidence.",
    bigPlayers: [
      { name: "Ramsay Health Care", note: "private hospitals including the psych units" },
      { name: "Healthscope", note: "the other private hospital group" },
      { name: "Medibank", note: "insurer moving into care delivery" },
      { name: "Sonder", note: "workplace wellbeing at scale" },
      { name: "TELUS Health", note: "the EAP consolidator" },
      { name: "APM", note: "employment services, a huge psych employer" },
      { name: "Headspace centres", note: "youth mental health, everywhere" },
      { name: "State health departments", note: "the biggest employer of the lot" },
    ],
  },
  socialwork: {
    slug: "socialwork",
    name: "Social Work",
    edition: "Social work edition",
    tagline: "An almanac of the Australian social work job market. Society outsources its hardest problems here and pays accordingly, which is to say badly.",
    occupationNote: "IVI group: Social Workers (3-month average)",
    seekClassification: "6163",
    searchTerms: ["social work", "social worker", "community", "case", "welfare", "youth work", "ndis"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: the safety net is a workforce",
      blurb: "Child protection, the NDIS, aged care and housing crises all land on the same profession, and the postings show it: nearly two and a half times the historical norm.",
      tiles: [
        { big: "243%", small: "of the occupation's own twenty-year typical posting level" },
        { big: "1,178", small: "postings a month, more than architecture, actuarial, design and economics combined" },
        { big: "4", small: "simultaneous national crises routed through this workforce: child protection, disability, aged care, housing" },
      ],
      punchline:
        "Every royal commission ends the same way: recommendations, funding, and a hiring wave for social workers. The demand is structural because the problems are, and the burnout-driven churn adds a second engine. The jobs are everywhere. The pay conversation is overdue and everyone in the sector knows it.",
      sources: "Royal commission implementation coverage; IVI series on this page.",
    },
    quips: {
      1: "Child protection caseloads made the news again.",
      2: "NDIS reforms redrew half the sector's job descriptions.",
      3: "The housing crisis became a case-management crisis.",
      4: "Aged care royal commission money reached the front line.",
      5: "Understaffed then, understaffed now, understaffed always.",
    },
    pickerLine: "The safety net is a workforce.",
    bigPlayers: [
      { name: "Uniting", note: "one of the biggest community services providers" },
      { name: "Anglicare", note: "the federated giant" },
      { name: "Mission Australia", note: "housing and employment services at scale" },
      { name: "The Salvation Army", note: "more social services than brass bands these days" },
      { name: "Life Without Barriers", note: "disability and out-of-home care" },
      { name: "Aruma", note: "disability services, formerly House with No Steps" },
      { name: "Berry Street", note: "the child and family specialist" },
      { name: "State child protection departments", note: "perpetually recruiting, for reasons the caseloads explain" },
    ],
  },
  veterinary: {
    slug: "veterinary",
    name: "Veterinary",
    edition: "Veterinary edition",
    tagline: "An almanac of the Australian veterinary job market. The hottest reading on this entire site belongs to the people who put their arm in a cow.",
    occupationNote: "IVI group: Veterinarians (3-month average)",
    seekClassification: "6205",
    seekExtraParams: "&keywords=veterinary",
    searchTerms: ["vet", "veterinary", "veterinarian", "animal", "pet"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: everyone got a pandemic puppy",
      blurb: "Veterinary postings run at more than eight times their twenty-year norm, the highest reading of any occupation on this site, and the profession is too small and too burnt out to meet it.",
      tiles: [
        { big: "838%", small: "of the occupation's own twenty-year typical posting level. Not a typo. The highest on this site" },
        { big: "69%", small: "of Australian households own a pet, among the highest rates in the world (Animal Medicines Australia surveys)" },
        { big: "5 yrs", small: "of veterinary school for a career with famous burnout and rural clinics that cannot hire at any price" },
      ],
      punchline:
        "Pet ownership boomed, the pandemic supercharged it, and spending per animal climbed with it. Meanwhile vet school intakes stayed small, rural practice got harder to staff, and attrition ran hot. The result is the steepest demand curve this site has measured. If you can handle the emotional load, the market wants you more than it wants anyone else on this list.",
      sources: "Animal Medicines Australia pet ownership surveys; IVI series on this page.",
    },
    quips: {
      1: "Rural clinics offered signing bonuses. Still empty.",
      2: "Pet insurance normalised the four-figure bill.",
      3: "The pandemic puppies hit middle age and vet waiting rooms.",
      4: "Corporate roll-ups bought every clinic in sight.",
      5: "Already short-staffed before the puppy boom began.",
    },
    pickerLine: "The hottest line on the site. It bites.",
    bigPlayers: [
      { name: "Greencross (Petbarn)", note: "the biggest clinic network, TPG-owned" },
      { name: "VetPartners", note: "the other consolidator" },
      { name: "Apiam Animal Health", note: "the listed rural and regional network" },
      { name: "SASH", note: "specialist and emergency hospitals" },
      { name: "IDEXX", note: "the diagnostics company every clinic pays" },
      { name: "Zoetis", note: "animal health pharma giant" },
      { name: "RSPCA", note: "shelters and clinics nationwide" },
      { name: "CSIRO ACDP", note: "the high-containment animal disease lab in Geelong" },
    ],
  },
  libraries: {
    slug: "libraries",
    name: "Libraries & Archives",
    edition: "Libraries edition",
    tagline: "An almanac of the Australian library job market. A small, beloved profession that everyone assumes is dying and never quite does.",
    occupationNote: "IVI group: Librarians (3-month average); the archivists and curators next door are counted separately and even smaller",
    seekClassification: "",
    seekExtraParams: "keywords=librarian",
    searchTerms: ["library", "librarian", "archives", "archivist", "curator", "museum", "information management"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: reports of death, exaggerated",
      blurb: "Librarian postings sit slightly above their twenty-year norm, which is a quiet rebuke to two decades of think pieces.",
      tiles: [
        { big: "87", small: "postings a month nationally. You could invite every hiring manager to one dinner" },
        { big: "114%", small: "of the profession's own twenty-year typical level. Small, stable, stubbornly alive" },
        { big: "1,400+", small: "public library branches nationally, plus every school, university, court and hospital that legally or practically needs one" },
      ],
      punchline:
        "The internet was supposed to end this profession and instead turned libraries into the last free indoor public space in the country, with a side business in digital literacy, local history and being the only place left that helps you with a form. The job market is tiny but it refuses to shrink, which is more than several louder industries on this site can say.",
      sources: "National and State Libraries Australasia statistics; IVI series on this page.",
    },
    quips: {
      1: "Another council discovered the library is its most visited building.",
      2: "Records management quietly absorbed half the graduates.",
      3: "Digitisation grants funded the interesting jobs.",
      4: "The school library cuts met parental resistance. Good.",
      5: "Declared dying then too. Still here.",
    },
    pickerLine: "Declared dying for decades. Still here.",
    bigPlayers: [
      { name: "National Library of Australia", note: "Trove and the deep archive" },
      { name: "State libraries", note: "the six big reading rooms and their collections" },
      { name: "City of Sydney and the big councils", note: "public branch networks are council-run" },
      { name: "University libraries", note: "the Group of Eight run serious research collections" },
      { name: "National Archives", note: "the recordkeepers of government" },
      { name: "State records offices", note: "same job, state edition" },
      { name: "TAFE and school libraries", note: "the biggest employer of the profession by headcount" },
      { name: "Court and law firm libraries", note: "small, specialised, surprisingly well paid" },
    ],
  },
  economics: {
    slug: "economics",
    name: "Economics",
    edition: "Economics edition",
    tagline: "An almanac of the Australian economics job market. The people who study scarcity, experiencing it.",
    occupationNote: "IVI group: Economists (3-month average)",
    seekClassification: "1203",
    seekExtraParams: "&keywords=economist",
    searchTerms: ["economics", "economist", "policy", "treasury", "econometrics"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: a profession the size of a school",
      blurb: "Thirty-two postings a month nationally. The economists have finally found a market thin enough to study from the inside.",
      tiles: [
        { big: "32", small: "economist postings a month across the entire country. The Seek slice this week held six" },
        { big: "80%", small: "of the occupation's own twenty-year typical level, for whatever a percentage of thirty-two is worth" },
        { big: "3", small: "employers that matter: Treasury, the RBA and the consultancies that argue with both" },
      ],
      punchline:
        "Most economics graduates never hold the job title. They become analysts, policy officers, bankers and consultants, and the thirty-two monthly postings are the tip of a much larger iceberg of econ-shaped work. The title is scarce. The skill set is not, which any economist could have told you is where the value went.",
      sources: "IVI series on this page; the APS and RBA graduate programs are where the actual intake happens.",
    },
    quips: {
      1: "The RBA graduate intake remained the whole entry market.",
      2: "Productivity discourse boomed. Productivity did not.",
      3: "Every bank hired one more chief economist for the podcast.",
      4: "Treasury modelling cycles set the calendar, as ever.",
      5: "Thin market then. Thin market forever.",
    },
    pickerLine: "The people who study scarcity, experiencing it.",
    bigPlayers: [
      { name: "Reserve Bank of Australia", note: "the graduate program that matters" },
      { name: "The Treasury", note: "the other one" },
      { name: "Productivity Commission", note: "the national referee" },
      { name: "Deloitte Access Economics", note: "the biggest private shop" },
      { name: "The e61 Institute", note: "the new research institute doing the interesting work" },
      { name: "Grattan Institute", note: "the think tank your parents quote" },
      { name: "ACCC", note: "competition economics with subpoena power" },
      { name: "The big four banks", note: "a chief economist each, plus the teams behind the forecasts" },
    ],
    hope: {
      blurb: "The job title is rare. The degree is not stuck with it.",
      items: [
        { tip: "Apply to the APS and RBA graduate programs first", why: "the public service runs the largest structured intake of economics graduates in the country, every single year", source: "APS and RBA graduate program intakes are published annually" },
        { tip: "Take the analyst title without grieving", why: "banking, consulting and data roles buy the same skills at market rates and the door back to policy stays open", source: "Career paths of any Treasury alumni cohort demonstrate the two-way flow" },
        { tip: "Econometrics is the employable half", why: "causal inference and forecasting skills clear the market instantly; essay-based policy skills queue", source: "Posting requirements in the thin market above overwhelmingly list quantitative tooling" },
      ],
    },
  },
  justice: {
    slug: "justice",
    name: "Criminology & Justice",
    edition: "Criminology and justice edition",
    tagline: "An almanac of the Australian justice job market. The degree says criminology, the payslip usually says case worker.",
    occupationNote: "IVI group: Welfare Support Workers, the occupation most criminology graduates actually land in; sworn police roles barely advertise (16 postings a month) because forces recruit through campaigns instead",
    seekClassification: "6163",
    seekExtraParams: "&keywords=case+worker",
    searchTerms: ["criminology", "justice", "police", "corrections", "youth justice", "case worker", "legal aid"],
    hook: {
      kicker: "Exhibit 0",
      title: "Why the line moves: the system always needs staff",
      blurb: "Courts, corrections, youth justice and community supervision all run on the same frontline workforce, and its postings sit at nearly two and a half times the historical norm.",
      tiles: [
        { big: "238%", small: "of the occupation's twenty-year typical posting level for welfare support workers, the sector's actual entry job" },
        { big: "16", small: "sworn police postings a month on the job boards. Forces recruit through campaigns, not Seek, so the boards lie about policing" },
        { big: "43,000+", small: "people in Australian prisons on any given day, each requiring supervision, programs and case management (ABS)" },
      ],
      punchline:
        "Criminology intakes boomed on true-crime energy, and the graduates discover the real market is case work, corrections, courts support and youth justice: heavy, necessary work that never stops hiring because the justice system never stops running. The police academy remains its own separate door, opened by campaign, fitness test and patience.",
      sources: "ABS prisoner statistics; state police recruitment campaigns; IVI series on this page.",
    },
    quips: {
      1: "Youth justice reforms meant another hiring round.",
      2: "Every state announced police recruitment drives with billboards.",
      3: "Community corrections absorbed the caseload politics created.",
      4: "Court backlogs became a staffing announcement.",
      5: "The system was short-staffed then. It is the natural state.",
    },
    pickerLine: "The degree says criminology, the payslip says case worker.",
    bigPlayers: [
      { name: "State corrections departments", note: "the biggest employers in the sector, always recruiting" },
      { name: "State police forces", note: "recruiting by campaign, not job board" },
      { name: "Serco", note: "runs several prisons, controversially and profitably" },
      { name: "G4S", note: "same business, same reviews" },
      { name: "Legal Aid commissions", note: "the front door of the courts for most people" },
      { name: "Youth Justice agencies", note: "the reform-round regulars" },
      { name: "Australian Federal Police", note: "the federal door, campaign-recruited too" },
      { name: "Community legal centres", note: "underfunded, essential, hiring anyway" },
    ],
  },
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
  topEmployers: TopEmployer[];
  competition: { applicantsPerPosting: number; workersPerPosting: number } | null;
};

export type TopEmployer = {
  rank: number;
  employer: string;
  postings: number;
  sampled: number;
};

export async function getTopEmployers(slug: IndustrySlug): Promise<TopEmployer[]> {
  if (!(await tableExists("recession_top_employers"))) return [];
  return (await all(
    `SELECT rank, employer, postings, sampled FROM recession_top_employers
     WHERE industry = ? ORDER BY rank ASC`,
    [slug],
  )) as TopEmployer[];
}

// The reading judges each industry against its own twenty-year typical level
// (median of the whole series) with a momentum check, rather than the single
// all-time peak, which punished anything that ever had a boom.
//   Hiring: well above its own normal, or above normal and climbing
//   Cooked: deeply below its own normal
//   Ehhh:   everything in between
export function indexLabelFor(level: number, momentumPct: number): string {
  if (level >= 1.25 || (level >= 1.0 && momentumPct >= 15)) return "Hiring";
  if (level <= 0.7) return "Cooked";
  return "Ehhh";
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
  const momentumPct = Math.round(((latest.value - fiveYearsAgo) / fiveYearsAgo) * 100);
  const sorted = [...values].sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length / 2)]; // twenty-year median
  const level = latest.value / typical;
  const indexLabel = indexLabelFor(level, momentumPct);
  return { latest, peak, vsPeakPct, hiring: indexLabel === "Hiring", indexLabel };
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

  // competition maths: this profession's workers per live posting, calibrated
  // against the national average of 184 applications per ad (SEEK, Apr 2025)
  // via the same workers-per-posting ratio for the whole labour market
  let competition: IndustryData["competition"] = null;
  const pool = config.workforce ?? config.headcount?.value;
  if (pool) {
    try {
      const ictRaw = await fs.readFile(path.join(process.cwd(), "data", "recession", "ivi-ict.json"), "utf8");
      const allOcc = JSON.parse(ictRaw).series.allOccupations.values as number[];
      const nationalPostings = allOcc[allOcc.length - 1];
      const EMPLOYED_NATIONAL = 14_600_000; // ABS employed persons, roughly
      const nationalRatio = EMPLOYED_NATIONAL / nationalPostings;
      const workersPerPosting = pool / latest.value;
      competition = {
        workersPerPosting: Math.round(workersPerPosting),
        applicantsPerPosting: Math.max(25, Math.min(1000, Math.round((184 * workersPerPosting) / nationalRatio))),
      };
    } catch {
      competition = null;
    }
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
    topEmployers: await getTopEmployers(slug),
    competition,
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
