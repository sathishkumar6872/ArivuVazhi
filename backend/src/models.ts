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
        enum: ["draft", "under_review", "published", "revised", "archived"],
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
      source: { type: String, enum: ["admin", "ai", "pyq", "student_ai"], default: "student_ai" },
      status: {
        type: String,
        enum: ["draft", "under_review", "published", "rejected", "retired"],
        default: "draft",
      },
      pyqYear: { type: Number, default: null },
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
      status: { type: String, enum: ["active", "completed"], default: "active" },
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
    },
    { timestamps: true },
  ),
);

export const MockAttempt = mongoose.model(
  "MockAttempt",
  new Schema(
    {
      id: { type: String, required: true, unique: true },
      mockId: { type: String, required: true, index: true },
      studentId: { type: String, required: true, index: true },
      idempotencyKey: { type: String, default: "" },
      dayKey: { type: String, required: true },
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
      sourceName: { type: String, required: true },
      rightsStatus: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
      status: { type: String, enum: ["draft", "under_review", "published", "rejected"], default: "draft" },
      questionIds: { type: [String], default: [] },
      note: { type: String, default: "" },
      /** Stored separately — students never see answer key until after submit. */
      questionPaperText: { type: String, default: "" },
      answerPaperText: { type: String, default: "", select: false },
      generationSource: { type: String, enum: ["ai", "import", "manual"], default: "ai" },
    },
    { timestamps: true },
  ),
);
