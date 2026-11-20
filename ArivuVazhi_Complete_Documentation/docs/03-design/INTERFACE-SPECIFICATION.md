# ArivuVazhi — Admin Portal, Student Web & Mobile Specification

**Document version:** 2.0  
**Last updated:** 20 November 2026

## 1. Interface set

| Interface | Primary purpose | Main navigation / areas |
|---|---|---|
| Admin Portal (desktop-first) | Operate and govern platform content, learners and AI | Today (was Overview), Students, Examinations, Syllabus, Question Bank, PYQ Management, AI Control Center, Content Approval, Support & Feedback, Notifications, Operations & Costs |
| Student Web (responsive) | Full browser-based learner experience | Dashboard, My Exams, Practice, Mock Tests, AI Tutor, Study Planner, Analytics, My Profile |
| Student Mobile (Flutter, Android-first) | Daily learner experience on mobile | Home, Exams, AI Tutor (raised centre button), Practice, Profile; planner, mock tests and current affairs reached from Home |

## 2. Admin Portal functional areas

- **Today (was Overview):** one screen that answers "does anything need me?": daily mocks (ready / preparing / failed with Retry failed), AI tutor status and last error, current affairs (published, dropped, archive progress, Run now) and pending approvals / flagged questions / support tickets.
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
- **AI Tutor:** text/image/document/voice-to-text input; language selection; grounded answer and searchable history; "Tutor is typing" indicator; copy a reply as plain text.
- **Current Affairs:** Home card for the latest verified day; list with category, points, source links and "Report wrong"; filters: Latest, 7 days, 30 days, 3 months, Pick dates (one day or a range) and category; results grouped by date; quick quiz from the filtered items. Practice also has a "Current Affairs" subject with one topic per month.
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

## 5. Mobile visual design (implemented 20 Nov 2026)

- **Light:** soft green-white gradient background with a faint glow, white cards with deep soft shadows, gradient hero cards (home score, profile, tutor), glowing gradient primary buttons, floating white tab bar.
- **Dark:** glassmorphism. Translucent cards and inputs with hairline borders over an emerald-black backdrop with green/teal glow; frosted floating tab bar, action bars, dialogs and sheets. All screens share the same glass treatment.
- **Colour roles:** forest green `#16A34A` for main actions and progress, deep green `#0B3D2E` for headings and hero cards, gold only for rewards (streak flame, earned achievements), blue for info banners, red for errors and wrong answers, green for correct answers.
- **Hierarchy:** one solid primary action per screen; secondary actions are outline/glass; quiz, mock and PYQ actions are pinned at the bottom.
- **Type:** Poppins for headings (Tamil falls back to the system Tamil font), system font for body text.
- **Motion (light):** screen fade/slide, staggered list entrance, press scale, ring and progress fill with count-up, sliding segment pill, correct-answer pulse and wrong-answer shake, typing dots, gently floating AI tab button (still when the system reduces motion).

## 6. Prototype limitations

The prototypes are sample-data visual demonstrations. They do not implement authentication, database access, API calls, AI, notifications, sync or production validation. Non-functional controls may show placeholder messages. Their purpose is to review layout, navigation and visual direction before implementation.
