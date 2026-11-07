# ArivuVazhi — Product Requirements & Blueprint

**Document version:** 2.0  
**Status:** Approved product direction and Release 1 scope  
**Last updated:** 05 November 2026

## 1. Purpose

This document defines the product vision, Release 1 scope, learner and admin capabilities, product rules, key journeys and quality expectations for ArivuVazhi. It is the primary product reference for implementation.

The product name is **ArivuVazhi**. Version numbers identify documentation revisions only and are not part of the product name.

## 2. Product vision

ArivuVazhi is an AI-assisted government-exam preparation platform for Tamil- and English-speaking aspirants. It helps learners prepare consistently through exam-aligned syllabus tracking, practice, mock examinations, previous-year questions (PYQs), a grounded AI Tutor, study planning and progress analytics.

## 3. Product principles

1. Learning quality and verified content take priority over adding features quickly.
2. Correct scoring, exam rules and assessment integrity are deterministic backend responsibilities; AI must not calculate official marks.
3. Student data and AI learning context must be isolated per authenticated student.
4. AI answers should be grounded in approved sources; uncertainty must be stated or escalated for review.
5. Release 1 remains free to students; minimise fixed infrastructure costs and add services only when justified.
6. Admin approval is required before syllabus, questions, PYQs or AI knowledge sources become student-visible.
7. Build the simplest maintainable architecture first; do not introduce microservices or infrastructure without evidence.

## 4. Release 1 scope

### 4.1 Student capabilities

- Registration, sign-in, profile, education history, preferences and previous-exam history.
- Exam selection and exam-specific syllabus, subject, unit and topic progress.
- Practice MCQs, adaptive practice where configured, explanations and performance reports.
- Exam-specific mock tests with instructions, timer, autosave/recovery, negative marking, submission and result review.
- PYQs only where source provenance and usage rights are verified.
- AI Tutor in Tamil, English and Tanglish; grounded explanations, topic help, revision support and controlled question generation.
- AI Tutor input via text, image, PDF/document and voice-to-text. AI voice responses are excluded from Release 1.
- Study planner, configurable carry-forward, analytics/readiness estimate, personal achievements, bookmarks and notes.
- In-app notifications, support tickets and offline practice with later sync.
- AI learning memory that the student can view, correct, reset or disable; searchable conversation history.

### 4.2 Admin Portal capabilities

- Student and account administration; roles and permission-controlled access.
- Exam, exam pattern, syllabus, subject, unit and topic management.
- Question bank, answer/explanation review, mock-test configuration and PYQ provenance/rights management.
- Content Approval Center and Admin Work Queue with review, approval, rejection and publication states.
- AI Control Center: provider settings, routing, prompts/versioning, evaluation, usage limits, cost monitoring, alerts and rollback.
- Support tickets, feedback, notification management and operational dashboards.
- Bulk import/export, bulk operations, configuration change history and rollback.
- Audit logs for sensitive administrative actions; restricted access to student AI history and memory.

### 4.3 Explicitly out of Release 1

- Study materials/library.
- Student downloads of study materials.
- Payments, subscriptions, premium plans, trials, referrals and promo codes.
- iOS application; Android first.
- AI-generated voice responses / text-to-speech.
- Education certificate uploads.
- Public leaderboards or public student rankings.

## 5. Product rules

| Area | Approved rule |
|---|---|
| Pricing | Release 1 is free to students. |
| Mock attempts | One attempt per mock test per student per day. |
| Profiles | Private by default; no public leaderboard. |
| Device sessions | Admin-configurable session/device policy. |
| Planner | Student-configurable carry-forward behavior. |
| AI memory | Auto-updated; student can view, correct, reset or disable. |
| AI history | Full-text search plus exam/topic filters. |
| Support | In-app support tickets. |
| Question publication | Only approved/published questions can enter practice or mock tests. |
| Exam lifecycle | Draft → Under Review → Published → Revised → Archived/Cancelled. |
| Syllabus lifecycle | Draft → Validation → Admin Approval → Publish. |

## 6. Key learner journeys

1. **Onboard:** create account → set language/preferences → select target exam → see personalised dashboard.
2. **Learn and practise:** choose exam → browse syllabus → study topic → practise questions → review explanations → update progress.
3. **Mock examination:** open mock → read instructions → complete timed sections → submit → deterministic scoring → review result and weak areas.
4. **AI Tutor:** ask a question → retrieve approved context → generate grounded explanation → show source references where available → collect feedback.
5. **Study planning:** set goals → receive daily plan → complete tasks → view analytics and adjust plan.
6. **Offline practice:** practise offline → store actions locally → reconnect → sync idempotently → resolve conflicts using server-authoritative rules.

## 7. Quality requirements

- Strict student ownership checks on every profile, note, bookmark, attempt, planner and AI-memory operation.
- Never trust a client-supplied `studentId` as proof of ownership.
- Do not expose answer keys before the assessment flow allows it.
- Scoring must correctly handle correct, incorrect, unanswered and negative-marking cases.
- Duplicate submissions and sync retries must be idempotent.
- Support Tamil and English UI/content; AI Tutor may also accept Tanglish.
- Provide accessible, responsive web layouts and reliable Android-first mobile experience.
- Privacy notices, consent, retention and minor-safety requirements require qualified India-specific legal review before public launch.

## 8. Success measures

- Activation: learner completes onboarding and selects an exam.
- Engagement: weekly active learners, completed study tasks and practice sessions.
- Learning: topic mastery progression, mock-test improvement and reduced repeated errors.
- Quality: verified-content coverage, question correction rate, AI groundedness and learner feedback.
- Reliability: crash-free sessions, API availability, sync success and recovery success.
- Cost: AI cost per active learner and monthly infrastructure spend.

## 9. Open validation items

- Select the first launch exam and obtain its current official syllabus and exam pattern.
- Verify PYQ copyright/licensing and all source permissions.
- Confirm DPDP/privacy obligations, consent, minor safeguards, retention and deletion with qualified counsel.
- Verify MongoDB Atlas Free Tier, hosting, file storage, notification and AI provider limits/pricing at implementation time.
- Evaluate Tamil/English AI answer quality and local Ollama feasibility with representative test sets.
- Validate backup/restore and recovery targets against actual provider capabilities.
