/**
 * Job landing page registry — role x location (plus remote) long-tail pages.
 *
 * Plain data only (no React imports) so the sitemap generator and the
 * structured-data tests can import this file in Node.
 */

export interface JobRole {
  id: string;
  /** Singular, as used in headings: "Frontend Developer". */
  name: string;
  /** Plural, lowercase, for sentences: "frontend developer jobs". */
  plural: string;
  summary: string;
  skills: string[];
  responsibilities: string[];
  keyword: string;
  /** Guide slugs most useful for this role. */
  guides: string[];
}

export interface JobLocation {
  id: string;
  /** "Remote" or a city/country name. */
  name: string;
  remote: boolean;
  blurb: string;
}

export interface JobLanding {
  slug: string;
  role: JobRole;
  location: JobLocation;
  title: string;
  metaTitle: string;
  description: string;
}

export const JOB_ROLES: JobRole[] = [
  {
    id: "frontend-developer",
    name: "Frontend Developer",
    plural: "frontend developer jobs",
    keyword: "frontend developer jobs",
    summary:
      "Frontend developers build the interfaces people actually touch — turning designs and product requirements into accessible, fast, maintainable web applications.",
    skills: ["JavaScript", "TypeScript", "React", "CSS", "Accessibility", "Testing", "Web performance"],
    responsibilities: [
      "Build and maintain user-facing features against design and product specs",
      "Own component structure, state management, and rendering performance",
      "Work with designers and backend engineers on API and interaction contracts",
      "Keep accessibility and cross-browser behaviour in the definition of done",
    ],
    guides: ["resume-optimization-checklist", "interview-questions"],
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    plural: "data analyst jobs",
    keyword: "data analyst jobs",
    summary:
      "Data analysts turn raw operational data into decisions — defining metrics, building reporting, and answering the questions a team keeps asking.",
    skills: ["SQL", "Spreadsheets", "Python or R", "Data visualisation", "Statistics", "Dashboarding"],
    responsibilities: [
      "Model and query data to answer recurring business questions",
      "Build and maintain dashboards stakeholders can self-serve from",
      "Define metrics precisely and keep definitions consistent across teams",
      "Communicate findings so non-technical stakeholders can act on them",
    ],
    guides: ["resume-optimization-checklist", "interview-questions"],
  },
  {
    id: "product-manager",
    name: "Product Manager",
    plural: "product manager jobs",
    keyword: "product manager jobs",
    summary:
      "Product managers decide what gets built and why — balancing user problems, business goals, and engineering constraints into a sequenced plan.",
    skills: ["Discovery", "Roadmapping", "Analytics", "Stakeholder management", "Writing", "Prioritisation"],
    responsibilities: [
      "Turn customer and market signals into a prioritised problem list",
      "Write specs and success criteria engineering and design can build against",
      "Run the release, measure the outcome, and decide what happens next",
      "Keep stakeholders aligned on trade-offs and sequencing",
    ],
    guides: ["cover-letter-guide", "interview-questions"],
  },
  {
    id: "ux-designer",
    name: "UX Designer",
    plural: "UX designer jobs",
    keyword: "ux designer jobs",
    summary:
      "UX designers research user problems and shape the flows, interfaces, and interaction details that solve them.",
    skills: ["User research", "Wireframing", "Prototyping", "Figma", "Design systems", "Usability testing"],
    responsibilities: [
      "Research user needs and translate findings into product decisions",
      "Design flows, wireframes, and high-fidelity interfaces",
      "Contribute to and apply the design system consistently",
      "Test designs with real users and iterate on what you learn",
    ],
    guides: ["cover-letter-guide", "resume-optimization-checklist"],
  },
  {
    id: "software-engineer",
    name: "Software Engineer",
    plural: "software engineer jobs",
    keyword: "software engineer jobs",
    summary:
      "Software engineers design, build, and operate the systems behind a product — from API and data design through to deployment and reliability.",
    skills: ["Algorithms", "System design", "APIs", "Databases", "Testing", "CI/CD", "Cloud infrastructure"],
    responsibilities: [
      "Design and implement services, APIs, and data models",
      "Review code and keep the codebase maintainable as it grows",
      "Instrument, monitor, and debug systems in production",
      "Break large problems into shippable increments",
    ],
    guides: ["interview-questions", "resume-optimization-checklist"],
  },
  {
    id: "marketing-manager",
    name: "Marketing Manager",
    plural: "marketing manager jobs",
    keyword: "marketing manager jobs",
    summary:
      "Marketing managers own how a product reaches its audience — positioning, channels, campaigns, and the numbers that show what worked.",
    skills: ["Positioning", "Content strategy", "SEO", "Paid channels", "Lifecycle email", "Analytics"],
    responsibilities: [
      "Own campaign planning, execution, and reporting against targets",
      "Sharpen positioning and messaging for specific audiences",
      "Run acquisition channels and manage budget against outcomes",
      "Work with product and sales on launches and funnel handoffs",
    ],
    guides: ["cover-letter-guide", "interview-questions"],
  },
];

