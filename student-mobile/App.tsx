import { useEffect, useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import { api, storageClearSession, storageGet, syncOfflineQueue, type Student } from "./src/api";
import { AuthFlow, Onboarding, Splash } from "./src/auth-screens";
import { AlertsScreen, AnalyticsScreen, HomeScreen, PlannerScreen } from "./src/home-screens";
import { BookmarksScreen, ExamScreen, ExamsScreen, MockIntroScreen, MockResultScreen, MockRunScreen, MocksScreen, PracticeResultScreen, PracticeScreen, PyqPaperScreen, PyqScreen, QuizScreen, TopicsScreen } from "./src/learn-screens";
import { AchievementsScreen, EditProfileScreen, NotesScreen, ProfileScreen, SettingsScreen, SupportScreen } from "./src/account-screens";
import { ChatScreen, TutorScreen } from "./src/tutor-screens";
import { rootOf, tabOf, type Route, type TabName } from "./src/nav";
import { ThemeProvider } from "./src/theme";
import { TabBar } from "./src/ui";
import { LocaleProvider } from "./src/locale";

const initial: Record<TabName, Route[]> = {
  home: [{ name: "home" }],
  exams: [{ name: "exams" }],
  practice: [{ name: "practice" }],
  tutor: [{ name: "tutor" }],
  profile: [{ name: "profile" }],
};

function PhoneFrame({ children }: { children: ReactNode }) {
  const web = Platform.OS === "web";
  useEffect(() => {
    if (!web || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.textContent = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Poppins:wght@600;700;800&display=swap');html,body,#root{height:100%;margin:0;background:#e8f5ee;font-family:Inter,system-ui,sans-serif}#root{display:flex;min-height:100%}#root *{scrollbar-width:none}#root *::-webkit-scrollbar{display:none}#root h1,#root [style*='font-weight: 800'],#root [style*='fontWeight: \"800\"']{font-family:Poppins,Inter,system-ui,sans-serif}#root input,#root textarea{outline:none!important;outline-width:0!important;box-shadow:none!important;-webkit-appearance:none;appearance:none;caret-color:#16A34A}#root input:focus,#root textarea:focus{outline:none!important;outline-width:0!important;box-shadow:none!important}.av-input-focused{border-color:#16A34A!important;outline:3px solid rgba(22,163,74,0.2);outline-offset:0}#root input:-webkit-autofill,#root input:-webkit-autofill:hover,#root input:-webkit-autofill:focus{-webkit-box-shadow:0 0 0 1000px #ffffff inset!important;-webkit-text-fill-color:#0B1F17!important;caret-color:#16A34A;transition:background-color 99999s ease-in-out 0s}";
    document.head.appendChild(style);
    const clearFocused = () => document.querySelectorAll(".av-input-focused").forEach((node) => node.classList.remove("av-input-focused"));
    const mark = (target: EventTarget | null, on: boolean) => {
      const el = target as HTMLElement | null;
      if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return;
      if (on) clearFocused();
      // Only the outer field row — never the input itself (avoids size jump).
      const row = el.parentElement;
      if (row && row !== document.body) row.classList.toggle("av-input-focused", on);
    };
    const onFocusIn = (event: FocusEvent) => mark(event.target, true);
    const onFocusOut = (event: FocusEvent) => mark(event.target, false);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      style.remove();
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [web]);
  if (!web) return <>{children}</>;
  return (
    <View style={{ flex: 1, width: "100%", height: "100%", alignItems: "center", justifyContent: "center", backgroundColor: "#E8F5EE" }}>
      <View style={{ width: "min(390px, calc(100vw - 48px))" as unknown as number, height: "min(844px, calc(100vh - 48px))" as unknown as number, borderRadius: 42, borderWidth: 12, borderColor: "#0B3D2E", overflow: "hidden", backgroundColor: "#F3F4F6" }}>
        <View style={{ flex: 1, minHeight: 0 }}>
          {children}
        </View>
      </View>
    </View>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <PhoneFrame>
        <Root />
      </PhoneFrame>
    </ThemeProvider>
  );
}

function Root() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<Student | null>(null);
  useEffect(() => {
    storageGet("av_m_access").then(async (token) => {
      if (!token) return;
      try {
        setUser(await api<Student>("/me"));
        void syncOfflineQueue().catch(() => null);
      } catch { await storageClearSession(); }
    }).finally(() => setReady(true));
  }, []);
  if (!ready) return <Splash />;
  if (!user) return <AuthFlow onDone={setUser} />;
  if (!user.onboardingComplete) return <Onboarding user={user} onDone={setUser} />;
  return (
    <LocaleProvider language={user.preferences?.appLanguage || user.language}>
      <Shell user={user} setUser={setUser} onLogout={async () => { await storageClearSession(); setUser(null); }} />
    </LocaleProvider>
  );
}

function Shell({ user, setUser, onLogout }: { user: Student; setUser: (user: Student) => void; onLogout: () => void }) {
  const [tab, setTab] = useState<TabName>("home");
  const [stacks, setStacks] = useState(initial);
  const route = stacks[tab][stacks[tab].length - 1];

  function open(next: Route, mode: "push" | "replace") {
    const rooted = next.name === "home" || next.name === "exams" || next.name === "practice" || next.name === "tutor" || next.name === "profile";
    if (rooted) {
      setTab(tabOf(next));
      return;
    }
    const nextTab = mode === "replace" ? tabOf(next) : tab;
    setTab(nextTab);
    setStacks((current) => {
      const stack = current[nextTab];
      const base = mode === "replace" ? stack.slice(0, Math.max(stack.length - 1, 0)) : stack;
      return { ...current, [nextTab]: [...base, next] };
    });
  }
  function back() {
    setStacks((current) => {
      const stack = current[tab];
      if (stack.length <= 1) return current;
      return { ...current, [tab]: stack.slice(0, -1) };
    });
  }
  function goTab(next: TabName) {
    setTab(next);
  }

  const hideTabBar = route.name === "chat" || route.name === "quiz" || route.name === "mockRun";

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, minHeight: 0 }}>
        {route.name === "home" && <HomeScreen user={user} go={(next) => open(next, "push")} />}
        {route.name === "planner" && <PlannerScreen back={back} />}
        {route.name === "analytics" && <AnalyticsScreen back={back} />}
        {route.name === "alerts" && <AlertsScreen back={back} />}
        {route.name === "mocks" && <MocksScreen back={back} go={(next) => open(next, "push")} />}
        {route.name === "mockIntro" && <MockIntroScreen mockId={route.mockId} back={back} go={(next) => open(next, "push")} />}
        {route.name === "mockRun" && <MockRunScreen mockId={route.mockId} onDone={(next) => open(next, "replace")} />}
        {route.name === "mockResult" && <MockResultScreen attemptId={route.attemptId} back={back} />}
        {route.name === "exams" && <ExamsScreen user={user} go={(next) => open(next, "push")} />}
        {route.name === "exam" && <ExamScreen examId={route.examId} user={user} onUser={setUser} back={back} go={(next) => open(next, "push")} />}
        {route.name === "pyq" && <PyqScreen user={user} back={back} go={(next) => open(next, "push")} />}
        {route.name === "pyqPaper" && <PyqPaperScreen paperId={route.paperId} back={back} />}
        {route.name === "practice" && <PracticeScreen user={user} go={(next) => open(next, "push")} />}
        {route.name === "topics" && <TopicsScreen route={route} back={back} go={(next) => open(next, "push")} />}
        {route.name === "quiz" && <QuizScreen route={route} back={back} onDone={(next) => open(next, "replace")} />}
        {route.name === "practiceResult" && <PracticeResultScreen route={route} back={back} />}
        {route.name === "bookmarks" && <BookmarksScreen back={back} />}
        {route.name === "tutor" && <TutorScreen user={user} go={(next) => open(next, "push")} />}
        {route.name === "chat" && <ChatScreen user={user} conversationId={route.conversationId} starter={route.starter} back={back} />}
        {route.name === "profile" && <ProfileScreen user={user} go={(next) => open(next, "push")} logout={onLogout} />}
        {route.name === "editProfile" && <EditProfileScreen user={user} onUser={setUser} back={back} />}
        {route.name === "settings" && <SettingsScreen user={user} onUser={setUser} back={back} />}
        {route.name === "notes" && <NotesScreen back={back} />}
        {route.name === "achievements" && <AchievementsScreen user={user} back={back} />}
        {route.name === "support" && <SupportScreen back={back} />}
      </View>
      {!hideTabBar ? (
        <TabBar tab={tab} onChange={(next) => { if (!stacks[next].length) setStacks((current) => ({ ...current, [next]: [rootOf(next)] })); goTab(next); }} />
      ) : null}
    </View>
  );
}
