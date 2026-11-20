# ArivuVazhi

AI-assisted government exam preparation. This workspace contains the product documents, clickable prototypes, and the Release 1 applications.

## Applications

| App | Path | URL / target |
|---|---|---|
| API | `backend` | http://localhost:4000 |
| API docs | `backend` | http://localhost:4000/api/docs |
| Student web | `student-web` | http://localhost:3000 |
| Admin portal | `admin-portal` | http://localhost:3001 |
| **Student mobile (Flutter)** | `student-mobile-flutter` | Android APK (iOS and web build from the same code) |
| Student mobile (React Native, legacy) | `student-mobile` | Kept for reference; frozen on branch `version-0.01` |

The Flutter app replaced the React Native app on 17 November 2026. New mobile work goes into `student-mobile-flutter` only. See [student-mobile-flutter/README.md](student-mobile-flutter/README.md).

## Run locally

```powershell
npm install --prefix backend
npm install --prefix student-web
npm install --prefix admin-portal
npm run seed
npm run dev:api
npm run dev:student
npm run dev:admin
```

Start each dev command in its own terminal.

Mobile (Flutter 3.50+, Android SDK, JDK from Android Studio):

```powershell
cd student-mobile-flutter
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:4000/api/v1   # Android emulator → local API
flutter build apk --release                                       # uses the hosted API by default
```

## Configuration

Secrets live in `backend/.env` (gitignored). Copy `backend/.env.example` to start.

| Variable | Why it matters |
|---|---|
| `MONGODB_URI` | The local `.env` may point at the production database. Use a separate test database for experiments. |
| `ENCRYPTION_KEY` | Encrypts ChatGPT sign-in tokens and Drive credentials. **Must be the same value locally and on the server**, or tokens saved on one cannot be read on the other ("Unsupported state or unable to authenticate data"). |
| `CRON_SECRET` | Enables the internal job routes for the external cron (below). Empty disables them. |
| `OPENAI_API_KEY`, `GEMINI_API_KEY` | Optional. AI providers are normally configured in Admin → AI. |
| `DAILY_MOCK_JOB`, `CURRENT_AFFAIRS_JOB` | `off` disables that scheduled job. |

### AI providers (Admin → AI)

- **ChatGPT plan sign-in**: works only from a backend running on `127.0.0.1` (OpenAI's callback rule). Sign in locally with the same `MONGODB_URI` and `ENCRYPTION_KEY` as the server; the server then uses that sign-in. A primary account plus up to 2 backup accounts; calls fall back primary → backup 1 → backup 2. "Make primary" switches them.
- **Gemini**: API key from aistudio.google.com. Used for the tutor when chosen, and as the independent fact checker for current affairs when a key is set.
- When no provider answers, the tutor replies from saved notes and says so; the reason shows on Admin → Today and Admin → AI.

### Scheduled jobs (external cron)

The hosted API sleeps on the free tier, so an external cron (for example cron-job.org) must wake it. Both calls send the header `x-cron-secret: <CRON_SECRET>`.

| Time (IST) | Call | Does |
|---|---|---|
| 02:55 | `POST /api/v1/internal/jobs/daily-mocks` | Prepares each active student's daily mock |
| 03:00 | `POST /api/v1/internal/jobs/current-affairs` | Yesterday's verified current affairs, 2 months of the 18-month archive, then practice questions from new items |

Both are safe to call again: finished days and months are skipped.

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Student | anitha@arivuvazhi.in | Student@12345 |
| Admin | admin@arivuvazhi.in | Admin@12345 |

## What Release 1 includes

- Student registration, login, refresh-token rotation and onboarding
- Exam catalogue, syllabus progress, practice with explanations and Easy → Medium → Hard levels
- Daily personal mock per exam with a server timer, autosave, one attempt per day and deterministic scoring
- Rights-gated PYQ papers
- AI Tutor (ChatGPT, Gemini, OpenAI or Ollama) grounded in approved notes, with copyable replies
- **Daily current affairs**: AI-collected, verified by three independent checks, in English and Tamil, with an 18-month archive, date / range / category filters, a quick quiz and practice questions
- Study planner, analytics, notes, notifications and support tickets
- Offline practice sync with idempotency keys
- Admin: Today page (mocks, AI status, current affairs, pending work), content approval, question bank, students, AI settings, audit and costs

Detailed documentation: [ArivuVazhi_Complete_Documentation](ArivuVazhi_Complete_Documentation/README.md).
