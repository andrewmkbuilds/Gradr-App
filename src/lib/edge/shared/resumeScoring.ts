// Deterministic resume scoring. Every number below is computed from the actual
// resume text — no model involvement. The LLM is only used for prose advice.

import { extractSkills, scoreJobAgainstResume } from "./matching";

const ACTION_VERBS = [
  "led","built","launched","shipped","designed","developed","implemented","created","drove","owned","managed",
  "increased","reduced","improved","optimized","automated","scaled","delivered","migrated","architected",
  "negotiated","mentored","coordinated","streamlined","generated","saved","grew","accelerated","refactored",
  "established","introduced","spearheaded","analyzed","forecasted","resolved","expanded","standardized",
];

const WEAK_PHRASES = [
  "responsible for","duties included","worked on","helped with","assisted with","tasked with",
  "team player","hard worker","go-getter","detail oriented","detail-oriented","results driven","results-driven",
  "think outside the box","self-starter","synergy",
];

const SECTION_PATTERNS: Record<string, RegExp> = {
  experience: /\b(work experience|professional experience|experience|employment)\b/i,
  education: /\b(education|academic background|qualifications)\b/i,
  skills: /\b(skills|technical skills|core competencies|tools)\b/i,
  contact: /(@[a-z0-9.-]+\.[a-z]{2,}|linkedin\.com\/in\/|github\.com\/|\+?\d[\d\s().-]{7,}\d)/i,
  summary: /\b(summary|profile|objective|about me)\b/i,
  projects: /\b(projects|portfolio|selected work)\b/i,
};

const DATE_RANGE =
  /((19|20)\d{2}\s*[-–—to]+\s*((19|20)\d{2}|present|current))|((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(19|20)\d{2})/gi;

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function countMatches(text: string, re: RegExp) {
  return (text.match(re) || []).length;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length > 2);
}

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export interface Evidence {
  label: string;
  detail: string;
  ok: boolean;
}

export interface ResumeScores {
  ats_score: number;
  keyword_match: number;
  formatting_score: number;
  impact_score: number;
  readability_score: number;
  metrics: {
    wordCount: number;
    bulletCount: number;
    quantifiedBullets: number;
    actionVerbCount: number;
    weakPhrases: string[];
    sectionsFound: string[];
    sectionsMissing: string[];
    datedRoles: number;
    avgSentenceWords: number;
    fleschReadingEase: number;
    detectedSkills: string[];
    matchedKeywords: string[];
    missingKeywords: string[];
    missingSkills: string[];
  };
  evidence: Evidence[];
}

