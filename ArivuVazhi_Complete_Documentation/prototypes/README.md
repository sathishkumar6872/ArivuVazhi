# ArivuVazhi — Separate Product Prototypes

This package contains three separate concept prototypes:
1. `admin-portal/index.html` — Admin Portal
2. `student-web/index.html` — Student Web
3. `student-mobile/index.html` — Mobile-first student app experience

## How to open
Open each `index.html` file in a modern browser. No installation, dependencies or server are required.

## Design direction
- Clean, premium, calm education product UI.
- Blue/navy identity with light surfaces and clear hierarchy.
- Admin: dense desktop workspace, work queue, governance and operational visibility.
- Student Web: spacious learning dashboard and full feature navigation.
- Mobile: narrow mobile-first layout with bottom navigation matching the approved mobile information architecture.

## Important limitations
These are interactive visual prototypes using sample data. They are not connected to authentication, database, backend, AI provider, notifications or real exam content. Buttons that show a toast are visual workflow placeholders. Timers, scoring, data persistence, RBAC, secure file handling and AI isolation must be implemented and tested in the real application.

## Approved implementation baseline
Admin and Student Web: Next.js App Router + TypeScript + MUI.
Mobile: React Native, Android first.
Backend: Node.js + Express + TypeScript.
AI: module within the Node.js backend.
Database: MongoDB Atlas Free Tier initially.
Do not treat these static HTML prototypes as production code or as a replacement for implementation specifications.
