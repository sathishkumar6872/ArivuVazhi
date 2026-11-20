# ArivuVazhi — AI Tutor & Knowledge Governance

**Document version:** 2.0  
**Last updated:** 20 November 2026

## 1. AI role

AI supports learning; it does not replace verified syllabus, official exam rules, deterministic scoring or Admin content approval.

## 2. Release 1 AI features

- Tamil, English and Tanglish educational explanations.
- Explain approved syllabus concepts and clarify doubts.
- Summarise approved content and support revision.
- Generate practice questions only within permitted syllabus scope and subject to validation.
- Accept text, image, PDF/document and voice-to-text input.
- Maintain student-specific learning memory with view, correction, reset and disable controls.
- Search conversation history by text, exam and topic.
- Provide feedback capture and admin evaluation workflows.

## 3. Knowledge lifecycle

1. Admin registers source with exam, subject, language, source type, provenance, owner and rights status.
2. Validate file format, size, permission and malware status.
3. Extract text and metadata; OCR scanned documents only where needed.
4. Chunk and index content while preserving page/section/source metadata.
5. Review extraction quality and approve source for retrieval.
6. Retrieve only approved sources with exam/topic/language filters.
7. Monitor stale, disputed or low-quality sources; unpublish or replace through versioned workflow.

## 4. Provider architecture

- Provider abstraction and admin-configurable settings inside the Node.js backend.
- OpenAI API is the initial hosted provider; usage-based pricing must be checked at build and launch time.
- Ollama is for local development/experimentation; production suitability depends on hardware, latency and quality tests.
- Provider selection must not change deterministic practice/mock scoring.
- Implement per-user and global quotas, request limits, token/usage logging, budget thresholds and graceful fallback.

### 4.1 Providers as implemented (20 Nov 2026)

| Provider | Use | Notes |
|---|---|---|
| ChatGPT plan sign-in | Tutor, question generation, current affairs (collect, re-check, write) | Primary + up to 2 backups, tried in order; a rate-limited account is tried last for 5 min. Sign-in only from a `127.0.0.1` backend sharing the server `ENCRYPTION_KEY`. Open deviation, see Decision Register. |
| Gemini API | Tutor (fast mode: no thinking, 15 s per model, 30 s total); current-affairs fact check with Google Search | Optional key in Admin → AI. |
| OpenAI API key / Ollama | Baseline providers | Supported; not the active setup. |

- **No answer from any provider:** the tutor replies from approved notes and starts with "AI tutor is not available right now…"; the response carries `aiAvailable: false` and the reason is stored (`tutorLastError`) for Admin → Today / AI. It clears on the next AI reply.
- **ChatGPT signed out:** the tutor switches to Gemini if Gemini is enabled, otherwise to notes only.
- The per-student daily AI request limit was removed; the monthly budget (`monthlyBudgetInr`) still stops all AI when reached.

## 5. Daily current affairs (AI-only, verified)

Purpose: exam-relevant news for students every morning, with no manual editing.

1. **Collect (03:00 IST):** ChatGPT with web search lists about 10 events from yesterday (IST) with category, 3 points, 3 to 6 atomic facts and 2 to 3 article links. Items covered in the last 3 days are skipped.
2. **Check 1, sources:** at least 2 live links on different sites, one from a trusted outlet (PIB, `.gov.in`/`.nic.in`, The Hindu, Indian Express, DD/AIR, Reuters, BBC and similar). Coaching, job and GK aggregators never count and are never shown.
3. **Check 2, independent fact check:** Gemini with Google Search when a key is set; otherwise a different ChatGPT plan model with its own search. The verdict must be "correct" with no wrong facts and the right date.
4. **Check 3, re-check:** a fresh ChatGPT web search that does not see earlier answers.
5. **Publish:** items passing all three (max 8 a day) get English and Tamil points and one quiz question, written only from the verified facts. Failed items are kept as `rejected` with the reason for the admin.
6. **Students:** each item shows its sources and a "Report wrong" button; 2 reports hide the item and retire its practice questions.

**Archive:** a one-time backfill of the last 18 months runs after the daily feed, 2 months a night (max 25 events a month, each with its real date, same checks).

**Practice questions:** each published item gets easy / medium / hard MCQs (EN + TA) from its facts, under a per-exam "Current Affairs" subject (one topic per month). The standard AI answer check publishes them. These topics never get live AI questions.

Limits: three agreeing checks make errors rare, not impossible; spot-check items before public launch.

## 6. AI guardrails and evaluation

- Ground answers in approved sources wherever the task requires factual exam content.
- Clearly indicate uncertainty and avoid inventing official dates, eligibility rules, syllabus details or answer keys.
- Do not reveal hidden answer keys or bypass mock-test rules.
- Keep student-specific memory and retrieval context isolated.
- Use a representative Tamil/English/Tanglish evaluation set; measure factuality, source support, relevance, language quality and refusal quality.
- Prompt changes require versioning, evaluation, approval and rollback capability.

## 7. Cost controls

- Cache only safe, non-personal reusable outputs where correctness permits.
- Limit context size, file size, request frequency and generated output length.
- Route simple deterministic tasks away from LLM calls.
- Show usage by provider, feature and time period in Admin Operations & Costs.
- Set configurable warnings and hard limits; communicate service limits transparently.
