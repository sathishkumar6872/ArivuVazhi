import mongoose, { Schema } from "mongoose";

const optionSchema = new Schema(
  { key: { type: String, required: true }, text: { type: String, required: true } },
  { _id: false },
);

const answerSchema = new Schema(
  {
    questionId: { type: String, required: true },
    selectedKey: { type: String, default: "" },
    markedForReview: { type: Boolean, default: false },
    correct: { type: Boolean, default: false },
    answeredAt: { type: Date },
  },
  { _id: false },
);

export const User = mongoose.model(
  "User",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      passwordHash: { type: String, required: true, select: false },
      role: { type: String, enum: ["student", "admin", "reviewer"], required: true },
      firstName: { type: String, required: true },
      lastName: { type: String, default: "" },
      phone: { type: String, default: "" },
      language: { type: String, enum: ["ta", "en"], default: "en" },
      status: { type: String, enum: ["active", "inactive", "suspended"], default: "active" },
      onboardingComplete: { type: Boolean, default: false },
      education: {
        type: [{ level: String, institution: String, year: String }],
        default: [],
      },
      examHistory: {
        type: [{ examName: String, year: String, result: String }],
        default: [],
      },
      preferences: {
        carryForward: { type: Boolean, default: true },
        notifications: { type: Boolean, default: true },
        appLanguage: { type: String, enum: ["ta", "en"], default: "en" },
      },
      aiMemoryEnabled: { type: Boolean, default: true },
      primaryExamId: { type: String, default: "" },
      examIds: { type: [String], default: [] },
      streak: { type: Number, default: 0 },
      lastActiveDate: { type: String, default: "" },
    },
    { timestamps: true },
  ),
);

export const RefreshToken = mongoose.model(
  "RefreshToken",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      userId: { type: String, required: true, index: true },
      tokenHash: { type: String, required: true, unique: true },
      expiresAt: { type: Date, required: true },
      revokedAt: { type: Date, default: null },
    },
    { timestamps: true },
  ),
);

export const Exam = mongoose.model(
  "Exam",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      name: { type: String, required: true },
      code: { type: String, required: true, unique: true },
      authority: { type: String, required: true },
      description: { type: String, default: "" },
      lifecycle: {
        type: String,
        enum: ["draft", "under_review", "published", "revised", "archived", "cancelled"],
        default: "draft",
      },
      version: { type: String, default: "2026.1" },
      pattern: {
        durationMinutes: { type: Number, default: 180 },
        totalQuestions: { type: Number, default: 200 },
        marksPerQuestion: { type: Number, default: 1.5 },
        negativeMarks: { type: Number, default: 0 },
        sections: { type: [{ name: String, questionCount: Number }], default: [] },
      },
    },
    { timestamps: true },
  ),
);

export const Subject = mongoose.model(
  "Subject",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      examId: { type: String, required: true, index: true },
      /** Display fallback (usually English). Prefer nameEn / nameTa in API. */
      name: { type: String, required: true },
      nameEn: { type: String, default: "" },
      nameTa: { type: String, default: "" },
      order: { type: Number, default: 0 },
      status: { type: String, enum: ["draft", "validation", "approved", "published"], default: "draft" },
    },
    { timestamps: true },
  ),
);

export const Topic = mongoose.model(
  "Topic",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      examId: { type: String, required: true, index: true },
      subjectId: { type: String, required: true, index: true },
      name: { type: String, required: true },
      nameEn: { type: String, default: "" },
      nameTa: { type: String, default: "" },
      order: { type: Number, default: 0 },
      status: { type: String, enum: ["draft", "validation", "approved", "published"], default: "draft" },
    },
    { timestamps: true },
  ),
);