export const JOB_LOCATIONS: JobLocation[] = [
  {
    id: "remote",
    name: "Remote",
    remote: true,
    blurb:
      "Fully remote roles widen your search beyond commuting distance, but they also widen the applicant pool — a tailored application matters more, not less.",
  },
  {
    id: "london",
    name: "London",
    remote: false,
    blurb:
      "London concentrates finance, media, and a dense startup scene, and most teams there run hybrid rather than fully office-based.",
  },
  {
    id: "new-york",
    name: "New York",
    remote: false,
    blurb:
      "New York hiring spans finance, media, health tech, and enterprise software, with fast processes and a strong emphasis on referrals.",
  },
  {
    id: "berlin",
    name: "Berlin",
    remote: false,
    blurb:
      "Berlin's startup market hires internationally and often runs in English, with structured, multi-stage interview processes.",
  },
  {
    id: "dubai",
    name: "Dubai",
    remote: false,
    blurb:
      "Dubai's market skews toward enterprise, logistics, and fast-growing regional startups, with hiring often tied to relocation and visa timelines.",
  },
];

export const JOB_LANDINGS: JobLanding[] = JOB_ROLES.flatMap((role) =>
  JOB_LOCATIONS.map((location) => {
    const label = location.remote
      ? `Remote ${role.name} Jobs`
      : `${role.name} Jobs in ${location.name}`;
    return {
      slug: `${role.id}-${location.id}`,
      role,
      location,
      title: label,
      metaTitle: label,
      description: location.remote
        ? `Search remote ${role.name.toLowerCase()} roles and get an AI-matched, ATS-ready application: resume scoring, tailored cover letters, and mock interviews.`
        : `Search ${role.name.toLowerCase()} roles in ${location.name} and prepare a tailored application with resume scoring, cover letters, and AI mock interviews.`,
    } satisfies JobLanding;
  }),
);

export const JOB_LANDINGS_BY_SLUG: Record<string, JobLanding> = Object.fromEntries(
  JOB_LANDINGS.map((l) => [l.slug, l]),
);

export const jobLandingPath = (slug: string) => `/job-search/${slug}`;

/** Shared FAQ set for a landing page — grounded, no invented salary or volume claims. */
export function jobLandingFaqs(landing: JobLanding) {
  const { role, location } = landing;
  const where = location.remote ? "remote" : `in ${location.name}`;
  return [
    {
      question: `What skills do ${role.plural} ${where} usually ask for?`,
      answer: `Most ${role.name} postings ${where} centre on ${role.skills.slice(0, 4).join(", ")}, plus evidence that you have shipped real work. Read three or four live postings and treat the terms that repeat as your checklist.`,
    },
    {
      question: `How do I tailor my resume for a ${role.name} role?`,
      answer:
        "Mirror the vocabulary of the posting in the bullets describing work you actually did, keep the layout single-column so it parses cleanly, and lead the top third of page one with your most relevant role.",
    },
    location.remote
      ? {
          question: `Are remote ${role.plural} open to candidates in any country?`,
          answer:
            "Not always. Many remote roles are restricted to specific countries or time zones for payroll and compliance reasons, so check the location requirements in the posting before you invest in a tailored application.",
        }
      : {
          question: `Do ${role.plural} in ${location.name} require you to be on site?`,
          answer: `${location.blurb} Check each posting for the expected number of office days rather than assuming a standard.`,
        },
    {
      question: `How should I prepare for a ${role.name} interview?`,
      answer:
        "Build six to eight reusable stories from real projects, rehearse them out loud in about two minutes each, and prepare questions about scope, success measures, and the team's current problems.",
    },
  ];
}