export function scoreResume(params: {
  resumeText: string;
  jobDescription?: string | null;
  jobTitle?: string | null;
  targetRole?: string | null;
}): ResumeScores {
  const text = params.resumeText || "";
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // ---- Structure / formatting -------------------------------------------
  const sectionsFound: string[] = [];
  const sectionsMissing: string[] = [];
  for (const [name, re] of Object.entries(SECTION_PATTERNS)) {
    (re.test(text) ? sectionsFound : sectionsMissing).push(name);
  }

  const bulletCount = countMatches(text, /(^|\s)[•▪·‣\-–*]\s+\S/g);
  const datedRoles = countMatches(text, DATE_RANGE);
  const hasTables = /\t{2,}|\|.*\|.*\|/.test(text);

  let formatting = 40;
  formatting += Math.min(30, sectionsFound.length * 6);
  formatting += bulletCount >= 8 ? 15 : bulletCount >= 3 ? 8 : 0;
  formatting += datedRoles >= 2 ? 10 : datedRoles === 1 ? 5 : 0;
  if (wordCount >= 300 && wordCount <= 900) formatting += 5;
  if (wordCount < 200) formatting -= 15;
  if (wordCount > 1400) formatting -= 10;
  if (hasTables) formatting -= 10;
  const formatting_score = clamp(formatting);

  // ---- Impact ------------------------------------------------------------
  const bulletLines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => /^[•▪·‣\-–*]/.test(l) || l.split(/\s+/).length > 4);
  const quantifiedBullets = bulletLines.filter((l) =>
    /(\d+(\.\d+)?\s*%|\$\s?\d|\b\d{2,}\b|\b\d+(k|m|bn)\b|\b\d+x\b)/i.test(l),
  ).length;
  const actionVerbCount = ACTION_VERBS.reduce(
    (n, v) => n + countMatches(lower, new RegExp(`\\b${v}\\b`, "g")),
    0,
  );
  const weakPhrases = WEAK_PHRASES.filter((p) => lower.includes(p));

  const quantRatio = bulletLines.length ? quantifiedBullets / bulletLines.length : 0;
  let impact = 25;
  impact += quantRatio * 45;
  impact += Math.min(25, actionVerbCount * 2.5);
  impact -= weakPhrases.length * 6;
  const impact_score = clamp(impact);

  // ---- Readability (Flesch reading ease, mapped) --------------------------
  const sents = sentences(text);
  const sentenceCount = Math.max(1, sents.length);
  const syllableCount = words.reduce((n, w) => n + syllables(w), 0);
  const avgSentenceWords = wordCount / sentenceCount;
  const fleschReadingEase =
    Math.round(
      (206.835 - 1.015 * avgSentenceWords - 84.6 * (syllableCount / Math.max(1, wordCount))) * 10,
    ) / 10;
  // Resumes read best in the 40-70 band (professional but not dense).
  const readability_score = clamp(
    fleschReadingEase >= 40 && fleschReadingEase <= 75
      ? 90
      : fleschReadingEase > 75
        ? 90 - (fleschReadingEase - 75) * 0.8
        : 90 - (40 - fleschReadingEase) * 1.2,
  );

  // ---- Keyword match ------------------------------------------------------
  const detectedSkills = extractSkills(text);
  let keyword_match: number;
  let matchedKeywords: string[] = [];
  let missingKeywords: string[] = [];
  let missingSkills: string[] = [];

  if (params.jobDescription && params.jobDescription.trim().length > 40) {
    const m = scoreJobAgainstResume({
      resumeText: text,
      jobTitle: params.jobTitle || params.targetRole || "",
      jobDescription: params.jobDescription,
      targetRole: params.targetRole,
    });
    keyword_match = clamp(m.skillOverlapPct * 0.65 + m.keywordOverlapPct * 0.35);
    matchedKeywords = m.matchedSkills;
    missingKeywords = m.missingKeywords.slice(0, 15);
    missingSkills = m.missingSkills;
  } else {
    // No JD: score breadth of recognised, ATS-parseable skill terms.
    keyword_match = clamp(Math.min(100, detectedSkills.length * 6));
    matchedKeywords = detectedSkills.slice(0, 30);
  }

  // ---- Composite ATS score ------------------------------------------------
  const ats_score = clamp(
    formatting_score * 0.3 + keyword_match * 0.3 + impact_score * 0.25 + readability_score * 0.15,
  );

  const evidence: Evidence[] = [
    {
      label: "Standard sections",
      detail: sectionsMissing.length
        ? `Missing: ${sectionsMissing.join(", ")}`
        : "All expected sections detected",
      ok: sectionsMissing.length === 0,
    },
    {
      label: "Quantified achievements",
      detail: `${quantifiedBullets} of ${bulletLines.length || 0} bullets contain a number`,
      ok: quantRatio >= 0.4,
    },
    {
      label: "Action verbs",
      detail: `${actionVerbCount} strong verbs detected`,
      ok: actionVerbCount >= 8,
    },
    {
      label: "Filler phrases",
      detail: weakPhrases.length ? `Found: ${weakPhrases.join(", ")}` : "None found",
      ok: weakPhrases.length === 0,
    },
    {
      label: "Length",
      detail: `${wordCount} words`,
      ok: wordCount >= 300 && wordCount <= 900,
    },
    {
      label: "Readability",
      detail: `Flesch ${fleschReadingEase}, avg sentence ${Math.round(avgSentenceWords)} words`,
      ok: readability_score >= 70,
    },
    {
      label: "Dated roles",
      detail: `${datedRoles} date ranges parsed`,
      ok: datedRoles >= 2,
    },
    {
      label: params.jobDescription ? "Job keyword coverage" : "Skill keyword breadth",
      detail: params.jobDescription
        ? `${matchedKeywords.length} matched, ${missingSkills.length} missing skills`
        : `${detectedSkills.length} recognised skills`,
      ok: keyword_match >= 60,
    },
  ];

  return {
    ats_score,
    keyword_match,
    formatting_score,
    impact_score,
    readability_score,
    metrics: {
      wordCount,
      bulletCount,
      quantifiedBullets,
      actionVerbCount,
      weakPhrases,
      sectionsFound,
      sectionsMissing,
      datedRoles,
      avgSentenceWords: Math.round(avgSentenceWords * 10) / 10,
      fleschReadingEase,
      detectedSkills,
      matchedKeywords,
      missingKeywords,
      missingSkills,
    },
    evidence,
  };
}