export const Question = mongoose.model(
  "Question",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      examId: { type: String, required: true, index: true },
      subjectId: { type: String, required: true },
      topicId: { type: String, required: true },
      stem: { type: String, required: true },
      options: { type: [optionSchema], required: true },
      correctKey: { type: String, required: true },
      explanation: { type: String, default: "" },
      difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
      language: { type: String, enum: ["en", "ta"], default: "en" },
      /** Where it came from. student_ai / daily_mock = AI-generated for a student's practice / daily mock. */
      source: { type: String, enum: ["admin", "ai", "pyq", "student_ai", "daily_mock"], default: "student_ai" },
      /**
       * The student an AI question was generated for. While `under_review` only that
       * student sees it; once published (by the AI check or an admin) it joins the
       * exam's shared pool used by every student's practice and daily mock.
       */
      ownerStudentId: { type: String, default: "" },
      /** Who published it: "auto" (AI answer check), an admin's id, or "" (not reviewed). */
      reviewedBy: { type: String, default: "" },
      /** Hidden from every student until an admin looks at it (student reports, wrong-key signal, failed AI check). */
      flagged: { type: Boolean, default: false },
      flagReason: { type: String, default: "" },
      reportCount: { type: Number, default: 0 },
      /** Practice answers across all students, for the "key may be wrong" signal. */
      stats: { answered: { type: Number, default: 0 }, correct: { type: Number, default: 0 } },
      /** Normalised stem used to reject duplicate AI questions. */
      stemKey: { type: String, default: "" },
      status: {
        type: String,
        enum: ["draft", "under_review", "published", "rejected", "retired"],
        default: "draft",
      },
      pyqYear: { type: Number, default: null },
      /** Original PYQs: the paper and question number they came from. */
      pyqPaperId: { type: String, default: "" },
      pyqNumber: { type: Number, default: null },
      pyqDocumentId: { type: String, default: "" },
      pyqPage: { type: Number, default: null },
      /** Where the answer came from. AI answers are never "official". */
      keyStatus: { type: String, enum: ["", "official_final", "official_revised", "official_tentative", "admin", "unverified"], default: "" },
      /** Possible duplicate of another question (kept for admin review, never silently removed). */
      duplicateOf: { type: String, default: "" },
      /** Format, for pattern analysis: direct, statement, match, assertion_reason, sequence, odd_one_out, fill_blank, other. */
      questionType: { type: String, default: "" },
      /** Finer topic label (free text from extraction or admin), for pattern analysis. */
      subtopic: { type: String, default: "" },
      /** Option the paper visibly marks, as read by AI. Only a suggestion: never used as the answer until an admin accepts it. */
      aiSuggestedKey: { type: String, default: "" },
      rightsStatus: { type: String, enum: ["pending", "verified", "rejected", "not_applicable"], default: "not_applicable" },
      marks: { type: Number, default: 1.5 },
    },
    { timestamps: true },
  ),
);

export const QuestionChangeLog = mongoose.model(
  "QuestionChangeLog",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      questionId: { type: String, required: true, index: true },
      actorId: { type: String, required: true },
      reason: { type: String, required: true },
      oldCorrectKey: { type: String, default: "" },
      newCorrectKey: { type: String, default: "" },
      oldAnswerMistake: { type: String, default: "" },
      newAnswerWhyCorrect: { type: String, default: "" },
      before: { type: Schema.Types.Mixed, default: {} },
      after: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: true },
  ),
);

export const SyllabusSnapshot = mongoose.model(
  "SyllabusSnapshot",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      examId: { type: String, required: true, index: true },
      year: { type: Number, required: true, index: true },
      versionLabel: { type: String, default: "" },
      source: { type: String, enum: ["ai_search", "manual_seed", "import"], default: "ai_search" },
      status: { type: String, enum: ["draft", "active", "archived"], default: "active" },
      subjects: {
        type: [
          {
            name: String,
            nameEn: String,
            nameTa: String,
            topics: [
              {
                name: String,
                nameEn: String,
                nameTa: String,
              },
            ],
          },
        ],
        default: [],
      },
      notes: { type: String, default: "" },
      fetchedAt: { type: Date, default: Date.now },
    },
    { timestamps: true },
  ),
);

export const AppFeedback = mongoose.model(
  "AppFeedback",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      studentId: { type: String, required: true, index: true },
      category: {
        type: String,
        enum: ["app_update", "new_feature", "bug", "general"],
        default: "general",
      },
      rating: { type: Number, min: 1, max: 5, default: null },
      message: { type: String, required: true },
      appVersion: { type: String, default: "" },
      status: { type: String, enum: ["new", "reviewed", "planned", "done"], default: "new" },
    },
    { timestamps: true },
  ),
);

export const PracticeSession = mongoose.model(
  "PracticeSession",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      studentId: { type: String, required: true, index: true },
      examId: { type: String, required: true },
      topicId: { type: String, default: "" },
      difficulty: { type: String, default: "" },
      questionIds: { type: [String], default: [] },
      answers: { type: [answerSchema], default: [] },
      /** abandoned = the student started another set before finishing; its unanswered questions are free again. */
      status: { type: String, enum: ["active", "completed", "abandoned"], default: "active" },
      /** retry = re-practising the wrong answers of `retryOf`; never counted in progress. */
      kind: { type: String, enum: ["practice", "retry"], default: "practice" },
      retryOf: { type: String, default: "" },
      startedAt: { type: Date, default: Date.now },
      completedAt: { type: Date, default: null },
    },
    { timestamps: true },
  ),
);

