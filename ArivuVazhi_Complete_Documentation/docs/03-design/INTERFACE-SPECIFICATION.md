# ArivuVazhi — Admin Portal, Student Web & Mobile Specification

**Document version:** 2.0  
**Last updated:** 05 November 2026

## 1. Interface set

| Interface | Primary purpose | Main navigation / areas |
|---|---|---|
| Admin Portal (desktop-first) | Operate and govern platform content, learners and AI | Overview, Students, Examinations, Syllabus, Question Bank, PYQ Management, AI Control Center, Content Approval, Support & Feedback, Notifications, Operations & Costs |
| Student Web (responsive) | Full browser-based learner experience | Dashboard, My Exams, Practice, Mock Tests, AI Tutor, Study Planner, Analytics, My Profile |
| Student Mobile (Android-first) | Daily learner experience on mobile | Home, Exams, Practice, AI Tutor, Profile; planner and mock tests accessible from relevant flows |

## 2. Admin Portal functional areas

- **Overview:** operational metrics, pending approvals, student activity, content health and cost alerts.
- **Students:** search, filters, profile/account status and support context; restrict sensitive data.
- **Examinations:** create/edit exam programmes, patterns, sections, marking rules and lifecycle.
- **Syllabus:** hierarchical syllabus management, versioning, validation and approval.
- **Question Bank:** author/import, tag, validate, review, publish and retire questions.
- **PYQ Management:** source metadata, year/exam mapping, rights status, verification and release controls.
- **AI Control Center:** provider configuration, routing, prompts, test runs, evaluation, budgets, alerts and rollback.
- **Content Approval:** queue, reviewer assignment, approval/rejection and publication history.
- **Support & Feedback:** tickets, categorisation, status, response and audit trail.
- **Notifications:** in-app/push/email templates, targeting, scheduling and delivery status.
- **Operations & Costs:** job health, usage, AI spend, quotas, sync health, import/export and configuration changes.

## 3. Student Web and Mobile functional areas

- **Dashboard:** selected exam, progress, next task, quick actions and recent activity.
- **My Exams:** exam selection, exam pattern, syllabus and preparation progress.
- **Practice:** topic/difficulty filters, question flow, answer feedback and practice history.
- **Mock Tests:** instructions, timed attempt, autosave, submission, result and review.
- **AI Tutor:** text/image/document/voice-to-text input; language selection; grounded answer and searchable history.
- **Study Planner:** daily/weekly tasks, completion, configurable carry-forward and reminders.
- **Analytics:** topic mastery, accuracy, consistency, mock trends and readiness estimate with caveats.
- **My Profile:** personal details, education history, language/preferences, privacy and AI memory controls.

## 4. Navigation and UX principles

- Use the separate clickable prototypes as the initial visual baseline, not as production implementation code.
- Keep a shared design language across all three interfaces; optimise density and interaction per device.
- Provide clear empty, loading, error, offline and permission-denied states.
- Ensure touch targets, keyboard navigation, focus visibility and accessible contrast.
- Keep AI Tutor and Study Planner discoverable from the student dashboard.
- Use real approved content only after content governance is operational.

## 5. Prototype limitations

The prototypes are sample-data visual demonstrations. They do not implement authentication, database access, API calls, AI, notifications, sync or production validation. Non-functional controls may show placeholder messages. Their purpose is to review layout, navigation and visual direction before implementation.
