export type TabName = "home" | "exams" | "practice" | "tutor" | "profile";

export type Route =
  | { name: "home" }
  | { name: "planner" }
  | { name: "analytics" }
  | { name: "alerts" }
  | { name: "mocks" }
  | { name: "mockIntro"; mockId: string }
  | { name: "mockRun"; mockId: string }
  | { name: "mockResult"; attemptId: string }
  | { name: "exams" }
  | { name: "exam"; examId: string }
  | { name: "pyq" }
  | { name: "pyqPaper"; paperId: string }
  | { name: "practice" }
  | { name: "topics"; subjectId: string; subjectName: string; examId: string }
  | { name: "quiz"; examId: string; topicId?: string; title: string; difficulty?: "easy" | "medium" | "hard" }
  | { name: "practiceResult"; correct: number; answered: number; total: number; pendingOffline?: boolean }
  | { name: "bookmarks" }
  | { name: "tutor" }
  | { name: "chat"; conversationId?: string; starter?: string }
  | { name: "profile" }
  | { name: "editProfile" }
  | { name: "settings" }
  | { name: "notes" }
  | { name: "achievements" }
  | { name: "support" };

export function tabOf(route: Route): TabName {
  if (["exams", "exam", "pyq", "pyqPaper"].includes(route.name)) return "exams";
  if (["practice", "topics", "quiz", "practiceResult", "bookmarks"].includes(route.name)) return "practice";
  if (["tutor", "chat"].includes(route.name)) return "tutor";
  if (["profile", "editProfile", "settings", "notes", "achievements", "support"].includes(route.name)) return "profile";
  return "home";
}

export function rootOf(tab: TabName): Route {
  if (tab === "exams") return { name: "exams" };
  if (tab === "practice") return { name: "practice" };
  if (tab === "tutor") return { name: "tutor" };
  if (tab === "profile") return { name: "profile" };
  return { name: "home" };
}