export const MockTest = mongoose.model(
  "MockTest",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      examId: { type: String, required: true, index: true },
      title: { type: String, required: true },
      questionIds: { type: [String], default: [] },
      durationMinutes: { type: Number, required: true },
      marksPerQuestion: { type: Number, required: true },
      negativeMarks: { type: Number, required: true },
      instructions: { type: [String], default: [] },
      status: { type: String, enum: ["draft", "published", "archived"], default: "draft" },
      /**
       * admin = authored in the admin portal; daily = the one per-exam mock whose
       * questions are generated fresh for each student every day from the exam pattern.
       */
      kind: { type: String, enum: ["admin", "daily"], default: "admin" },
    },
    { timestamps: true },
  ),
);

MockTest.schema.index({ examId: 1, kind: 1 }, { unique: true, partialFilterExpression: { kind: "daily" } });

export const MockAttempt = mongoose.model(
  "MockAttempt",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      mockId: { type: String, required: true, index: true },
      studentId: { type: String, required: true, index: true },
      idempotencyKey: { type: String, default: "" },
      dayKey: { type: String, required: true },
      /**
       * Snapshot taken at start so later edits to the shared mock (questions or
       * marking rules) never change an attempt in progress or its score.
       * Empty on attempts created before snapshots existed; readers fall back to the mock.
       */
      questionIds: { type: [String], default: [] },
      marksPerQuestion: { type: Number, default: null },
      negativeMarks: { type: Number, default: null },
      startedAt: { type: Date, default: Date.now },
      deadlineAt: { type: Date, required: true },
      submittedAt: { type: Date, default: null },
      answers: { type: [answerSchema], default: [] },
      status: { type: String, enum: ["in_progress", "submitted"], default: "in_progress" },
      rawScore: { type: Number, default: null },
      maxScore: { type: Number, default: null },
      correctCount: { type: Number, default: 0 },
      incorrectCount: { type: Number, default: 0 },
      unansweredCount: { type: Number, default: 0 },
    },
    { timestamps: true },
  ),
);

MockAttempt.schema.index({ studentId: 1, mockId: 1, dayKey: 1 }, { unique: true });

export const KnowledgeSource = mongoose.model(
  "KnowledgeSource",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      examId: { type: String, default: "" },
      topicId: { type: String, default: "" },
      title: { type: String, required: true },
      language: { type: String, enum: ["en", "ta", "tanglish"], default: "en" },
      sourceType: { type: String, default: "notes" },
      rightsStatus: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
      text: { type: String, required: true },
      status: { type: String, enum: ["draft", "under_review", "approved", "retired"], default: "draft" },
    },
    { timestamps: true },
  ),
);

export const Conversation = mongoose.model(
  "Conversation",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      studentId: { type: String, required: true, index: true },
      examId: { type: String, default: "" },
      language: { type: String, default: "en" },
      title: { type: String, default: "New conversation" },
      messages: {
        type: [
          {
            role: { type: String, enum: ["user", "assistant"] },
            content: String,
            sources: [String],
            createdAt: { type: Date, default: Date.now },
          },
        ],
        default: [],
      },
    },
    { timestamps: true },
  ),
);

export const MemoryItem = mongoose.model(
  "MemoryItem",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      studentId: { type: String, required: true, index: true },
      text: { type: String, required: true },
      active: { type: Boolean, default: true },
    },
    { timestamps: true },
  ),
);

export const PlannerTask = mongoose.model(
  "PlannerTask",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      studentId: { type: String, required: true, index: true },
      examId: { type: String, default: "" },
      title: { type: String, required: true },
      dueDate: { type: String, required: true },
      minutes: { type: Number, default: 30 },
      status: { type: String, enum: ["pending", "completed", "skipped"], default: "pending" },
    },
    { timestamps: true },
  ),
);

export const Bookmark = mongoose.model(
  "Bookmark",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      studentId: { type: String, required: true, index: true },
      questionId: { type: String, required: true },
    },
    { timestamps: true },
  ),
);

Bookmark.schema.index({ studentId: 1, questionId: 1 }, { unique: true });

export const Note = mongoose.model(
  "Note",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      studentId: { type: String, required: true, index: true },
      topicId: { type: String, default: "" },
      body: { type: String, required: true },
    },
    { timestamps: true },
  ),
);

