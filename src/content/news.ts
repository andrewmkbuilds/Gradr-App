/**
 * Editorial registry for news.gradr.me.
 *
 * Plain data only (no React imports) so the sitemap generator can import it
 * from Node.
 */

export type NewsCategory = "Product" | "Company" | "Job market" | "Guides";

export interface NewsSection {
  heading: string;
  body: string[];
  list?: string[];
}

export interface NewsArticle {
  slug: string;
  title: string;
  metaTitle: string;
  description: string;
  category: NewsCategory;
  published: string;
  updated: string;
  readingMinutes: number;
  excerpt: string;
  sections: NewsSection[];
}

export const NEWS_CATEGORIES: NewsCategory[] = ["Product", "Company", "Job market", "Guides"];

export const NEWS: NewsArticle[] = [
  {
    slug: "ai-mock-interview-voice-upgrade",
    title: "The AI Mock Interview now sounds human",
    metaTitle: "Gradr's AI Mock Interview Voice Upgrade",
    description:
      "Gradr's AI Mock Interview moves to a new realtime voice pipeline with natural speech, interruption support and captions timed to the audio.",
    category: "Product",
    published: "2026-08-05",
    updated: "2026-08-05",
    readingMinutes: 4,
    excerpt:
      "A new realtime voice pipeline makes the interviewer sound like a person: natural pacing, mid-sentence interruption and captions that reveal in sync with speech.",
    sections: [
      {
        heading: "What changed",
        body: [
          "The interviewer's speech is now synthesised sentence by sentence and streamed as it is generated, so the first words arrive in well under a second instead of after the full answer is written.",
          "Captions are timed to actual audio playback rather than dumped as a block, which makes the conversation readable while it happens.",
        ],
      },
      {
        heading: "Interruption that works",
        body: [
          "You can talk over the interviewer. Playback stops immediately, the partial turn is recorded in the transcript, and the interviewer responds to what you actually said.",
        ],
      },
      {
        heading: "Why it matters",
        body: [
          "Interview practice only transfers to the real thing when the pressure feels real. Latency and robotic delivery break that illusion faster than anything else.",
        ],
      },
    ],
  },
  {
    slug: "subdomain-architecture",
    title: "Gradr moves to a subdomain architecture",
    metaTitle: "Gradr's New Subdomain Architecture",
    description:
      "Gradr now runs across dedicated subdomains for the app, marketing, news, docs and the affiliate portal — one ecosystem, clearer surfaces.",
    category: "Company",
    published: "2026-08-14",
    updated: "2026-08-14",
    readingMinutes: 3,
    excerpt:
      "The product, marketing site, newsroom, documentation and affiliate portal each get their own subdomain, with shared design tokens and a single sign-on.",
    sections: [
      {
        heading: "The new map",
        body: ["Each surface now lives at its own address."],
        list: [
          "gradr.me — homepage and brand overview",
          "app.gradr.me — the authenticated product",
          "marketing.gradr.me — features, pricing, use cases",
          "news.gradr.me — this newsroom",
          "docs.gradr.me — documentation",
          "partners.gradr.me — the partner portal",
        ],
      },
      {
        heading: "One ecosystem",
        body: [
          "Every surface shares the same design system, authentication and analytics. Signing in once gives you the app; the other surfaces stay public and fast.",
        ],
      },
    ],
  },
  {
    slug: "ats-rejection-myths",
    title: "Four ATS myths that cost candidates interviews",
    metaTitle: "Four ATS Myths That Cost Candidates Interviews",
    description:
      "Applicant tracking systems do not auto-reject resumes for using AI, and keyword stuffing does not work. Here is what actually moves the needle.",
    category: "Guides",
    published: "2026-07-22",
    updated: "2026-07-22",
    readingMinutes: 6,
    excerpt:
      "Most ATS advice online is folklore. Here is what applicant tracking systems actually do with your resume — and the four myths worth unlearning.",
    sections: [
      {
        heading: "Myth 1: the ATS rejects you automatically",
        body: [
          "Most systems rank and surface, they do not reject. A low keyword match means a recruiter never scrolls to your row, which feels identical to rejection but is fixed differently.",
        ],
      },
      {
        heading: "Myth 2: keyword stuffing works",
        body: [
          "Modern parsers score keywords in context. A skills wall with no supporting bullet reads as noise to the recruiter who does open your file.",
        ],
      },
      {
        heading: "Myth 3: design gets you noticed",
        body: [
          "Two-column templates, icons and text inside images are the most common cause of unreadable parses. Single column, standard headings, real text.",
        ],
      },
      {
        heading: "Myth 4: one resume is enough",
        body: [
          "Tailoring per role is the single highest-leverage change most candidates can make, and it takes minutes when the gap analysis is automated.",
        ],
      },
    ],
  },
  {
    slug: "graduate-hiring-outlook-2026",
    title: "Graduate hiring outlook: what changed in 2026",
    metaTitle: "Graduate Hiring Outlook 2026 — What Changed",
    description:
      "Entry-level hiring is shifting toward skills-based screening and shorter interview loops. What that means for new graduates.",
    category: "Job market",
    published: "2026-06-30",
    updated: "2026-06-30",
    readingMinutes: 5,
    excerpt:
      "Skills-based screening, shorter loops and more structured interviews are reshaping the entry-level market. Here is how to adapt.",
    sections: [
      {
        heading: "Skills-based screening is now the default",
        body: [
          "Degree filters are being replaced by demonstrable skills. Portfolios, project write-ups and measurable outcomes carry more weight than institution names.",
        ],
      },
      {
        heading: "Shorter, more structured loops",
        body: [
          "Fewer rounds, but each one is scored against a rubric. Rehearsing structured answers (situation, action, measurable result) maps directly onto how you are graded.",
        ],
      },
      {
        heading: "What to do about it",
        body: [
          "Quantify every bullet, keep one tailored resume per role family, and practise out loud. The gap between a good answer thought and a good answer spoken is larger than most candidates expect.",
        ],
      },
    ],
  },
  {
    slug: "career-readiness-score",
    title: "Introducing the Career Readiness score",
    metaTitle: "Introducing the Gradr Career Readiness Score",
    description:
      "A single number that tracks how ready you are to land your next role, built from resume quality, pipeline health, interview practice and skill coverage.",
    category: "Product",
    published: "2026-05-18",
    updated: "2026-05-18",
    readingMinutes: 3,
    excerpt:
      "One number on the dashboard, four pillars underneath it, and a drill-down that tells you exactly what to do next.",
    sections: [
      {
        heading: "Four pillars",
        body: ["The score aggregates the parts of a job search that actually predict outcomes."],
        list: [
          "Resume quality — ATS score of your primary resume",
          "Pipeline health — volume and freshness of live applications",
          "Interview readiness — recent practice and competency scores",
          "Skill coverage — overlap with your target role",
        ],
      },
      {
        heading: "Why this score",
        body: [
          "Expanding the panel shows each pillar's weight, your current value and the single fastest action to raise it.",
        ],
      },
    ],
  },
];

export const NEWS_BY_SLUG: Record<string, NewsArticle> = Object.fromEntries(
  NEWS.map((item) => [item.slug, item]),
);

export function newsPath(slug: string): string {
  return `/${slug}`;
}
