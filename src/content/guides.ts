/**
 * Career advice content registry.
 *
 * Plain data only (no React imports) so the sitemap generator and the
 * structured-data tests can import this file in Node.
 */

export interface GuideFaq {
  question: string;
  answer: string;
}

export interface GuideSection {
  heading: string;
  body: string[];
  bullets?: string[];
}

export interface Guide {
  slug: string;
  /** Short label used in cards and breadcrumbs. */
  title: string;
  /** <title> text (kept under ~60 chars including the site suffix). */
  metaTitle: string;
  description: string;
  keyword: string;
  category: "Resume" | "Cover letter" | "Interview" | "Job search";
  published: string;
  updated: string;
  readMinutes: number;
  intro: string;
  sections: GuideSection[];
  faqs: GuideFaq[];
  /** Slugs of other guides. */
  related: string[];
  cta: { label: string; href: string; blurb: string };
}

export const GUIDES: Guide[] = [
  {
    slug: "cover-letter-guide",
    title: "How to write a cover letter",
    metaTitle: "How to Write a Cover Letter",
    description:
      "A step-by-step cover letter structure with a paragraph-by-paragraph template, tailoring rules, and the mistakes that get letters skipped.",
    keyword: "how to write a cover letter",
    category: "Cover letter",
    published: "2026-08-12",
    updated: "2026-08-12",
    readMinutes: 7,
    intro:
      "A cover letter is not a retelling of your resume. It answers one question a hiring manager has before they read anything else: why this person, for this role, right now. Four short paragraphs is enough.",
    sections: [
      {
        heading: "The four-paragraph structure that works",
        body: [
          "Recruiters skim. Give them a shape they can scan in under thirty seconds, with the strongest claim first.",
        ],
        bullets: [
          "Opening: the role you want and the single most relevant thing you have done.",
          "Proof: one specific project or result, with the scope and the outcome.",
          "Fit: why this company and this team, referencing something concrete from the job post or product.",
          "Close: what you want next and a plain offer to talk.",
        ],
      },
      {
        heading: "Tailor with the job description, not adjectives",
        body: [
          "Copy the job description into a document and highlight every noun that describes work: tools, systems, responsibilities, and outcomes. Those nouns are the vocabulary the team uses internally, and they are what a reviewer scans for.",
          "Use the ones you have genuinely done, in your own sentences. Do not stuff the list into a paragraph — a letter that reads like a keyword dump is worse than a generic one.",
        ],
      },
      {
        heading: "Lead with evidence, not enthusiasm",
        body: [
          "\"I am passionate about your mission\" is unfalsifiable, so it carries no information. Replace it with something only you could write: a number, a scope, a constraint you worked under, or a decision you made and what happened next.",
          "If you do not have numbers, use scale and specificity instead: how many people, how often, how large, how long.",
        ],
      },
      {
        heading: "Career changers and gaps",
        body: [
          "If you are changing field, spend one sentence naming the change directly and the rest of the letter on transferable evidence. Ambiguity reads as something to hide; a plain statement reads as confidence.",
          "The same applies to gaps. One clear line, no apology, then back to the work.",
        ],
      },
      {
        heading: "Before you send",
        body: ["Run this list every time — it catches most rejections that have nothing to do with your experience."],
        bullets: [
          "The company name and role title are correct everywhere in the document.",
          "No sentence starts with \"I am writing to apply\".",
          "It fits on one page in a normal font size.",
          "Sent as PDF unless the posting asks for something else.",
          "The file is named with your name and the role, not \"cover letter final v3\".",
        ],
      },
    ],
    faqs: [
      {
        question: "How long should a cover letter be?",
        answer:
          "Between 200 and 350 words, on a single page. Four short paragraphs is the practical target — long enough to give one piece of real evidence, short enough that a busy reviewer finishes it.",
      },
      {
        question: "Do employers still read cover letters?",
        answer:
          "It varies by company and role. Many hiring managers read them for shortlisted candidates, especially for career changers or when two resumes look similar. When a letter is optional, a short specific one is a low-cost advantage; a generic one adds nothing either way.",
      },
      {
        question: "Should I write a new cover letter for every application?",
        answer:
          "Keep one reusable structure and rewrite the proof and fit paragraphs each time. The opening and close can stay close to constant; the middle should reference the specific role, product, or team.",
      },
      {
        question: "What should I do if I cannot find the hiring manager's name?",
        answer:
          "Address the team instead — \"Hi Engineering team\" or \"Hello Gradr hiring team\" reads better than \"To whom it may concern\". Do not guess a name you are not confident about.",
      },
      {
        question: "Can I use AI to write my cover letter?",
        answer:
          "Yes, as a drafting and tailoring tool. Give it your real experience and the job description, then edit the result so the specifics and voice are yours. Never let it invent results, employers, or dates.",
      },
    ],
    related: ["interview-questions", "resume-optimization-checklist"],
    cta: {
      label: "Draft a tailored cover letter",
      href: "/apply",
      blurb: "Gradr writes a first draft from your resume and the job description, then you edit the specifics.",
    },
  },
  {
    slug: "interview-questions",
    title: "Common interview questions and answers",
    metaTitle: "Common Interview Questions & Answers",
    description:
      "The interview questions that come up in almost every process, what each one is really testing, and a repeatable structure for answering them well.",
    keyword: "common interview questions",
    category: "Interview",
    published: "2026-08-12",
    updated: "2026-08-12",
    readMinutes: 9,
    intro:
      "Most interview questions are variations on five or six underlying checks. Prepare the evidence once, and you can answer almost anything without memorising scripts.",
    sections: [
      {
        heading: "Build a story bank before you prepare answers",
        body: [
          "Write down six to eight things you have actually done: a project you led, a failure, a conflict, something you shipped under pressure, something you improved, and something you learned fast.",
          "For each one capture the situation, what you specifically decided, and how it ended. Those stories get reused across dozens of questions — you are preparing material, not scripts.",
        ],
      },
      {
        heading: "Use STAR, but spend your time on the A",
        body: [
          "Situation and Task should take two sentences. Action is where the interviewer learns how you think, so it deserves most of your airtime. Result closes the loop with an outcome and, ideally, what you would do differently.",
          "Aim for 90 seconds to two minutes. If you are past three, you have started narrating rather than answering.",
        ],
      },
      {
        heading: "The questions that come up almost every time",
        body: ["Each one is a proxy for something the interviewer cannot ask directly."],
        bullets: [
          "\"Tell me about yourself\" — can you frame your own story toward this role? Give a 60-second arc: now, relevant background, why this role.",
          "\"Why this company?\" — have you done any thinking? Reference the product, the market, or the team's work, not the mission statement.",
          "\"Tell me about a difficult stakeholder\" — how do you behave under friction? Show the disagreement and the resolution, never blame.",
          "\"What is your biggest weakness?\" — are you self-aware? Name a real one plus the concrete system you use to manage it.",
          "\"Tell me about a failure\" — do you own outcomes? Take responsibility early, then show what changed afterwards.",
          "\"Where do you want to be in a few years?\" — is this role a plausible step for you? Direction beats titles.",
        ],
      },
      {
        heading: "Salary and notice period",
        body: [
          "Answer factually and without hedging. If you are asked for expectations before you have information, it is reasonable to ask what range the role is budgeted at first.",
          "If you must give a number, give a range you would genuinely accept and say what it is based on. Never invent a competing offer.",
        ],
      },
      {
        heading: "Your questions at the end",
        body: [
          "Ask about the work, not the perks: what the first 90 days look like, how success is measured, what the team is struggling with, and who you would work with most closely.",
          "Take one note. It signals you are evaluating them too, which is exactly the posture strong candidates have.",
        ],
      },
      {
        heading: "Practise out loud",
        body: [
          "Reading answers silently creates false confidence. The gap between knowing a story and telling it cleanly only closes when you speak it, ideally under mild time pressure, and listen back.",
        ],
      },
    ],
    faqs: [
      {
        question: "How should I answer \"tell me about yourself\"?",
        answer:
          "Give a 60-second arc in three beats: what you do now, the one or two experiences that make you relevant to this role, and why you are in this conversation. Do not walk through your resume chronologically from your first job.",
      },
      {
        question: "What is the STAR method?",
        answer:
          "A structure for behavioural answers: Situation, Task, Action, Result. Keep the situation and task to about two sentences, spend most of the answer on the actions you personally took, and finish with a concrete outcome.",
      },
      {
        question: "How long should an interview answer be?",
        answer:
          "Roughly 90 seconds to two minutes for behavioural questions, and 30 to 60 seconds for factual ones. Finish and let the interviewer follow up rather than filling silence.",
      },
      {
        question: "How do I answer a question when I have no direct experience?",
        answer:
          "Say so plainly, then bridge to the closest thing you have done and describe how you would approach the new problem. Interviewers are testing reasoning as much as history; a confident \"I have not, but here is how I would start\" beats a padded story.",
      },
      {
        question: "How many interview questions should I practise?",
        answer:
          "Prepare six to eight reusable stories rather than dozens of scripted answers. Then rehearse out loud against a mixed set of questions so you get used to selecting and reshaping a story in real time.",
      },
    ],
    related: ["cover-letter-guide", "resume-optimization-checklist"],
    cta: {
      label: "Run an AI mock interview",
      href: "/interview",
      blurb: "Practise out loud with a realtime AI interviewer and get a scored breakdown of every answer.",
    },
  },
  {
    slug: "resume-optimization-checklist",
    title: "Resume optimization checklist",
    metaTitle: "Resume Optimization Checklist",
    description:
      "A practical checklist for optimizing a resume: structure, keyword coverage, bullet rewriting, and the formatting rules that keep parsers happy.",
    keyword: "resume optimization",
    category: "Resume",
    published: "2026-08-12",
    updated: "2026-08-12",
    readMinutes: 8,
    intro:
      "Resume optimization is two jobs at once: make the document machine-readable, and make the first third of it convince a human. Work through it in that order.",
    sections: [
      {
        heading: "Fix parsing before anything else",
        body: [
          "If an applicant tracking system cannot read your resume, nothing else you do matters. Most parsing failures come from layout, not content.",
        ],
        bullets: [
          "One column. Multi-column layouts frequently interleave when parsed.",
          "No text inside images, icons, or text boxes — it is invisible to the parser.",
          "Standard headings: Experience, Education, Skills, Projects.",
          "Consistent date format on every entry (for example, Mar 2024 – Present).",
          "Contact details in the body, never in the header or footer region.",
          "Export as PDF unless the application explicitly asks for DOCX.",
        ],
      },
      {
        heading: "Match the vocabulary of the job description",
        body: [
          "Pull the recurring nouns out of the posting — tools, methods, systems, deliverables — and check which ones appear anywhere in your resume. Missing terms that you have genuinely worked with are the highest-value edit available to you.",
          "Add them where they belong: in the bullet describing the work you did with them, and in your skills section. Never as a hidden block of white text; that is detectable and gets applications discarded.",
        ],
      },
      {
        heading: "Rewrite bullets as outcomes",
        body: [
          "The pattern is action verb, what you did, and the effect. Cut every phrase like \"responsible for\" and \"helped with\" — they describe a job description rather than your contribution.",
        ],
        bullets: [
          "Before: Responsible for managing the reporting process for the team.",
          "After: Rebuilt weekly reporting in SQL and cut the manual prep from six hours to under one.",
          "If you do not have a metric, use scope: how many users, how many markets, how large the dataset, how long it ran.",
        ],
      },
      {
        heading: "Front-load the first third",
        body: [
          "Reviewers make an initial call in seconds, and that decision happens in the top third of page one. Put your strongest and most relevant role there, and consider a two-line summary that names your target role in the same words the posting uses.",
          "Order sections by relevance, not habit. Early-career candidates with a strong project portfolio should put projects above education.",
        ],
      },
      {
        heading: "Keep versions under control",
        body: [
          "A tailored resume per role family beats one universal document, but only if you can tell them apart. Name versions by target role and keep the base version clean so each tailoring starts from the same place.",
        ],
      },
      {
        heading: "Final pass",
        body: ["Read it once for truth and once for tone. Everything on the page must be something you can defend in an interview."],
      },
    ],
    faqs: [
      {
        question: "What is resume optimization?",
        answer:
          "Editing a resume so that it parses cleanly in applicant tracking systems and reads convincingly to a human reviewer: a single-column structure, standard headings, vocabulary matched to the job description, and bullets written as outcomes rather than duties.",
      },
      {
        question: "How many keywords should a resume include?",
        answer:
          "There is no target count. Cover the recurring terms in the job description that reflect work you have genuinely done, place them in context, and stop. Keyword stuffing damages readability without reliably improving your score.",
      },
      {
        question: "Should a resume be one page or two?",
        answer:
          "One page for early-career candidates. Two is normal past roughly eight to ten years of relevant experience. Length is never the problem on its own — irrelevant content is.",
      },
      {
        question: "Is PDF or DOCX better for an ATS?",
        answer:
          "Modern parsers handle both. Send PDF by default because it preserves your layout, and switch to DOCX only when the application explicitly requests it.",
      },
      {
        question: "Do I need a different resume for every job?",
        answer:
          "Not for every job, but you should maintain a version per role family and adjust the summary, skills, and top bullets to match each posting's language.",
      },
    ],
    related: ["cover-letter-guide", "interview-questions"],
    cta: {
      label: "Score your resume",
      href: "/resume",
      blurb: "Upload your resume for a deterministic ATS score, keyword coverage, and line-level rewrite suggestions.",
    },
  },
];

export const GUIDES_BY_SLUG: Record<string, Guide> = Object.fromEntries(
  GUIDES.map((g) => [g.slug, g]),
);

export const guidePath = (slug: string) => `/career-advice/${slug}`;