export const Notification = mongoose.model(
  "Notification",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      userId: { type: String, default: "" },
      title: { type: String, required: true },
      body: { type: String, required: true },
      channel: { type: String, enum: ["in_app", "email", "push"], default: "in_app" },
      status: { type: String, enum: ["draft", "scheduled", "delivered"], default: "delivered" },
      readBy: { type: [String], default: [] },
    },
    { timestamps: true },
  ),
);

export const Ticket = mongoose.model(
  "Ticket",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      studentId: { type: String, required: true, index: true },
      subject: { type: String, required: true },
      body: { type: String, required: true },
      category: { type: String, default: "general" },
      priority: { type: String, enum: ["normal", "high"], default: "normal" },
      status: { type: String, enum: ["open", "in_progress", "resolved"], default: "open" },
      replies: {
        type: [{ authorId: String, authorRole: String, body: String, createdAt: { type: Date, default: Date.now } }],
        default: [],
      },
    },
    { timestamps: true },
  ),
);

export const AuditLog = mongoose.model(
  "AuditLog",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      actorId: { type: String, required: true },
      action: { type: String, required: true },
      entity: { type: String, required: true },
      entityId: { type: String, default: "" },
      meta: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: true },
  ),
);

/** Per-student mock question set generated by the 02:00 IST daily job. */
export const DailyMockSet = mongoose.model(
  "DailyMockSet",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      studentId: { type: String, required: true, index: true },
      mockId: { type: String, required: true },
      examId: { type: String, required: true },
      dayKey: { type: String, required: true },
      questionIds: { type: [String], default: [] },
      status: { type: String, enum: ["generating", "ready", "failed"], default: "generating" },
      error: { type: String, default: "" },
      provider: { type: String, default: "" },
      /** When the current generation attempt began; a stale "generating" set is retried. */
      startedAt: { type: Date, default: null },
      /** Questions the exam pattern asks for, and how many are generated so far. */
      target: { type: Number, default: 0 },
      progress: { type: Number, default: 0 },
      /**
       * Per-section plan mirroring the exam pattern. Kept across retries so a failed
       * run continues where it stopped instead of regenerating everything.
       */
      sections: {
        type: [{ _id: false, name: String, subjectId: String, target: Number, questionIds: { type: [String], default: [] } }],
        default: [],
      },
    },
    { timestamps: true },
  ),
);

DailyMockSet.schema.index({ studentId: 1, mockId: 1, dayKey: 1 }, { unique: true });

export const JobRun = mongoose.model(
  "JobRun",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      job: { type: String, required: true, index: true },
      dayKey: { type: String, required: true },
      trigger: { type: String, enum: ["schedule", "boot", "manual"], default: "schedule" },
      status: { type: String, enum: ["running", "done", "failed"], default: "running" },
      ready: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      finishedAt: { type: Date, default: null },
      error: { type: String, default: "" },
    },
    { timestamps: true },
  ),
);

/**
 * Cross-process lease for scheduled jobs: one document per job. A holder must
 * renew `lockedUntil`; a crashed holder's lease simply expires.
 */
export const JobLock = mongoose.model(
  "JobLock",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      owner: { type: String, default: "" },
      /** The JobRun the holder is executing, so refused triggers can point at it. */
      runId: { type: String, default: "" },
      lockedUntil: { type: Date, default: () => new Date(0) },
    },
    { timestamps: true },
  ),
);

export const SyncReceipt = mongoose.model(
  "SyncReceipt",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      studentId: { type: String, required: true },
      idempotencyKey: { type: String, required: true },
      response: { type: Schema.Types.Mixed, required: true },
    },
    { timestamps: true },
  ),
);

SyncReceipt.schema.index({ studentId: 1, idempotencyKey: 1 }, { unique: true });

