/**
 * Blog post registry.
 *
 * Plain data only (no React imports) so the sitemap generator and the
 * structured-data tests can import this file in Node. Every blog page reads
 * its metadata, FAQs and JSON-LD from here, which is what makes the schema
 * output automatically verifiable in CI.
 */
import type { GuideFaq } from "./guides";

export interface BlogPost {
  slug: string;
  title: string;
  metaTitle: string;
  description: string;
  keyword: string;
  published: string;
  updated: string;
  faqs: GuideFaq[];
  about: string[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "ai-resume-optimization",
    title: "AI Resume Builder & ATS Guide",
    metaTitle: "AI Resume Builder & ATS Guide",
    description:
      "How AI resume builders help candidates beat Applicant Tracking Systems (ATS). A technical, plain-English guide to keyword matching, formatting rules, and AI-driven rewrites.",
    keyword: "ai resume builder",
    published: "2026-07-09",
    updated: "2026-07-09",
    about: ["AI resume builder", "Applicant Tracking System", "Resume optimization"],
    faqs: [
      {
        question: "Does an AI resume builder actually help you beat the ATS?",
        answer:
          "Yes — a good AI resume builder aligns your resume with the language, structure, and keywords a specific job description uses, which is exactly what ATS parsers score against. It won't fabricate experience, but it will make real experience discoverable.",
      },
      {
        question: "Will an ATS reject me for using AI to write my resume?",
        answer:
          "No. ATS software scores structure and keyword match — it doesn't detect AI-written content. What matters is whether the resume is parseable, honest, and relevant.",
      },
      {
        question: "What format should an AI-optimized resume use?",
        answer:
          "A single-column PDF or DOCX with standard section headings (Experience, Education, Skills), no tables, no text inside images, and consistent date formatting. This is what ATS parsers reliably read.",
      },
      {
        question: "What is ATS resume optimization?",
        answer:
          "ATS resume optimization is the process of tailoring a resume's keywords, structure, and formatting so Applicant Tracking Systems (Workday, Greenhouse, Lever, Taleo, iCIMS) can parse it correctly and rank it highly against a specific job description. It focuses on plain-text parseability, exact keyword matches from the job posting, and standard section headings.",
      },
      {
        question: "What is a good AI resume ATS score?",
        answer:
          "A match score of 80 or above is considered strong for most roles, and 90+ puts you in the top tier for that specific job description. Anything below 60 usually means missing keywords, weak verbs, or formatting the parser can't read. Scores are always relative to one posting — a resume that scores 92 for one role can score 55 for another.",
      },
      {
        question: "How do I check my resume's ATS score for free?",
        answer:
          "Upload your resume and paste the target job description into an AI resume scanner like the Gradr Resume Engine. It parses the file the same way an ATS would, compares it to the posting, and returns a 0–100 match score plus the specific missing keywords and formatting issues to fix.",
      },
      {
        question: "How many keywords should I add to my resume for ATS?",
        answer:
          "Aim to cover every hard skill, tool, and required qualification listed in the job posting at least once, using the exact phrasing from the posting. Don't keyword-stuff — repeating the same term five times doesn't raise your score and reads badly to a recruiter. Coverage matters more than frequency.",
      },
      {
        question: "Can AI tailor my resume for each job automatically?",
        answer:
          "Yes. An AI resume builder can rewrite bullets, reorder sections, and adjust keyword density for each specific job description in seconds, so you send a targeted version to every application instead of one generic resume. This is the single highest-leverage change most candidates can make to their ATS scores.",
      },
      {
        question: "Do ATS systems read PDFs or Word documents better?",
        answer:
          "Modern ATS platforms parse both single-column PDFs and DOCX files reliably as long as the text is selectable (not a scanned image). PDF is usually safer because it preserves formatting across systems. Avoid image-based PDFs, multi-column templates, and DOCX files that rely on text boxes or tables.",
      },
    ],
  },
];

export const blogPath = (slug: string) => `/blog/${slug}`;

export const getBlogPost = (slug: string) => BLOG_POSTS.find((p) => p.slug === slug);
