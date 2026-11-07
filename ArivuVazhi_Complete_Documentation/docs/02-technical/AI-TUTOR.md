# ArivuVazhi — AI Tutor & Knowledge Governance

**Document version:** 2.0  
**Last updated:** 05 November 2026

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

## 5. AI guardrails and evaluation

- Ground answers in approved sources wherever the task requires factual exam content.
- Clearly indicate uncertainty and avoid inventing official dates, eligibility rules, syllabus details or answer keys.
- Do not reveal hidden answer keys or bypass mock-test rules.
- Keep student-specific memory and retrieval context isolated.
- Use a representative Tamil/English/Tanglish evaluation set; measure factuality, source support, relevance, language quality and refusal quality.
- Prompt changes require versioning, evaluation, approval and rollback capability.

## 6. Cost controls

- Cache only safe, non-personal reusable outputs where correctness permits.
- Limit context size, file size, request frequency and generated output length.
- Route simple deterministic tasks away from LLM calls.
- Show usage by provider, feature and time period in Admin Operations & Costs.
- Set configurable warnings and hard limits; communicate service limits transparently.