export const AppConfig = mongoose.model(
  "AppConfig",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      maxSessions: { type: Number, default: 5 },
      aiProvider: { type: String, enum: ["local", "chatgpt", "openai", "gemini", "ollama"], default: "local" },
      /** AI for PYQ discovery and extraction: auto = the active provider. OCR always uses Gemini. */
      pyqProvider: { type: String, enum: ["auto", "chatgpt", "gemini"], default: "auto" },
      chatgptEnabled: { type: Boolean, default: false },
      geminiEnabled: { type: Boolean, default: false },
      monthlyBudgetInr: { type: Number, default: 500 },
      perUserDailyAiLimit: { type: Number, default: 40 },
      activePrompt: { type: String, default: "" },
      promptVersion: { type: String, default: "1.0" },
      openaiApiKey: { type: String, default: "", select: false },
      openaiModel: { type: String, default: "gpt-4o-mini" },
      geminiApiKey: { type: String, default: "", select: false },
      geminiModel: { type: String, default: "auto" },
      geminiLastUsedModel: { type: String, default: "" },
      geminiModels: { type: [String], default: [] },
      geminiEnabledModels: { type: [String], default: [] },
      geminiLastError: { type: String, default: "" },
      geminiLastCheckedAt: { type: Date, default: null },
      /** Last reason the AI Tutor fell back to saved notes (cleared when an AI reply succeeds). */
      tutorLastError: { type: String, default: "" },
      tutorLastErrorAt: { type: Date, default: null },
      chatgptHostId: { type: String, default: "" },
      chatgptOauthClientId: { type: String, default: "" },
      chatgptEncryptedTokens: { type: String, default: "", select: false },
      chatgptAccount: { type: String, default: "" },
      chatgptScopes: { type: [String], default: [] },
      chatgptStatus: { type: String, enum: ["not_configured", "connected", "error"], default: "not_configured" },
      chatgptLastError: { type: String, default: "" },
      chatgptConnectedAt: { type: Date, default: null },
      chatgptLastCheckedAt: { type: Date, default: null },
      chatgptModels: { type: [String], default: [] },
      chatgptEnabledModels: { type: [String], default: [] },
      /**
       * Extra ChatGPT sign-ins (test setups). When the main account fails or hits its plan
       * limit, AI calls fall back to these in order. Each has its own app registration.
       */
      chatgptBackupAccounts: {
        type: [
          new Schema(
            {
              id: { type: String, required: true },
              clientId: { type: String, default: "" },
              encryptedTokens: { type: String, default: "" },
              account: { type: String, default: "" },
              scopes: { type: [String], default: [] },
              status: { type: String, enum: ["connected", "error"], default: "connected" },
              lastError: { type: String, default: "" },
              connectedAt: { type: Date, default: null },
            },
            { _id: false },
          ),
        ],
        default: [],
        select: false,
      },
    },
    { timestamps: true },
  ),
);

export const AiUsage = mongoose.model(
  "AiUsage",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      userId: { type: String, required: true, index: true },
      provider: { type: String, required: true },
      feature: { type: String, required: true },
      tokens: { type: Number, default: 0 },
      estimatedInr: { type: Number, default: 0 },
    },
    { timestamps: true },
  ),
);

export const PyqPaper = mongoose.model(
  "PyqPaper",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      examId: { type: String, required: true },
      title: { type: String, required: true },
      year: { type: Number, required: true },
      /** Session identity: question papers and answer keys are matched on these. */
      stage: { type: String, default: "" },
      /** Printed subject/paper code, when known (not part of the identity). */
      subjectCode: { type: String, default: "" },
      paperName: { type: String, default: "" },
      language: { type: String, enum: ["en", "ta", "bilingual", ""], default: "" },
      shift: { type: String, default: "" },
      sourceName: { type: String, required: true },
      rightsStatus: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
      status: { type: String, enum: ["draft", "under_review", "published", "rejected"], default: "draft" },
      questionIds: { type: [String], default: [] },
      note: { type: String, default: "" },
      /** Stored separately — students never see answer key until after submit. */
      questionPaperText: { type: String, default: "" },
      answerPaperText: { type: String, default: "", select: false },
      generationSource: { type: String, enum: ["ai", "import", "manual"], default: "ai" },
      /** Where the original paper came from (official page / PDF link). */
      sourceUrl: { type: String, default: "" },
      /** Uploaded files; `fileId` points to the StoredFile kept in Google Drive when storage is connected. */
      files: {
        type: [{ _id: false, kind: { type: String, enum: ["questions", "answers"] }, name: String, size: Number, sha256: String, uploadedAt: Date, fileId: { type: String, default: "" } }],
        default: [],
      },
      /** AI extraction of the uploaded PDF into questions. */
      extraction: {
        status: { type: String, enum: ["none", "processing", "done", "failed"], default: "none" },
        error: { type: String, default: "" },
        questions: { type: Number, default: 0 },
        withKey: { type: Number, default: 0 },
        provider: { type: String, default: "" },
        finishedAt: { type: Date, default: null },
      },
    },
    { timestamps: true },
  ),
);

