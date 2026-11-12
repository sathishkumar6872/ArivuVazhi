# ArivuVazhi — Decision Register

**Documentation version:** 2.0  
**Last updated:** 05 November 2026

| Area | Approved decision |
|---|---|
| Product name | ArivuVazhi |
| Admin Portal | Next.js App Router, TypeScript, MUI |
| Student Web | Next.js App Router, TypeScript, MUI |
| Student Mobile | React Native, TypeScript, Android first |
| Backend | Node.js, Express.js, TypeScript |
| Architecture | Modular monolith |
| AI | Node backend module; OpenAI API + Ollama local experimentation |
| Database | MongoDB Atlas Free Tier initially |
| Auth | JWT access/refresh; Argon2 |
| API | Versioned REST + OpenAPI |
| Release 1 pricing | Free |
| Mock attempts | One attempt per mock per student per day |
| Offline | Practice offline with controlled sync |
| AI memory | Student can view, correct, reset and disable |
| Excluded | Payments, subscriptions, study library/downloads, iOS, TTS, certificates, public leaderboard |
| Avoid initially | Python/FastAPI service, Redis, S3, Vite, TailwindCSS, Kubernetes, microservices |

## Implementation changes recorded 12 November 2026

| Area | Decision | Status | Impact |
|---|---|---|---|
| Practice questions | Per student, never repeating a question already served: (1) unseen questions prepared for that student or from the approved bank; (2) otherwise AI generates the shortfall live; (3) repeats only as a last resort when AI is unavailable. The next set is prefetched in the background (two sets ahead), so only the first practice waits on the AI. Duplicate AI stems are rejected (normalised-stem match) and recent stems are sent to the model to avoid. | Implemented | First practice: provider latency (~5–15 s); later practices ~0.15 s. |
| Student-owned AI questions | AI questions generated for a student are `under_review`, visible only to that student, and join the shared bank only after admin approval. | **Deviation from "only approved questions in practice/mock" — needs explicit approval** | Faster personalised practice; unreviewed AI content reaches the requesting student. |
| Daily mock sets | A job at 02:00 Asia/Kolkata generates each recently active student's (last 14 days) personal question set for every published mock of their selected exams (max 25 questions, configurable). Mock start uses that set instantly; if none is ready it falls back to the approved bank. Missed runs catch up on server boot; sleeping hosts can trigger it via `POST /api/v1/internal/jobs/daily-mocks` with `x-cron-secret`. | Implemented | AI cost scales with active students × mocks per day; the monthly budget hard-stop still applies. |
| Mock attempts | Each attempt snapshots its question set and marking rules at start; the shared mock is never modified by a student start. Expired attempts auto-submit on next access. | Implemented | Scores are reproducible after later mock or question edits. |
| Syllabus refresh | AI syllabus refresh is non-destructive: matching subjects/topics keep their IDs, new ones enter `validation` and need approval, missing ones are withdrawn (hidden), not deleted. | Implemented | Student progress and question links survive refreshes. Source is still AI search, not an official document — verify against the official syllabus before launch. |
| AI providers | "Sign in with ChatGPT" (subscription OAuth) and Gemini are used in addition to the approved OpenAI API + Ollama baseline. | **Deviation — needs explicit approval** | Using a consumer ChatGPT subscription for a server-side multi-user app may conflict with OpenAI's terms; usage limits and cost are not contractually defined. Recommend OpenAI API key for production. |
| Repositories | The four applications live in one monorepo instead of separate repositories. | **Deviation — needs explicit approval** | Simpler local setup; CI per app still required. |

## Decisions requiring validation

- First launch exam and official content sources.
- PYQ rights/licensing.
- India-specific privacy/legal requirements.
- Current free-tier quotas, AI provider pricing and storage constraints.
- Tamil/English/Tanglish AI quality.
- Backup and recovery capability.

Changes require impact review and explicit approval.
