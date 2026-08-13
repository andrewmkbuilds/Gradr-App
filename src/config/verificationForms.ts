/**
 * Category-specific verification forms.
 *
 * Every discount category collects only what a human reviewer needs to make a
 * decision. There is no external verification vendor: submissions land in a
 * review queue and stay "Pending review" until a Gradr admin decides.
 */

export type VerificationFieldType =
  | "text"
  | "email"
  | "url"
  | "select"
  | "textarea"
  | "file";

/** Column on `verification_requests` this field maps to. */
export type VerificationFieldName =
  | "full_name"
  | "organization"
  | "website"
  | "email"
  | "personal_email"
  | "country"
  | "role_or_status"
  | "supporting_information"
  | "document_path";

export interface VerificationField {
  name: VerificationFieldName;
  label: string;
  type: VerificationFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: string[];
}

export interface VerificationForm {
  key: string;
  label: string;
  discountPercent: number;
  blurb: string;
  /** Extra sentence describing exactly what we store for this category. */
  storageNote: string;
  confirmation: string;
  /** Show the "my institution isn't supported" escape hatch. */
  institutionRequest?: boolean;
  fields: VerificationField[];
}

const NAME: VerificationField = {
  name: "full_name",
  label: "Full name",
  type: "text",
  required: true,
  placeholder: "As it appears on your official records",
};

const COUNTRY: VerificationField = {
  name: "country",
  label: "Country",
  type: "text",
  required: true,
  placeholder: "United States",
};

const DOCUMENT: VerificationField = {
  name: "document_path",
  label: "Supporting document (optional)",
  type: "file",
  help: "Only upload a document if your email alone can't prove your role. PDF, PNG or JPG, max 5 MB.",
};