// Indexes for the hot query paths (practice/mock start, dashboards, tutor, admin lists).
Question.schema.index({ examId: 1, status: 1, language: 1, topicId: 1 });
Question.schema.index({ status: 1, createdAt: -1 });
Topic.schema.index({ examId: 1, status: 1, order: 1 });
Subject.schema.index({ examId: 1, status: 1, order: 1 });
PracticeSession.schema.index({ studentId: 1, status: 1, createdAt: -1 });
MockAttempt.schema.index({ studentId: 1, createdAt: -1 });
Conversation.schema.index({ studentId: 1, updatedAt: -1 });
PlannerTask.schema.index({ studentId: 1, dueDate: 1, status: 1 });
Notification.schema.index({ userId: 1, status: 1, createdAt: -1 });
Ticket.schema.index({ updatedAt: -1 });
AuditLog.schema.index({ createdAt: -1 });
AiUsage.schema.index({ createdAt: -1 });
AiUsage.schema.index({ userId: 1, createdAt: -1 });
KnowledgeSource.schema.index({ status: 1, rightsStatus: 1, examId: 1 });
Question.schema.index({ ownerStudentId: 1, examId: 1, status: 1 });
Question.schema.index({ examId: 1, stemKey: 1 });
PracticeSession.schema.index({ studentId: 1, examId: 1, createdAt: -1 });
Question.schema.index({ examId: 1, subjectId: 1, language: 1, status: 1 });
Question.schema.index({ status: 1, flagged: 1, "stats.answered": -1 });
Question.schema.index({ pyqPaperId: 1, pyqNumber: 1 });

/** Every question a student has been shown (practice answer or daily mock), so the shared pool never repeats one. */
export const QuestionSeen = mongoose.model(
  "QuestionSeen",
  new Schema(
    {
      studentId: { type: String, required: true },
      examId: { type: String, required: true },
      questionId: { type: String, required: true },
      via: { type: String, enum: ["practice", "mock"], default: "practice" },
      at: { type: Date, default: Date.now },
    },
    { timestamps: false },
  ),
);
QuestionSeen.schema.index({ studentId: 1, questionId: 1 }, { unique: true });
QuestionSeen.schema.index({ studentId: 1, examId: 1, at: -1 });

/** A student's report that a question is wrong or unclear (one per student per question). */
export const QuestionReport = mongoose.model(
  "QuestionReport",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      questionId: { type: String, required: true, index: true },
      studentId: { type: String, required: true },
      reason: { type: String, enum: ["wrong_answer", "unclear", "other"], default: "other" },
      note: { type: String, default: "" },
    },
    { timestamps: true },
  ),
);
QuestionReport.schema.index({ questionId: 1, studentId: 1 }, { unique: true });

// Housekeeping: short-lived records expire on their own (MongoDB TTL).
SyncReceipt.schema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
JobRun.schema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
// AI usage must cover the whole month for the monthly budget, so it keeps 40 days.
AiUsage.schema.index({ createdAt: 1 }, { expireAfterSeconds: 40 * 24 * 60 * 60 });

/**
 * File storage connection (one document, id "default"). OAuth client secret and
 * refresh token are AES-256-GCM encrypted (crypto-secret.ts); never sent to clients.
 */
export const StorageConfig = mongoose.model(
  "StorageConfig",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      provider: { type: String, enum: ["none", "google_drive"], default: "none" },
      clientIdEnc: { type: String, default: "" },
      clientSecretEnc: { type: String, default: "" },
      refreshTokenEnc: { type: String, default: "" },
      accountEmail: { type: String, default: "" },
      folderId: { type: String, default: "" },
      folderName: { type: String, default: "ArivuVazhi" },
      status: { type: String, enum: ["disconnected", "connected", "authorization_expired", "configuration_error"], default: "disconnected" },
      lastError: { type: String, default: "" },
      connectedAt: { type: Date, default: null },
      lastCheckedAt: { type: Date, default: null },
      /** One-time OAuth state (CSRF) for the pending "Connect Google Account" flow. */
      oauthState: { type: String, default: "" },
      oauthStateExpires: { type: Date, default: null },
      oauthActorId: { type: String, default: "" },
    },
    { timestamps: true },
  ),
);

/** A file kept in external storage; only its reference and metadata live here. */
export const StoredFile = mongoose.model(
  "StoredFile",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      provider: { type: String, enum: ["google_drive", "memory"], required: true },
      providerFileId: { type: String, required: true },
      name: { type: String, required: true },
      mimeType: { type: String, required: true },
      size: { type: Number, default: 0 },
      sha256: { type: String, default: "" },
      kind: { type: String, enum: ["pyq_paper", "pyq_answer_key", "study_material", "student_document", "question_image", "other"], default: "other" },
      ownerType: { type: String, enum: ["admin", "student", "system"], default: "admin" },
      ownerId: { type: String, default: "" },
      /** private = owner and admins only; students = any signed-in student. */
      visibility: { type: String, enum: ["private", "students"], default: "private" },
      refType: { type: String, default: "" },
      refId: { type: String, default: "" },
      deletedAt: { type: Date, default: null },
    },
    { timestamps: true },
  ),
);
StoredFile.schema.index({ refType: 1, refId: 1 });

