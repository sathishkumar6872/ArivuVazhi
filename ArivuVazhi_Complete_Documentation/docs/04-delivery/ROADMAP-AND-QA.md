# ArivuVazhi — Development Roadmap, QA & Release Gates

**Document version:** 2.0  
**Last updated:** 05 November 2026

## 1. Delivery approach

Build incrementally in separate repositories, with API contracts and testable vertical slices. Do not attempt to implement every collection or screen before the first end-to-end learner journey works.

## 2. Suggested implementation sequence

1. **Repository and engineering foundation:** separate Admin Web, Student Web, Student Mobile and Backend repositories; lint/type-check/build pipelines; environment setup.
2. **Backend foundation:** MongoDB connection, configuration, logging, validation, error handling, OpenAPI and health checks.
3. **Identity and access:** registration/login, JWT refresh rotation, Argon2, RBAC and student ownership enforcement.
4. **Admin foundation:** exam catalogue, roles, student management and audit trail.
5. **Student foundation:** onboarding, exam selection, dashboard and profile.
6. **Content foundation:** syllabus hierarchy, versioning, approval workflow and question bank.
7. **Practice engine:** deterministic question delivery, answer feedback, history and progress.
8. **Mock engine:** configuration snapshot, timer, autosave/recovery, submission, negative marking and result review.
9. **PYQ workflow:** provenance, rights verification, approval and student presentation.
10. **AI knowledge and Tutor:** source ingestion, retrieval, provider adapter, prompts, memory controls and evaluation.
11. **Planner, analytics, notifications, support and offline sync.**
12. **Security, accessibility, performance, recovery drills, pilot and release readiness.**

## 3. Quality gates

- Unit tests for validation, scoring, permissions and progress calculations.
- Integration tests for API/database, auth, ownership, AI provider adapter and sync.
- Contract tests against OpenAPI schemas.
- Web/mobile UI tests for navigation, forms, loading/error/offline/accessibility states.
- End-to-end learner journey from onboarding through practice and mock result.
- Security tests for cross-student access, privilege escalation, token misuse, rate limits and upload validation.
- Restore drill and backup verification before production data is accepted.

## 4. Rough effort estimate

Earlier planning estimate: approximately **1,800–2,600 engineering hours**, or roughly **12–18 months for one developer working 30–40 hours per week**. This is a planning range only; it depends heavily on first-exam scope, content preparation, integrations, QA and available weekly time.

## 5. Validation before public launch

- Select first exam and confirm official syllabus/pattern source.
- Confirm PYQ and third-party content rights.
- Obtain India-specific privacy/legal review, including minor safeguards.
- Verify current hosting/database/AI provider pricing and limits.
- Run Tamil/English AI quality and safety evaluation.
- Complete backup/restore, incident response and support workflows.

## 6. Change control

Any change to approved Release 1 scope or technology must be recorded with the reason, impact on cost/security/timeline, migration implications and explicit approval. Update the decision register and affected documents together.
