# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Students, recent graduates, and early-career professionals who are actively looking for a job. They open Gradr because they are applying for roles or preparing for an upcoming interview, and want one place to improve their chances instead of juggling resumes, job boards, interview prep, and application tracking separately.

Typical high-intent tasks on arrival:

- Applying for a job — tailor and analyze a resume against a job description, check ATS fit.
- Searching for jobs — find relevant roles and track applications.
- Preparing for an interview — run a realistic AI mock interview and get feedback.
- Managing the search — see applications, deadlines, interviews, and progress in one dashboard.

## Product Purpose

Gradr connects the entire job-search workflow into one system: finding a role, understanding fit, optimizing the resume, preparing through realistic AI interviews, and tracking applications and progress over time. Success is a user who runs their whole search inside Gradr rather than across scattered tools, and can see their fit and readiness improve.

## Positioning

The connected workflow and personalized career intelligence spanning discovery, fit, optimization, preparation, and tracking — rather than treating resume building, job discovery, interview preparation, and tracking as isolated tools.

## Operating Context

- Two clearly separated surfaces: `gradr.me` is the marketing site; `app.gradr.me` is the authenticated product.
- Users arrive mid-search with real artifacts: resumes (PDF/DOCX), job descriptions, application deadlines, interview dates.
- Work happens in bursts around live applications and scheduled interviews, on both desktop and mobile.

## Capabilities and Constraints

Core product workflow, all of which must be preserved:

- Job discovery and search
- Resume analysis and optimization (ATS scoring)
- Job matching against specific roles
- Application tracking
- AI mock interviews with real-time feedback
- Interview reports and career analytics

Technical constraints:

- Shared backend on Lovable Cloud (Supabase): existing authentication, user data, RLS, storage, and Edge Functions must be preserved.
- Existing billing infrastructure (Paddle) must be preserved.
- Auth methods: email/password, Google, Apple, Microsoft. GitHub auth is not available.
- React + Vite + React Router architecture; do not migrate frameworks.
- No unrelated feature, branding, pricing, backend, DNS, OAuth, or infrastructure changes unless explicitly requested.

## Brand Commitments

- The Yacht Club design system and visual language are binding: Ocean Teal `#245F73`, Mahogany `#733E24`, Soft White `#F2F0EF`, Deep Sea dark.
- Typography: Bricolage Grotesque for display, Geist for UI and body.
- The Gradr logo and its exact geometry are fixed. Never recreate, redraw, or redesign it. Use the existing transparent logo asset when a different background is needed.
- Marketing and product surfaces stay clearly separated.

## Evidence on Hand

- Shipped, running product with an incumbent visual implementation across dashboard, resume, matching, interview, and billing surfaces.
- Design system source at `src/design-system/gradr-9b9b95/`, including real logo assets under `assets/logos/`.
- No testimonials, customer names, benchmarks, or press are established; future work must not fabricate them.

## Product Principles

1. One connected workflow — every surface should hand off to the next stage of the search, never dead-end.
2. High-intent first — the fastest path from opening the app to the task the user came to do.
3. Personalized intelligence — feedback and matching are specific to this user's resume, target roles, and history.
4. Calm and sturdy — structure and spacing carry the design; color carries meaning, used sparingly.
5. Preserve the incumbent — brand, backend, and core workflow are inherited constraints, not open questions.

## Accessibility & Inclusion

WCAG AA text contrast (4.5:1) and 3:1 for borders and focus rings, per the design system contract. Every interactive element keeps a visible focus ring. Motion honors the in-app motion toggle and OS reduced-motion setting.
