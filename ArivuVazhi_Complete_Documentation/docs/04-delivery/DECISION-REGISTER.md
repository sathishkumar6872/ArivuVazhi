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

## Decisions requiring validation

- First launch exam and official content sources.
- PYQ rights/licensing.
- India-specific privacy/legal requirements.
- Current free-tier quotas, AI provider pricing and storage constraints.
- Tamil/English/Tanglish AI quality.
- Backup and recovery capability.

Changes require impact review and explicit approval.
