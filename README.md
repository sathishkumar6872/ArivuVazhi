# ArivuVazhi

AI-assisted government exam preparation. This workspace contains the product documents, clickable prototypes, and the Release 1 applications.

## Applications

| App | Path | URL |
|---|---|---|
| API | `backend` | http://localhost:4000 |
| API docs | `backend` | http://localhost:4000/api/docs |
| Student web | `student-web` | http://localhost:3000 |
| Admin portal | `admin-portal` | http://localhost:3001 |
| Student mobile | `student-mobile` | Expo, Android first |

## Run locally

```powershell
npm install --prefix backend
npm install --prefix student-web
npm install --prefix admin-portal
npm install --prefix student-mobile
npm run seed
npm run dev:api
npm run dev:student
npm run dev:admin
```

Start each dev command in its own terminal. Mobile:

```powershell
npm run dev:mobile
```

On an Android emulator set `EXPO_PUBLIC_API_URL=http://10.0.2.2:4000/api/v1` in `student-mobile/.env`.

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Student | anitha@arivuvazhi.in | Student@12345 |
| Admin | admin@arivuvazhi.in | Admin@12345 |

## What Release 1 includes

- Student registration, login, refresh-token rotation and onboarding
- Exam catalogue, syllabus progress, practice with explanations
- Mock tests with a server timer, autosave, one attempt per day and deterministic scoring
- Rights-gated PYQ papers
- AI Tutor grounded in approved notes, with OpenAI or Ollama when configured
- Study planner, analytics, notes, notifications and support tickets
- Offline practice sync with idempotency keys
- Admin content approval, question bank, students, AI settings, audit and costs

Secrets belong in `backend/.env`, which is gitignored. Copy `backend/.env.example` to start. Add `OPENAI_API_KEY` when you want hosted tutor answers. Without it, the tutor answers only from approved knowledge notes.
