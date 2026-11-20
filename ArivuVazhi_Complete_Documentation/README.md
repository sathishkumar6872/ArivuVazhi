# ArivuVazhi — Complete Project Documentation

**Documentation version:** 2.0  
**Project name:** ArivuVazhi  
**Last updated:** 20 November 2026

> The product name is **ArivuVazhi**. “2.0” is not part of the product name; it refers only to an earlier documentation/version label.

## Purpose

This repository contains the current consolidated product and engineering baseline for building ArivuVazhi. It includes product requirements, technical architecture, AI Tutor design, interface specifications, delivery roadmap, decision register and the three separate clickable prototypes.

## Documentation index

1. [Product Requirements & Blueprint](docs/01-product/PRODUCT-BLUEPRINT.md)
2. [Technical Architecture, Security & Data](docs/02-technical/TECHNICAL-ARCHITECTURE.md)
3. [AI Tutor & Knowledge Governance](docs/02-technical/AI-TUTOR.md)
4. [Admin Portal, Student Web & Mobile Specification](docs/03-design/INTERFACE-SPECIFICATION.md)
5. [Development Roadmap, QA & Release Gates](docs/04-delivery/ROADMAP-AND-QA.md)
6. [Decision Register](docs/04-delivery/DECISION-REGISTER.md)

## Recent changes

The 20 November 2026 changes (Flutter app, mobile design system, AI provider fallbacks, daily verified current affairs with archive and practice questions, admin Today page) are recorded in the [Decision Register](docs/04-delivery/DECISION-REGISTER.md). Setup and cron steps are in the repository [README](../README.md).

## Prototypes

- `prototypes/admin-portal/index.html`
- `prototypes/student-web/index.html`
- `prototypes/student-mobile/index.html`

## Approved technology baseline

| Area | Technology |
|---|---|
| Admin Portal | Next.js App Router, TypeScript, MUI |
| Student Web | Next.js App Router, TypeScript, MUI |
| Student Mobile | Flutter (Dart); Android first. Replaced React Native on 17 Nov 2026 |
| Backend | Node.js, Express.js, TypeScript |
| AI | Node backend module; OpenAI API, Ollama for local experimentation |
| Database | MongoDB Atlas Free Tier initially |
| Authentication | JWT access/refresh tokens, Argon2 |
| API | Versioned REST, OpenAPI |
| Architecture | Modular monolith |

## Important implementation principles

- Build in small, tested vertical slices.
- Keep the three applications in separate repositories.
- Keep AI inside the Node.js backend for Release 1; do not create a separate Python/FastAPI service.
- Do not introduce Redis, S3, Vite, TailwindCSS, Kubernetes or microservices in Release 1.
- Keep exam scoring and exam rules deterministic on the backend.
- Enforce strict student data isolation.
- Use only approved, rights-verified content for student-facing learning.
- Review the prototypes and approve screen-level UX before production UI implementation.

## Prototype limitation

The included prototypes are clickable visual references with sample data. They do not implement production authentication, backend APIs, database persistence, AI, notifications or offline synchronisation.

## Change control

This documentation is the current baseline. If an implementation decision changes, update the relevant document and decision register, including rationale, security/cost/timeline impact and approval. Legal requirements, source rights, provider pricing and free-tier limits must be validated before public launch.
