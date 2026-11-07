import argon2 from "argon2";
import { config } from "./config.js";
import { connectDb, disconnectDb } from "./db.js";
import { dayKey, nid } from "./http.js";
import {
  AppConfig,
  Exam,
  KnowledgeSource,
  MockTest,
  Notification,
  PlannerTask,
  PracticeSession,
  PyqPaper,
  Question,
  Subject,
  Topic,
  User,
} from "./models.js";

const prompt = `You are ArivuVazhi, a calm tutor for Tamil Nadu and other Indian government examinations.
Explain in the learner's language: English, Tamil, or Tanglish.
Teach one idea at a time, use a short example, and point back to the approved source titles.
Never invent exam dates, vacancies, eligibility, or official answer keys.
Never score a mock test. Scoring is a separate deterministic service.`;

function choice(stem: string, options: string[], correctIndex: number, explanation: string, extra: Record<string, unknown>) {
  const keys = ["A", "B", "C", "D"];
  return {
    id: nid(),
    stem,
    options: options.map((text, index) => ({ key: keys[index], text })),
    correctKey: keys[correctIndex],
    explanation,
    status: "published",
    rightsStatus: "not_applicable",
    source: "admin",
    marks: 1.5,
    ...extra,
  };
}

async function main() {
  await connectDb();
  const existing = await Exam.findOne({ code: "TNPSC-G2" });
  if (existing) {
    console.log("Seed already present. Delete the exam catalogue first if you need a fresh seed.");
    await disconnectDb();
    return;
  }

  const group2 = await Exam.create({
    id: nid(),
    name: "TNPSC Group II",
    code: "TNPSC-G2",
    authority: "Tamil Nadu Public Service Commission",
    description: "Combined civil services examination. Practice content in this build is original study material, not a copy of an official paper.",
    lifecycle: "published",
    version: "2026.1",
    pattern: {
      durationMinutes: 180,
      totalQuestions: 200,
      marksPerQuestion: 1.5,
      negativeMarks: 0,
      sections: [
        { name: "General Studies", questionCount: 75 },
        { name: "Aptitude", questionCount: 25 },
        { name: "Language", questionCount: 100 },
      ],
    },
  });
  const group4 = await Exam.create({
    id: nid(),
    name: "TNPSC Group IV",
    code: "TNPSC-G4",
    authority: "Tamil Nadu Public Service Commission",
    description: "Group IV combined examination preparation track.",
    lifecycle: "published",
    version: "2026.1",
    pattern: { durationMinutes: 180, totalQuestions: 200, marksPerQuestion: 1.5, negativeMarks: 0, sections: [{ name: "General Studies", questionCount: 75 }] },
  });
  await Exam.create({
    id: nid(),
    name: "SSC CGL",
    code: "SSC-CGL",
    authority: "Staff Selection Commission",
    description: "Draft catalogue entry. Hidden from students until published.",
    lifecycle: "under_review",
    version: "2026-draft",
    pattern: { durationMinutes: 60, totalQuestions: 100, marksPerQuestion: 2, negativeMarks: 0.5, sections: [] },
  });

  const subjects = {
    gs: await Subject.create({ id: nid(), examId: group2.id, name: "General Studies", order: 1, status: "published" }),
    apt: await Subject.create({ id: nid(), examId: group2.id, name: "Aptitude & Mental Ability", order: 2, status: "published" }),
    tamil: await Subject.create({ id: nid(), examId: group2.id, name: "General Tamil", order: 3, status: "published" }),
    g4: await Subject.create({ id: nid(), examId: group4.id, name: "General Studies", order: 1, status: "published" }),
  };
  const topics = {
    polity: await Topic.create({ id: nid(), examId: group2.id, subjectId: subjects.gs.id, name: "Indian Polity", order: 1, status: "published" }),
    history: await Topic.create({ id: nid(), examId: group2.id, subjectId: subjects.gs.id, name: "Indian History", order: 2, status: "published" }),
    geo: await Topic.create({ id: nid(), examId: group2.id, subjectId: subjects.gs.id, name: "Tamil Nadu Geography", order: 3, status: "published" }),
    economy: await Topic.create({ id: nid(), examId: group2.id, subjectId: subjects.gs.id, name: "Indian Economy", order: 4, status: "published" }),
    numbers: await Topic.create({ id: nid(), examId: group2.id, subjectId: subjects.apt.id, name: "Numbers and Percentages", order: 1, status: "published" }),
    grammar: await Topic.create({ id: nid(), examId: group2.id, subjectId: subjects.tamil.id, name: "Grammar basics", order: 1, status: "validation" }),
    g4polity: await Topic.create({ id: nid(), examId: group4.id, subjectId: subjects.g4.id, name: "Indian Polity", order: 1, status: "published" }),
  };

  const base = { examId: group2.id, subjectId: subjects.gs.id, language: "en", difficulty: "medium" };
  const questions = await Question.insertMany([
    choice("Which Article of the Indian Constitution guarantees equality before the law?", ["Article 14", "Article 19", "Article 21", "Article 32"], 0, "Article 14 guarantees equality before the law and equal protection of the laws.", { ...base, topicId: topics.polity.id, difficulty: "easy" }),
    choice("Fundamental Rights are borrowed mainly from the constitution of which country?", ["United States", "United Kingdom", "Ireland", "Canada"], 0, "The idea of Fundamental Rights in the Indian Constitution draws primarily from the United States.", { ...base, topicId: topics.polity.id }),
    choice("Who is the constitutional head of a State in India?", ["Chief Minister", "Governor", "Speaker", "Advocate General"], 1, "The Governor is the constitutional head of a State. The Chief Minister is the head of the elected government.", { ...base, topicId: topics.polity.id }),
    choice("The Right to Constitutional Remedies is associated with which Article?", ["Article 32", "Article 14", "Article 19", "Article 51A"], 0, "Article 32 lets a person move the Supreme Court to enforce Fundamental Rights. Dr Ambedkar called it the heart and soul of the Constitution.", { ...base, topicId: topics.polity.id, difficulty: "easy" }),
    choice("Directive Principles of State Policy are:", ["Justiciable in court", "Guidelines for the State, not directly enforceable", "Part of Fundamental Duties", "Applicable only to Union Territories"], 1, "Directive Principles guide the State. Courts do not enforce them the way they enforce Fundamental Rights.", { ...base, topicId: topics.polity.id }),
    choice("The Battle of Plassey was fought in:", ["1757", "1764", "1857", "1947"], 0, "The Battle of Plassey was fought in 1757 and strengthened the East India Company's position in Bengal.", { ...base, topicId: topics.history.id, subjectId: subjects.gs.id, difficulty: "easy" }),
    choice("The Non-Cooperation Movement was launched in:", ["1905", "1919", "1920", "1942"], 2, "Gandhi launched the Non-Cooperation Movement in 1920.", { ...base, topicId: topics.history.id }),
    choice("Who founded the Dravidar Kazhagam?", ["C. N. Annadurai", "Periyar E. V. Ramasamy", "K. Kamaraj", "M. Karunanidhi"], 1, "Periyar E. V. Ramasamy founded the Dravidar Kazhagam in 1944 as a continuation of the Self-Respect movement.", { ...base, topicId: topics.history.id }),
    choice("The Western Ghats in Tamil Nadu are locally known as:", ["Nilgiri and Anaimalai ranges, among others", "Aravalli hills", "Satpura range", "Vindhya range"], 0, "Tamil Nadu's Western Ghats include the Nilgiri, Anaimalai, Palani and Cardamom ranges.", { ...base, topicId: topics.geo.id, difficulty: "easy" }),
    choice("Which river is the longest river flowing in Tamil Nadu?", ["Vaigai", "Kaveri", "Palar", "Thamirabarani"], 1, "The Kaveri is the longest river associated with Tamil Nadu's irrigation system. It rises at Talakaveri in Karnataka.", { ...base, topicId: topics.geo.id }),
    choice("GST in India is primarily:", ["A single indirect tax on supply of goods and services", "A direct tax on agricultural income", "A customs duty only", "A tax levied only by village panchayats"], 0, "Goods and Services Tax is a destination-based indirect tax on the supply of goods and services.", { ...base, topicId: topics.economy.id }),
    choice("The Reserve Bank of India was established in:", ["1935", "1947", "1950", "1991"], 0, "The Reserve Bank of India was established in 1935.", { ...base, topicId: topics.economy.id, difficulty: "easy" }),
    choice("What is 20% of 250?", ["25", "40", "50", "60"], 2, "20% means 20/100. 0.2 × 250 = 50.", { ...base, subjectId: subjects.apt.id, topicId: topics.numbers.id, difficulty: "easy" }),
    choice("A sum becomes ₹2,420 in 2 years at 10% simple interest per year. The principal is:", ["₹2,000", "₹2,200", "₹1,800", "₹2,100"], 0, "Interest for 2 years at 10% is 20% of principal. If amount is 120% of principal, principal = 2420 / 1.2 = 2000.", { ...base, subjectId: subjects.apt.id, topicId: topics.numbers.id, difficulty: "hard" }),
    choice("இந்திய அரசியலமைப்பின் எந்தப் பிரிவு சட்டத்தின் முன் சமத்துவத்தை உறுதி செய்கிறது?", ["பிரிவு 14", "பிரிவு 19", "பிரிவு 21", "பிரிவு 32"], 0, "பிரிவு 14 சட்டத்தின் முன் அனைவரும் சமம் என்பதையும் சம பாதுகாப்பையும் உறுதி செய்கிறது.", { ...base, topicId: topics.polity.id, language: "ta", difficulty: "easy" }),
    choice("Which of these is a Fundamental Duty?", ["To pay GST", "To abide by the Constitution and respect its ideals", "To vote in every election", "To join a political party"], 1, "Article 51A lists Fundamental Duties. Abiding by the Constitution and respecting its ideals is the first duty.", { ...base, topicId: topics.polity.id }),
    choice("Which Article of the Indian Constitution guarantees equality before the law? (pattern practice item)", ["Article 14", "Article 19", "Article 21", "Article 32"], 0, "Original practice item written for ArivuVazhi. It is not a reproduction of an official previous-year paper.", { examId: group2.id, subjectId: subjects.gs.id, topicId: topics.polity.id, language: "en", difficulty: "easy", source: "pyq", pyqYear: 2024, rightsStatus: "verified", status: "published" }),
    choice("The Governor of a State is appointed by:", ["The Chief Minister", "The President", "The Chief Justice", "The Speaker"], 1, "Original practice item. The President appoints the Governor.", { examId: group2.id, subjectId: subjects.gs.id, topicId: topics.polity.id, language: "en", difficulty: "medium", source: "pyq", pyqYear: 2024, rightsStatus: "verified", status: "published" }),
    choice("Group IV practice: Panchayati Raj was constitutionalised by which amendment?", ["42nd", "44th", "73rd", "86th"], 2, "The 73rd Constitutional Amendment gave constitutional status to Panchayati Raj institutions.", { examId: group4.id, subjectId: subjects.g4.id, topicId: topics.g4polity.id, language: "en", difficulty: "medium", source: "admin", status: "published" }),
    choice("Needs review: The capital of Tamil Nadu is Chennai. Which coast does the State face?", ["Arabian Sea", "Bay of Bengal", "Red Sea", "Caspian Sea"], 1, "Tamil Nadu has a coastline on the Bay of Bengal. This item is intentionally left under review.", { ...base, topicId: topics.geo.id, status: "under_review" }),
  ]);

  const published = questions.filter((question) => question.status === "published" && question.examId === group2.id && question.source !== "pyq");
  const pyqQuestions = questions.filter((question) => question.source === "pyq");
  await PyqPaper.create({
    id: nid(),
    examId: group2.id,
    title: "Group II pattern practice · 2024",
    year: 2024,
    sourceName: "ArivuVazhi original pattern set",
    rightsStatus: "verified",
    status: "published",
    questionIds: pyqQuestions.map((question) => question.id),
    note: "Original items written for this product. They are not scanned official papers.",
  });
  await PyqPaper.create({
    id: nid(),
    examId: group4.id,
    title: "Group IV 2023 source check",
    year: 2023,
    sourceName: "Pending rights review",
    rightsStatus: "pending",
    status: "under_review",
    questionIds: [],
    note: "Do not publish until usage rights are verified.",
  });

  const mockQuestions = published.slice(0, 8);
  await MockTest.create({
    id: nid(),
    examId: group2.id,
    title: "Group II · Set 01",
    questionIds: mockQuestions.map((question) => question.id),
    durationMinutes: 12,
    marksPerQuestion: 1.5,
    negativeMarks: 0,
    status: "published",
    instructions: [
      "The timer and submission are controlled by the server.",
      "You can mark questions for review.",
      "This set follows the configured marking rule.",
      "One attempt per mock per day.",
    ],
  });

  await KnowledgeSource.insertMany([
    {
      id: nid(),
      examId: group2.id,
      topicId: topics.polity.id,
      title: "Equality and Article 14",
      language: "en",
      sourceType: "notes",
      rightsStatus: "verified",
      status: "approved",
      text: "Article 14 says the State shall not deny to any person equality before the law or the equal protection of the laws within India. Equality before the law is a negative concept taken from British law: no person is above the law. Equal protection of the laws is a positive concept: equals should be treated alike. Reasonable classification is allowed, but class legislation is not.",
    },
    {
      id: nid(),
      examId: group2.id,
      topicId: topics.polity.id,
      title: "Fundamental Rights overview",
      language: "en",
      sourceType: "notes",
      rightsStatus: "verified",
      status: "approved",
      text: "Fundamental Rights are in Part III of the Constitution. They include equality, freedom, protection against exploitation, freedom of religion, cultural and educational rights, and the right to constitutional remedies under Article 32. They are enforceable by the courts. Article 32 is available in the Supreme Court. Article 226 gives High Courts a wider writ power.",
    },
    {
      id: nid(),
      examId: group2.id,
      topicId: topics.history.id,
      title: "National movement milestones",
      language: "en",
      sourceType: "notes",
      rightsStatus: "verified",
      status: "approved",
      text: "The Non-Cooperation Movement began in 1920. The Civil Disobedience Movement is associated with the Salt March of 1930. The Quit India Movement was launched in 1942. These are separate movements and should not be merged when a learner asks for a timeline.",
    },
    {
      id: nid(),
      examId: group2.id,
      topicId: topics.polity.id,
      title: "அடிப்படை உரிமைகள்",
      language: "ta",
      sourceType: "notes",
      rightsStatus: "verified",
      status: "approved",
      text: "அடிப்படை உரிமைகள் அரசியலமைப்பின் பகுதி III-ல் உள்ளன. பிரிவு 14 சட்டத்தின் முன் சமத்துவத்தைக் கூறுகிறது. பிரிவு 19 பேச்சு, கூட்டம் போன்ற சுதந்திரங்களைக் கூறுகிறது. பிரிவு 21 வாழ்க்கை மற்றும் தனிப்பட்ட சுதந்திரத்தைப் பாதுகாக்கிறது. பிரிவு 32 அடிப்படை உரிமைகளை அமல்படுத்த உச்ச நீதிமன்றத்தை அணுகும் உரிமையைத் தருகிறது.",
    },
  ]);

  await AppConfig.create({
    id: "app",
    maxSessions: 5,
    aiProvider: "local",
    monthlyBudgetInr: 500,
    perUserDailyAiLimit: 40,
    activePrompt: prompt,
    promptVersion: "1.0",
  });

  const admin = await User.create({
    id: nid(),
    email: config.adminEmail.toLowerCase(),
    passwordHash: await argon2.hash(config.adminPassword),
    role: "admin",
    firstName: "Sathish",
    lastName: "Kumar",
    language: "en",
    status: "active",
    onboardingComplete: true,
  });
  const student = await User.create({
    id: nid(),
    email: config.studentEmail.toLowerCase(),
    passwordHash: await argon2.hash(config.studentPassword),
    role: "student",
    firstName: "Anitha",
    lastName: "R",
    language: "ta",
    status: "active",
    onboardingComplete: true,
    primaryExamId: group2.id,
    examIds: [group2.id, group4.id],
    aiMemoryEnabled: true,
    streak: 3,
    lastActiveDate: dayKey(),
    education: [{ level: "B.A.", institution: "University of Madras", year: "2022" }],
    preferences: { carryForward: true, notifications: true },
  });

  const today = dayKey();
  await PlannerTask.insertMany([
    { id: nid(), studentId: student.id, examId: group2.id, title: "Indian Polity · Fundamental Rights", dueDate: today, minutes: 40, status: "pending" },
    { id: nid(), studentId: student.id, examId: group2.id, title: "Practice · Indian Polity", dueDate: today, minutes: 20, status: "pending" },
    { id: nid(), studentId: student.id, examId: group2.id, title: "Revise history timeline", dueDate: today, minutes: 15, status: "pending" },
  ]);
  await Notification.create({
    id: nid(),
    userId: "",
    title: "Welcome to ArivuVazhi",
    body: "Your preparation space is ready. Start with today's Polity practice.",
    channel: "in_app",
    status: "delivered",
  });
  const sampleQuestions = published.filter((question) => question.topicId === topics.polity.id).slice(0, 4);
  await PracticeSession.create({
    id: nid(),
    studentId: student.id,
    examId: group2.id,
    topicId: topics.polity.id,
    questionIds: sampleQuestions.map((question) => question.id),
    status: "completed",
    completedAt: new Date(),
    answers: sampleQuestions.map((question, index) => ({
      questionId: question.id,
      selectedKey: index === 2 ? "A" : question.correctKey,
      correct: index !== 2,
      answeredAt: new Date(),
      markedForReview: false,
    })),
  });

  console.log("Seed complete");
  console.log(`Admin ${admin.email}`);
  console.log(`Student ${student.email}`);
  await disconnectDb();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectDb().catch(() => undefined);
  process.exit(1);
});
