# ArivuVazhi — Decision Register

**Documentation version:** 2.0  
**Last updated:** 20 November 2026

| Area | Approved decision |
|---|---|
| Product name | ArivuVazhi |
| Admin Portal | Next.js App Router, TypeScript, MUI |
| Student Web | Next.js App Router, TypeScript, MUI |
| Student Mobile | Flutter (Dart), Android first — changed from React Native on 17 Nov 2026 (see below) |
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

## Implementation changes recorded 20 November 2026

| Area | Decision | Status | Impact |
|---|---|---|---|
| Student Mobile stack | The student app moved from React Native (Expo) to **Flutter** (`student-mobile-flutter`), same API, screens and flows. The React Native app is frozen on branch `version-0.01`. Android release builds need NDK 28.2 and `compileSdk 37`. | **Deviation — owner requested (17 Nov 2026)** | One codebase for Android, iOS and web. Release APK is still debug-signed: updating existing Expo installs needs the EAS keystore. |
| Mobile design system | Light theme: premium soft surfaces and gradient hero cards. Dark theme: glassmorphism over an emerald glow, frosted tab/action bars. Forest-green brand kept; gold reserved for rewards; Poppins headings; light motion (transitions, press scale, ring count-up, answer pulse/shake, typing indicator). | Implemented (owner reviewed) | Real backdrop blur only on fixed bars to keep low-end phones smooth. |
| Mobile UX fixes | Android back goes to the previous screen, then Home, then "press back again to exit". Quiz / mock / PYQ actions pinned at the bottom. Tutor replies can be copied (plain text). | Implemented | — |
| AI tutor fallback visibility | When no provider answers, the reply says the AI is unavailable and uses saved notes; the reason is stored and shown on Admin → Today and Admin → AI. Internal syllabus instructions never reach students. | Implemented | Silent "local" answers no longer look like AI answers. |
| Per-student daily AI limit | Removed (owner request). The monthly AI budget hard stop remains. | Implemented | No "daily limit reached" for students; spend is bounded only by the monthly budget. |
| Gemini tutor speed | Tutor calls skip model "thinking" and cap each model at 15 s and the whole call at 30 s; other generation jobs unchanged. | Implemented | Faster replies; a slow provider falls back to notes instead of hanging. |
| ChatGPT accounts | Primary + up to 2 backup ChatGPT plan sign-ins; calls fall back in order; admin can switch the primary. Sign-out also forgets the app registration (fixes `workspace_scope_denied`) and hands the tutor to Gemini when enabled. | Implemented — **test use only; still the open ChatGPT-plan deviation above** | Sign-in works only from a `127.0.0.1` backend sharing the server's `ENCRYPTION_KEY`. |
| Daily mock generation | Invalid AI questions are dropped one by one instead of failing the whole batch; batch failures are logged. Admin → Today shows ready / preparing / failed with "Retry failed". | Implemented | Fewer "Only N of M questions" failures. |
| Daily current affairs | 03:00 IST: ChatGPT web search collects yesterday's exam-relevant news. Each item must pass **three checks** before publishing: (1) 2+ live links on different sites, one trusted, coaching/job/GK aggregators excluded; (2) independent fact check — Gemini + Google Search, or a second ChatGPT plan model when no Gemini key; (3) a fresh ChatGPT re-check. Max 8 per day, English + Tamil, one quiz question each, written only from verified facts. Two student reports hide an item. | Implemented — **AI-only publishing without human review needs sign-off** | No manual work. Accuracy is high but not guaranteed; sources are shown and students can report. |
| Current affairs archive | One-time backfill of the last 18 months, 2 months per night (max 25 events/month, real event dates, same checks). Done months are never redone. | Implemented (Nov–Oct 2026 done on 20 Nov) | ~9 nights to complete; AI usage on the ChatGPT plan. |
| Current affairs filters | Student API and app: latest day, one day, date range, category. | Implemented | — |
| Current affairs practice questions | Each verified item gets easy / medium / hard MCQs (EN + TA) from its facts, under a per-exam "Current Affairs" subject with one topic per month; the existing AI answer check publishes them. These topics never get live AI questions and are excluded from syllabus refresh, daily-mock sections, PYQ mapping and syllabus completion. A hidden item retires its questions. | Implemented — not yet deployed or run | Current affairs join practice; daily mocks are not changed yet. |
| Admin Today page | Overview replaced by one "Today" screen: daily mocks, AI status, current affairs (incl. archive progress) and pending counts. | Implemented | Admin sees in seconds whether anything needs attention. |
| Scheduled jobs on a sleeping host | External cron (cron-job.org) calls the internal routes with `x-cron-secret`: 02:55 daily mocks, 03:00 current affairs. | Decided — **cron and `CRON_SECRET` not yet configured** | Without it the free-tier host misses both jobs. |

## Decisions requiring validation

- First launch exam and official content sources.
- PYQ rights/licensing.
- India-specific privacy/legal requirements.
- Current free-tier quotas, AI provider pricing and storage constraints.
- Tamil/English/Tanglish AI quality.
- Accuracy of AI-published current affairs (spot-check samples before public launch).
- ChatGPT plan sign-in for a multi-user server vs. an OpenAI API key for production.
- Backup and recovery capability.

Changes require impact review and explicit approval.
