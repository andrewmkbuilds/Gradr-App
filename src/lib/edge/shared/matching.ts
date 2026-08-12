// Deterministic resume <-> job description matching.
// No AI involved: every number here is computed from real text overlap.

/** Common skills/tech/tool lexicon used for keyword extraction. */
const SKILL_LEXICON: string[] = [
  // languages
  "javascript","typescript","python","java","c++","c#","go","golang","rust","ruby","php","swift","kotlin","scala","r","matlab","perl","dart","elixir","sql","bash","shell",
  // web / frontend
  "react","react native","next.js","nextjs","vue","nuxt","angular","svelte","redux","tailwind","css","html","sass","webpack","vite","jquery","graphql","rest api","accessibility","responsive design",
  // backend / infra
  "node.js","nodejs","express","django","flask","fastapi","spring","spring boot","rails",".net","laravel","microservices","grpc","kafka","rabbitmq","redis","nginx",
  // data
  "postgresql","postgres","mysql","mongodb","dynamodb","snowflake","bigquery","redshift","elasticsearch","etl","data warehouse","spark","hadoop","airflow","dbt","pandas","numpy","tableau","power bi","looker","excel",
  // ml / ai
  "machine learning","deep learning","nlp","computer vision","tensorflow","pytorch","scikit-learn","llm","generative ai","data science","statistics","a/b testing",
  // cloud / devops
  "aws","azure","gcp","google cloud","docker","kubernetes","terraform","ansible","jenkins","ci/cd","github actions","gitlab","circleci","linux","monitoring","datadog","prometheus","serverless","lambda",
  // product / business
  "product management","agile","scrum","kanban","jira","confluence","roadmap","stakeholder management","user research","wireframing","figma","sketch","prototyping","ux","ui design","design systems",
  "seo","sem","google analytics","content marketing","email marketing","hubspot","salesforce","crm","copywriting","social media","paid media","brand strategy",
  "financial modeling","forecasting","budgeting","accounting","quickbooks","gaap","auditing","valuation","risk management",
  "project management","pmp","six sigma","lean","supply chain","logistics","procurement","operations",
  "customer success","account management","sales","negotiation","cold outreach","pipeline management",
  "recruiting","onboarding","people operations","payroll","compensation",
  // soft / general
  "leadership","mentoring","communication","collaboration","problem solving","cross-functional","presentation","documentation","team management","strategic planning",
];

/** Words that are never useful as differentiating keywords. */
const STOPWORDS = new Set(
  ("a an the and or but if then else for to of in on at by with from as is are was were be been being this that these those " +
   "you your we our they their it its will would can could should may might must have has had do does did not no yes " +
   "job role work working team teams company companies experience experiences year years plus etc other others including include " +
   "us new our who what when where how all any more most about into over under out up down who's please apply applicant candidates " +
   "candidate opportunity opportunities benefits salary").split(/\s+/),
);

function normalize(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Escape a lexicon entry for use inside a RegExp. */
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(haystack: string, term: string): boolean {
  const t = esc(term);
  // word-ish boundaries that tolerate +, #, . in tech names
  return new RegExp(`(^|[^a-z0-9+#.])${t}([^a-z0-9+#.]|$)`, "i").test(haystack);
}

/** Skills from the lexicon that appear in the given text. */
export function extractSkills(text: string): string[] {
  const norm = normalize(text);
  const found = SKILL_LEXICON.filter((s) => containsTerm(norm, s));
  // drop terms fully contained in a longer matched term (e.g. "react" vs "react native")
  return found.filter((s) => !found.some((o) => o !== s && o.includes(s)));
}

/** Meaningful single-word tokens for the general keyword-overlap signal. */
function contentTokens(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((w) => w.length > 2 && w.length < 24 && !STOPWORDS.has(w) && !/^\d+$/.test(w)),
  );
}

export interface MatchBreakdown {
  /** 0-100, deterministic. */
  score: number;
  skillOverlapPct: number;
  keywordOverlapPct: number;
  titleAlignmentPct: number;
  matchedSkills: string[];
  missingSkills: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
}

export function scoreJobAgainstResume(params: {
  resumeText: string;
  jobTitle: string;
  jobDescription: string;
  targetRole?: string | null;
}): MatchBreakdown {
  const { resumeText, jobTitle, jobDescription, targetRole } = params;
  const resumeNorm = normalize(resumeText);

  const jobSkills = extractSkills(`${jobTitle} ${jobDescription}`);
  const matchedSkills = jobSkills.filter((s) => containsTerm(resumeNorm, s));
  const missingSkills = jobSkills.filter((s) => !matchedSkills.includes(s));
  const skillOverlapPct = jobSkills.length
    ? Math.round((matchedSkills.length / jobSkills.length) * 100)
    : 0;

  const jdTokens = contentTokens(jobDescription);
  const resumeTokens = contentTokens(resumeText);
  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];
  for (const t of jdTokens) (resumeTokens.has(t) ? matchedKeywords : missingKeywords).push(t);
  const keywordOverlapPct = jdTokens.size
    ? Math.round((matchedKeywords.length / jdTokens.size) * 100)
    : 0;

  // Title alignment: how much of the job title appears in the resume / stated target role.
  const titleWords = [...contentTokens(jobTitle)];
  const compare = `${resumeNorm} ${normalize(targetRole || "")}`;
  const titleHits = titleWords.filter((w) => compare.includes(w)).length;
  const titleAlignmentPct = titleWords.length
    ? Math.round((titleHits / titleWords.length) * 100)
    : 0;

  // Weighted blend. Skills matter most, then title fit, then raw keyword overlap.
  const score = Math.max(
    0,
    Math.min(100, Math.round(skillOverlapPct * 0.5 + titleAlignmentPct * 0.3 + keywordOverlapPct * 0.2)),
  );

  return {
    score,
    skillOverlapPct,
    keywordOverlapPct,
    titleAlignmentPct,
    matchedSkills,
    missingSkills,
    matchedKeywords: matchedKeywords.slice(0, 40),
    missingKeywords: missingKeywords
      .filter((w) => w.length > 3)
      .slice(0, 40),
  };
}