/** Sub-folders created inside the storage root, by path ("PYQ/TNPSC Group IV/2023/…"). */
export const StorageFolder = mongoose.model(
  "StorageFolder",
  new Schema(
    {
      rootId: { type: String, required: true },
      path: { type: String, required: true },
      providerFolderId: { type: String, required: true },
    },
    { timestamps: true },
  ),
);
StorageFolder.schema.index({ rootId: 1, path: 1 }, { unique: true });

PyqPaper.schema.index({ examId: 1, year: 1, stage: 1, paperName: 1, language: 1, shift: 1 });

/**
 * One original document (question paper or answer key) for a PYQ session. The file
 * itself stays unchanged in storage (Drive); extracted questions point back to it.
 */
export const PyqDocument = mongoose.model(
  "PyqDocument",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      /** The session it is matched to; "" = matching required. */
      paperId: { type: String, default: "", index: true },
      examId: { type: String, required: true, index: true },
      year: { type: Number, required: true },
      stage: { type: String, default: "" },
      paperName: { type: String, default: "" },
      language: { type: String, enum: ["en", "ta", "bilingual", ""], default: "" },
      shift: { type: String, default: "" },
      docType: { type: String, enum: ["question_paper", "answer_key"], required: true },
      /** Printed subject/paper code (e.g. TNPSC "Subject Code 004"); used to match keys to papers. */
      subjectCode: { type: String, default: "" },
      /** One answer-key PDF holding several subjects is split per subject; parts point to the original document. */
      splitFrom: { type: String, default: "" },
      /** Answer keys only. */
      keyVersion: { type: String, enum: ["", "tentative", "final", "revised"], default: "" },
      versionNo: { type: Number, default: 1 },
      fileId: { type: String, default: "" },
      fileName: { type: String, default: "" },
      mimeType: { type: String, default: "" },
      size: { type: Number, default: 0 },
      sha256: { type: String, default: "" },
      pages: { type: Number, default: 0 },
      source: {
        kind: { type: String, enum: ["manual", "discovered"], default: "manual" },
        name: { type: String, default: "" },
        url: { type: String, default: "" },
        sourceId: { type: String, default: "" },
        pageUrl: { type: String, default: "" },
      },
      /**
       * link_only = found but not downloadable (admin downloads and uploads it);
       * needs_review = processed, waiting for admin; approved/rejected = admin decision.
       */
      status: {
        type: String,
        enum: ["link_only", "uploaded", "processing", "processed", "failed", "approved", "rejected"],
        default: "uploaded",
      },
      processing: {
        method: { type: String, enum: ["", "text", "ocr"], default: "" },
        error: { type: String, default: "" },
        questions: { type: Number, default: 0 },
        answers: { type: Number, default: 0 },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
      },
      /** Answer keys: official entries as read from the document. */
      answers: { type: [{ _id: false, number: Number, key: String, note: String }], default: [] },
      /** Validation findings for the admin (missing numbers, unknown options, ...). */
      warnings: { type: [String], default: [] },
      /** Other links where the same file (same hash) was found, so discovery never downloads it again. */
      alsoFoundAt: { type: [String], default: [] },
      uploadedBy: { type: String, default: "" },
      reviewedBy: { type: String, default: "" },
    },
    { timestamps: true },
  ),
);
PyqDocument.schema.index({ sha256: 1 });
PyqDocument.schema.index({ "source.url": 1 });
PyqDocument.schema.index({ alsoFoundAt: 1 });

/** A website the discovery job may read for question papers / answer keys. */
export const PyqSource = mongoose.model(
  "PyqSource",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      name: { type: String, required: true },
      url: { type: String, required: true },
      type: { type: String, enum: ["official", "verified"], default: "official" },
      examIds: { type: [String], default: [] },
      enabled: { type: Boolean, default: true },
      lastCheckedAt: { type: Date, default: null },
      lastSuccessAt: { type: Date, default: null },
      reliability: { type: String, enum: ["unknown", "ok", "degraded", "failing"], default: "unknown" },
      /** Found automatically (official site + question-paper page check), not typed in by an admin. */
      autoAdded: { type: Boolean, default: false },
      lastError: { type: String, default: "" },
    },
    { timestamps: true },
  ),
);