export const VERIFICATION_FORMS: VerificationForm[] = [
  {
    key: "student",
    label: "Student",
    discountPercent: 50,
    blurb: "Currently enrolled at a school, college or university.",
    storageNote:
      "We store your name, school, school email and country so a reviewer can confirm enrolment.",
    confirmation: "I confirm I am currently enrolled at the institution above.",
    institutionRequest: true,
    fields: [
      NAME,
      {
        name: "organization",
        label: "School / university name",
        type: "text",
        required: true,
        placeholder: "University of Manchester",
      },
      {
        name: "website",
        label: "School website",
        type: "url",
        required: true,
        placeholder: "https://manchester.ac.uk",
      },
      {
        name: "email",
        label: "School email address",
        type: "email",
        required: true,
        placeholder: "you@university.edu",
        help: "Must be issued by the institution you named — a matching domain speeds up review, but never approves automatically.",
      },
      {
        name: "personal_email",
        label: "Personal email (optional)",
        type: "email",
        placeholder: "you@gmail.com",
        help: "Used only to reach you if your school address stops working.",
      },
      COUNTRY,
    ],
  },
  {
    key: "educator",
    label: "Educator",
    discountPercent: 30,
    blurb: "Teachers, lecturers, professors and academic staff.",
    storageNote:
      "We store your name, institution, work email, role and country for review.",
    confirmation: "I confirm I currently work at the institution above in the role I entered.",
    institutionRequest: true,
    fields: [
      NAME,
      {
        name: "organization",
        label: "Institution name",
        type: "text",
        required: true,
        placeholder: "Lincoln High School",
      },
      { name: "website", label: "Institution website", type: "url", required: true, placeholder: "https://school.edu" },
      {
        name: "email",
        label: "Work / school email",
        type: "email",
        required: true,
        placeholder: "you@school.edu",
      },
      {
        name: "role_or_status",
        label: "Role / job title",
        type: "text",
        required: true,
        placeholder: "Lecturer, Computer Science",
      },
      COUNTRY,
    ],
  },
  {
    key: "military",
    label: "Military / Veteran",
    discountPercent: 30,
    blurb: "Active duty, reserve, veteran and eligible military family members.",
    storageNote:
      "We store your name, country, status and the details you provide. Do not upload full service records — a redacted proof is enough.",
    confirmation: "I confirm the status above is accurate.",
    fields: [
      NAME,
      COUNTRY,
      {
        name: "role_or_status",
        label: "Status",
        type: "select",
        required: true,
        options: ["Active Duty", "Reserve", "Veteran", "Military Family"],
      },
      {
        name: "email",
        label: "Military / work email if available, otherwise your account email",
        type: "email",
        required: true,
        placeholder: "you@mail.mil",
      },
      {
        name: "supporting_information",
        label: "Verification information",
        type: "textarea",
        required: true,
        placeholder: "Branch, service dates, discharge type, or how we can confirm your status.",
      },
      DOCUMENT,
    ],
  },
  {
    key: "first_responder",
    label: "First Responder",
    discountPercent: 30,
    blurb: "Firefighters, police, EMTs and paramedics.",
    storageNote:
      "We store your name, department, work email, role and country for review.",
    confirmation: "I confirm I currently serve in the role and department above.",
    fields: [
      NAME,
      {
        name: "organization",
        label: "Organization / department",
        type: "text",
        required: true,
        placeholder: "Boston Fire Department",
      },
      { name: "website", label: "Organization website", type: "url", required: true, placeholder: "https://boston.gov/fire" },
      { name: "email", label: "Work email", type: "email", required: true, placeholder: "you@department.gov" },
      { name: "role_or_status", label: "Role", type: "text", required: true, placeholder: "Paramedic" },
      COUNTRY,
      {
        name: "supporting_information",
        label: "Verification information (optional)",
        type: "textarea",
        placeholder: "Badge or licence number, or a public staff page we can check.",
      },
      DOCUMENT,
    ],
  },
  {
    key: "healthcare",
    label: "Healthcare Worker",
    discountPercent: 30,
    blurb: "Nurses, doctors and licensed healthcare staff.",
    storageNote:
      "We store your name, employer, professional email, job title and country. Never upload patient data.",
    confirmation: "I confirm I am currently employed or licensed in the role above.",
    fields: [
      NAME,
      {
        name: "organization",
        label: "Healthcare organization",
        type: "text",
        required: true,
        placeholder: "Mass General Hospital",
      },
      { name: "website", label: "Organization website", type: "url", required: true, placeholder: "https://massgeneral.org" },
      {
        name: "email",
        label: "Professional / work email",
        type: "email",
        required: true,
        placeholder: "you@hospital.org",
      },
      { name: "role_or_status", label: "Job title", type: "text", required: true, placeholder: "Registered Nurse" },
      COUNTRY,
      {
        name: "supporting_information",
        label: "Verification information (optional)",
        type: "textarea",
        placeholder: "Licence number or registry we can check.",
      },
      DOCUMENT,
    ],
  },
  {
    key: "nonprofit",
    label: "Nonprofit",
    discountPercent: 30,
    blurb: "Staff at a registered nonprofit organization.",
    storageNote:
      "We store your name, organization, work email, job title, country and any registration details you share.",
    confirmation: "I confirm I work at the registered nonprofit above.",
    fields: [
      NAME,
      {
        name: "organization",
        label: "Nonprofit organization",
        type: "text",
        required: true,
        placeholder: "Code for Good",
      },
      { name: "website", label: "Organization website", type: "url", required: true, placeholder: "https://codeforgood.org" },
      { name: "email", label: "Organization email", type: "email", required: true, placeholder: "you@nonprofit.org" },
      { name: "role_or_status", label: "Job title", type: "text", required: true, placeholder: "Program Manager" },
      COUNTRY,
      {
        name: "supporting_information",
        label: "Registration information",
        type: "textarea",
        required: true,
        placeholder: "Charity or nonprofit registration number and the registry it's listed in.",
      },
    ],
  },
  {
    key: "professional",
    label: "Professional",
    discountPercent: 0,
    blurb: "Verified working professionals. No standing discount by default.",
    storageNote:
      "We store your name, employer, work email, job title and country. This adds a verified badge — it does not include a discount unless we're running a professional offer.",
    confirmation: "I confirm the employment details above are accurate.",
    fields: [
      NAME,
      { name: "organization", label: "Company / organization", type: "text", required: true, placeholder: "Acme Inc." },
      { name: "website", label: "Company website", type: "url", required: true, placeholder: "https://acme.com" },
      { name: "email", label: "Work email", type: "email", required: true, placeholder: "you@acme.com" },
      { name: "role_or_status", label: "Job title", type: "text", required: true, placeholder: "Product Designer" },
      COUNTRY,
    ],
  },
];

export function verificationForm(key: string): VerificationForm | undefined {
  return VERIFICATION_FORMS.find((f) => f.key === key);
}

export const REQUEST_STATUS_COPY: Record<
  string,
  { label: string; tone: string; hint: string }
> = {
  pending: {
    label: "Pending review",
    tone: "text-muted-foreground border-border bg-muted/40",
    hint: "A Gradr reviewer is checking your details. We'll notify you when there's a decision.",
  },
  approved: {
    label: "Approved",
    tone: "text-primary border-primary/40 bg-primary/10",
    hint: "Your discount is applied automatically at checkout.",
  },
  rejected: {
    label: "Not approved",
    tone: "text-destructive border-destructive/40 bg-destructive/10",
    hint: "We couldn't confirm your eligibility from these details.",
  },
  needs_more_information: {
    label: "More info needed",
    tone: "text-warning border-warning/40 bg-warning/10",
    hint: "Reply with the details the reviewer asked for by submitting again.",
  },
};

/**
 * Client-side hint only: does this email *look* institutional? Never used to
 * approve anything — a reviewer always makes the decision.
 */
export function looksInstitutional(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!domain) return false;
  return /\.edu$/.test(domain) || /\.ac(\.[a-z]{2,})+$/.test(domain) || /\.edu(\.[a-z]{2,})+$/.test(domain);
}

const FREE_MAIL = [
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "live.com",
  "aol.com",
];

export function isFreeMailDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return FREE_MAIL.includes(domain);
}
