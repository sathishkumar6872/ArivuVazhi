# ArivuVazhi — Technical Architecture, Security & Data

**Document version:** 2.0  
**Last updated:** 05 November 2026

## 1. Approved architecture

Use a modular monolith for Release 1. One Node.js backend hosts business modules and the AI orchestration module. Do not split AI into a separate Python/FastAPI service in Release 1.

| Layer | Approved technology / approach |
|---|---|
| Admin Portal | Next.js App Router + TypeScript + MUI |
| Student Web | Next.js App Router + TypeScript + MUI |
| Student Mobile | React Native + TypeScript; Android first |
| Backend | Node.js + Express.js + TypeScript |
| AI | Backend module; OpenAI API provider + Ollama for local development/experimentation |
| Database | MongoDB Atlas Free Tier initially |
| Authentication | JWT access/refresh tokens; Argon2 password hashing |
| API | Versioned REST API; OpenAPI documentation |
| Architecture | Modular monolith; domain-oriented modules |
| Hosting | Existing/free subdomains and free tiers initially; validate limits |
| Frontend data | React Query; Redux Toolkit only where justified |

## 2. Explicitly not in Release 1 architecture

- No separate Python/FastAPI service.
- No Redis initially.
- No S3; evaluate approved low-cost storage options when file storage is required.
- No Vite integration with Next.js.
- No TailwindCSS.
- No Kubernetes or microservices.
- No premature event streaming or complex distributed infrastructure.

## 3. Backend module boundaries

1. **Identity & Access:** registration, login, refresh, logout, password recovery, roles and permissions.
2. **Student Profile:** profile, preferences, education and exam history.
3. **Exam Catalogue:** exams, patterns, subjects, syllabus and versions.
4. **Question Bank:** questions, options, answers, explanations, difficulty and approval state.
5. **Practice Engine:** sessions, responses, feedback and progress.
6. **Mock Engine:** configuration snapshots, timer state, attempts, submission and deterministic scoring.
7. **PYQ Management:** source, year, exam, rights/provenance, verification and publication.
8. **AI Tutor:** provider adapter, prompt versions, retrieval, conversation, feedback, memory and usage.
9. **Study Planner & Analytics:** goals, tasks, progress aggregation and readiness indicators.
10. **Notifications & Support:** in-app/push/email integration when configured; tickets and feedback.
11. **Admin Operations:** work queue, approval, bulk actions, config versions, audit and cost reporting.

## 4. Data design principles

- Use UUID identifiers at the application boundary and keep the chosen MongoDB representation consistent.
- Create collections incrementally as modules are implemented; do not create every possible collection at project start.
- Use explicit status and timestamps for approval/publication workflows.
- Keep audit events append-only where practical.
- Use immutable published exam/question/syllabus versions so historical attempts remain reproducible.
- Store attempt scoring-rule/version snapshots or references to immutable versions.
- Use bounded documents and indexes derived from real query patterns.
- Use idempotency keys for mock submission, offline sync and retryable operations.

## 5. Security and privacy

- Resolve user identity from verified authentication context; never trust client-supplied owner IDs.
- Access token target lifetime: 15 minutes; refresh token target lifetime: 30 days with rotation and revocation.
- Use RBAC and least privilege; sensitive AI conversation/memory access requires explicit permission and audit.
- Apply validation, Helmet, CORS allowlists, rate limits, secure cookies/token handling and TLS.
- Hash passwords with Argon2; never store plaintext credentials or secrets in source control.
- Validate uploads by type/size/content, scan for malware and restrict storage access.
- AI context must be student-isolated; only approved educational knowledge can be shared across learners.
- Do not use student data for model training by default.
- Define retention/deletion and privacy workflows after legal review.

## 6. Offline sync

- Persist only required offline practice data securely on device.
- Use a versioned sync API and idempotency keys.
- Server remains authoritative for scoring, exam rules and final submissions.
- Detect duplicates and conflicts; define per-entity conflict rules before implementation.
- Never allow offline client data to overwrite another student's records.

## 7. Operations and recovery

- Use separate development, test and production configuration/secrets.
- CI checks: lint, type-check, unit tests, integration tests and build.
- Central structured logs, request IDs, error monitoring and operational alerts.
- Provisional recovery objectives: RPO 24 hours and RTO 8 hours, subject to provider validation and restore drills.
- Verify free-tier backups, exports, restore paths, quotas and retention before launch.

## 8. API conventions

- Prefix APIs with `/api/v1`; use consistent pagination, filtering, sorting and error response formats.
- Document request/response contracts in OpenAPI.
- Separate student, admin and internal service authorization policies.
- Do not expose answer keys or privileged fields through list/detail endpoints.
- Use optimistic concurrency/version checks for mutable admin configuration where needed.