/** Per-exam collection settings chosen by the admin. */
export const PyqCollection = mongoose.model(
  "PyqCollection",
  new Schema(
    {
      examId: { type: String, required: true, unique: true },
      startYear: { type: Number, required: true },
      endYear: { type: Number, required: true },
      languages: { type: [String], default: ["ta", "en"] },
      stages: { type: [String], default: [] },
      method: { type: String, enum: ["manual", "automatic", "both"], default: "both" },
      docTypes: { type: [String], default: ["question_paper", "answer_key"] },
      schedule: { type: String, enum: ["off", "weekly"], default: "off" },
      lastRunAt: { type: Date, default: null },
    },
    { timestamps: true },
  ),
);

/**
 * Stored PYQ pattern analysis of an exam (one per exam), recomputed after papers are
 * processed or reviewed. status: ready, insufficient (too few years for trends), empty.
 */
export const PyqAnalysis = mongoose.model(
  "PyqAnalysis",
  new Schema(
    {
      examId: { type: String, required: true, unique: true },
      status: { type: String, enum: ["ready", "insufficient", "empty"], default: "empty" },
      result: { type: Schema.Types.Mixed, default: {} },
      computedAt: { type: Date, default: null },
    },
    { timestamps: true, minimize: false },
  ),
);

/** One discovery run, for monitoring. */
export const PyqJob = mongoose.model(
  "PyqJob",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      examId: { type: String, required: true, index: true },
      startYear: { type: Number, required: true },
      endYear: { type: Number, required: true },
      trigger: { type: String, enum: ["manual", "schedule"], default: "manual" },
      status: { type: String, enum: ["running", "done", "failed"], default: "running" },
      sourcesChecked: { type: [String], default: [] },
      discovered: { type: Number, default: 0 },
      downloaded: { type: Number, default: 0 },
      uploaded: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      missing: { type: [{ _id: false, year: Number, docType: String }], default: [] },
      /** Live progress: 1 finding site, 2 reading pages, 3 AI checking links, 4 downloading, 5 finished. */
      progress: {
        step: { type: Number, default: 0 },
        label: { type: String, default: "Starting" },
        done: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        current: { type: String, default: "" },
      },
      /** Documents this job added (their processing = "reading questions" progress). */
      documentIds: { type: [String], default: [] },
      log: { type: [String], default: [] },
      error: { type: String, default: "" },
      startedAt: { type: Date, default: Date.now },
      finishedAt: { type: Date, default: null },
    },
    { timestamps: true },
  ),
);

/**
 * One daily current-affairs item. Collected by AI at 03:00 IST for the previous day,
 * then fact-checked independently (source links, Gemini + Google Search, ChatGPT re-check).
 * Only items that pass every check are published to students.
 */
const currentAffairText = new Schema(
  {
    title: { type: String, default: "" },
    points: { type: [String], default: [] },
    quiz: {
      stem: { type: String, default: "" },
      options: { type: [{ key: String, text: String }], default: [] },
      correctKey: { type: String, default: "" },
      explanation: { type: String, default: "" },
    },
  },
  { _id: false },
);

export const CurrentAffair = mongoose.model(
  "CurrentAffair",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      /** The day the news happened (IST). */
      newsDay: { type: String, required: true, index: true },
      /** "daily" = the 03:00 feed; "archive" = the one-time 18-month backfill. */
      mode: { type: String, enum: ["daily", "archive"], default: "daily" },
      category: { type: String, default: "national" },
      facts: { type: [String], default: [] },
      sources: { type: [{ title: String, url: String }], default: [] },
      en: { type: currentAffairText, default: () => ({}) },
      ta: { type: currentAffairText, default: () => ({}) },
      status: { type: String, enum: ["checking", "published", "rejected", "hidden"], default: "checking", index: true },
      /** Every validation step and its outcome, for the admin summary. */
      checks: { type: [{ step: String, passed: Boolean, note: String }], default: [] },
      rejectReason: { type: String, default: "" },
      reportCount: { type: Number, default: 0 },
      order: { type: Number, default: 0 },
    },
    { timestamps: true },
  ),
);

/** A student's "this is wrong" report on a current-affairs item (one per student per item). */
export const CurrentAffairReport = mongoose.model(
  "CurrentAffairReport",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      itemId: { type: String, required: true },
      studentId: { type: String, required: true },
    },
    { timestamps: true },
  ),
);
CurrentAffairReport.schema.index({ itemId: 1, studentId: 1 }, { unique: true });
