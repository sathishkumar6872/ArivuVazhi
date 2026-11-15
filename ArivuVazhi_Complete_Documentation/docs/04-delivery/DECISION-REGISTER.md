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
| Practice levels | Each topic opens level by level: Easy is always open; Medium unlocks at 80% in Easy, Hard at 70% in Medium; 60% in Hard masters the topic (at least 10 questions per level, accuracy over the last 20 answers; a passed level never re-locks). Quick practice uses only topics where the chosen level is open. Topic progress = levels passed / 3; syllabus progress = the average over topics. The first answer to a question is final. Unanswered questions of an abandoned set can be served again; an unfinished set can be resumed. Retry-wrong-answer sets are not counted in progress. Daily-mock questions never appear in practice. | Implemented | Accuracy and progress cannot be inflated by re-answering; levels are earned per topic. |
| Shared question pool | Each exam has one shared pool used by every student's practice and daily mock. AI questions are generated only when the pool has nothing the student has not seen. A new AI question is visible to its own student at once; it joins the pool when a second AI pass confirms the answer (auto-approve) or an admin approves it. 3 student reports, or 80%+ wrong answers over 20+ answers, hide a question until an admin acts. No student is ever shown the same question twice (practice or mock). | Implemented (owner approved auto + admin approval, 14 Nov 2026) | Storage and AI cost grow with the exam, not with students; admin reviews a question once for everyone. Auto-approved AI content still reaches students without a human review — **deviation from "only approved questions" stays open for sign-off**. |
| Data retention | Untaken daily mocks, empty abandoned practice sets, unused rejected questions, sync receipts and job runs are removed after 7 days. AI usage logs keep 40 days because the monthly AI budget needs the whole month. Admin Operations shows database size against the plan limit (`DB_LIMIT_MB`, default 512) and warns at 80%. | Implemented | Keeps the free tier usable; practice answers and mock attempts (progress) are never deleted. |
| Daily mock sets | Each exam has one daily mock that mirrors its pattern (total questions, duration, marks, negative marks; sections matched to syllabus subjects, the rest spread over unnamed subjects). Students see only the daily mocks of their own exams; admin-authored mocks are not shown to students. A new student's mock is generated right after onboarding (or adding an exam), in the student's exam language, with AI batches in parallel. From the next day a job at 02:00 Asia/Kolkata regenerates it for each recently active student (last 14 days). Questions never repeat (normalised-stem check). Full pattern by default; `DAILY_MOCK_MAX_QUESTIONS` can cap it. Mock start uses the ready set instantly; until it is ready the student sees preparation progress — there is no partial bank fallback. New students get no starter planner tasks. Missed runs catch up on server boot; sleeping hosts can trigger it via `POST /api/v1/internal/jobs/daily-mocks` with `x-cron-secret`, which returns a `runId` to poll at `GET /api/v1/internal/jobs/daily-mocks/:runId`. Only one run executes at a time across instances (MongoDB lease, renewed per set, expires 5 min after a crash). A set stuck in `generating` for 10 min is regenerated; a student waits for an in-progress set at most 3 min before the mock falls back to the bank. | Implemented | AI cost scales with active students × mocks per day; the monthly budget hard-stop still applies. |
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