/** Rule-based suggestions derived purely from the computed metrics. */
export function deterministicSuggestions(s: ResumeScores, hasJd: boolean) {
  const out: { type: string; text: string }[] = [];
  const m = s.metrics;

  if (m.sectionsMissing.includes("contact"))
    out.push({ type: "critical", text: "No parseable contact block found — add email, phone and LinkedIn URL as plain text at the top." });
  if (m.sectionsMissing.includes("experience"))
    out.push({ type: "critical", text: "Add a clearly labelled 'Experience' heading — ATS parsers key off standard section titles." });
  if (m.sectionsMissing.includes("skills"))
    out.push({ type: "warning", text: "Add a 'Skills' section listing tools and technologies as plain comma-separated text." });
  if (m.sectionsMissing.includes("education"))
    out.push({ type: "improvement", text: "Add an 'Education' section, even if brief — many ATS filters expect it." });

  if (m.bulletCount < 6)
    out.push({ type: "warning", text: `Only ${m.bulletCount} bullet points detected. Break dense paragraphs into 3-5 bullets per role.` });
  if (m.quantifiedBullets < 3)
    out.push({ type: "critical", text: `Only ${m.quantifiedBullets} bullets contain numbers. Add metrics (%, $, time saved, scale) to at least half your bullets.` });
  if (m.actionVerbCount < 8)
    out.push({ type: "warning", text: "Start more bullets with strong action verbs (Led, Built, Reduced, Shipped) instead of passive descriptions." });
  if (m.weakPhrases.length)
    out.push({ type: "warning", text: `Remove filler phrases: ${m.weakPhrases.join(", ")}. Replace with a concrete outcome.` });

  if (m.wordCount < 300)
    out.push({ type: "critical", text: `Resume is short (${m.wordCount} words). Aim for 400-800 words with detailed accomplishments.` });
  if (m.wordCount > 1200)
    out.push({ type: "warning", text: `Resume is long (${m.wordCount} words). Trim to the most recent, most relevant 10 years.` });
  if (m.avgSentenceWords > 26)
    out.push({ type: "improvement", text: `Average sentence is ${m.avgSentenceWords} words. Shorten bullets to one idea each.` });
  if (m.datedRoles < 2)
    out.push({ type: "warning", text: "Add explicit date ranges (e.g. Mar 2022 – Present) to every role so parsers can build your timeline." });

  if (hasJd && m.missingSkills.length)
    out.push({
      type: "critical",
      text: `Job-specific gap: the posting mentions ${m.missingSkills.slice(0, 8).join(", ")} which your resume never states. Add any you genuinely have.`,
    });
  if (hasJd && m.missingKeywords.length)
    out.push({
      type: "improvement",
      text: `Consider mirroring the posting's language: ${m.missingKeywords.slice(0, 8).join(", ")}.`,
    });
  if (!hasJd)
    out.push({ type: "improvement", text: "Paste a target job description to get keyword-level tailoring against that specific role." });

  if (s.impact_score >= 75)
    out.push({ type: "good", text: "Strong achievement writing — your bullets lead with outcomes and numbers." });
  if (s.formatting_score >= 80)
    out.push({ type: "good", text: "Clean, ATS-parseable structure with standard headings." });

  return out;
}
