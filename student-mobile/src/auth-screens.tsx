import { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, saveSession, storageGet, storageSet, type Student } from "./api";
import { BrandImages } from "./assets";
import { useTheme } from "./theme";
import { Banner, Button, Dots, Field, Screen, Wordmark } from "./ui";

type AuthMode = "welcome" | "login" | "register" | "forgot" | "verify";

export function Splash() {
  return (
    <View style={{ flex: 1, backgroundColor: "#0B3D2E" }}>
      <Image source={BrandImages.mountain} style={{ position: "absolute", width: "100%", height: "100%", opacity: 0.55 }} resizeMode="cover" />
      <View style={{ flex: 1, backgroundColor: "rgba(8,40,30,0.55)", padding: 24, justifyContent: "space-between" }}>
        <View style={{ marginTop: 56, alignItems: "center" }}>
          <Wordmark light centered />
          <Text style={{ color: "#A7F3D0", letterSpacing: 2, fontSize: 11, fontWeight: "700", marginTop: 10 }}>LEARN • PRACTICE • ACHIEVE</Text>
        </View>
        <View>
          <Text style={{ color: "#FFFFFF", fontSize: 30, fontWeight: "800", textAlign: "center", lineHeight: 38 }}>Your Government Exam Journey Starts Here</Text>
          <Text style={{ color: "#D1FAE5", fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 12 }}>Learn smarter, practice better, and achieve your goal with AI.</Text>
        </View>
      </View>
    </View>
  );
}

export function AuthFlow({ onDone }: { onDone: (user: Student) => void }) {
  const { palette } = useTheme();
  const [mode, setMode] = useState<AuthMode>("welcome");
  const [splashPage, setSplashPage] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(true);
  const [exams, setExams] = useState<Array<{ id: string; name: string }>>([]);
  const [examId, setExamId] = useState("");
  const [examOpen, setExamOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Student | null>(null);

  useEffect(() => {
    storageGet("av_m_remember_email").then((value) => { if (value) setEmail(value); });
    api<Array<{ id: string; name: string }>>("/auth/catalogue").then((items) => {
      setExams(items);
      setExamId(items[0]?.id || "");
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (mode !== "welcome") return;
    const timer = setInterval(() => {
      setSplashPage((current) => (current + 1) % 3);
    }, 3500);
    return () => clearInterval(timer);
  }, [mode]);

  async function submit() {
    setError("");
    if (!email.includes("@") || password.length < 8) {
      setError("Use a valid email and a password of at least 8 characters, with a letter and a number.");
      return;
    }
    try {
      if (mode === "register") {
        if (firstName.trim().length < 1) { setError("Enter your first name."); return; }
        if (password !== confirm) { setError("Password and confirm password must match."); return; }
        if (!examId) { setError("Choose your exam goal."); return; }
        const data = await api<{ user: Student; accessToken: string; refreshToken: string }>("/auth/register", { method: "POST", body: JSON.stringify({ firstName, lastName, email, password }) });
        const user = await saveSession(data);
        await storageSet("av_m_exam_goal", examId);
        if (remember) await storageSet("av_m_remember_email", email);
        setPending(user);
        setMode("verify");
        return;
      }
      const data = await api<{ user: Student; accessToken: string; refreshToken: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      if (remember) await storageSet("av_m_remember_email", email);
      else await storageSet("av_m_remember_email", "");
      onDone(await saveSession(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue");
    }
  }

  if (mode === "welcome") {
    const slides = [
      { title: "Your Government Exam Journey Starts Here", body: "Learn smarter, practice better, and achieve your goal with AI." },
      { title: "Practice with real exam patterns", body: "Mocks, previous papers and topic practice stay inside approved content." },
      { title: "AI tutor in Tamil, English or Tanglish", body: "Ask doubts with text, image or PDF. Voice needs the OpenAI provider." },
    ];
    const slide = slides[splashPage];
    return (
      <View style={{ flex: 1, backgroundColor: "#071F18" }}>
        <Image source={BrandImages.mountain} style={{ position: "absolute", width: "100%", height: "100%" }} resizeMode="cover" />
        <View style={{ flex: 1, backgroundColor: "rgba(7,31,24,0.58)", paddingHorizontal: 22, paddingTop: 56, paddingBottom: 28, justifyContent: "space-between" }}>
          <View style={{ alignItems: "center" }}>
            <Wordmark light centered />
            <Text style={{ color: "#A7F3D0", letterSpacing: 2.2, fontSize: 11, fontWeight: "700", marginTop: 10 }}>LEARN • PRACTICE • ACHIEVE</Text>
          </View>
          <View>
            <Text style={{ color: "#FFFFFF", fontSize: 30, fontWeight: "800", lineHeight: 38 }}>{slide.title}</Text>
            <Text style={{ color: "#D1FAE5", fontSize: 15, lineHeight: 22, marginTop: 12, marginBottom: 22 }}>{slide.body}</Text>
            <Dots count={3} index={splashPage} />
            <Button label="Get Started" icon="arrow-forward" onPress={() => setMode("login")} />
            <Pressable accessibilityRole="button" onPress={() => setMode("register")} style={{ marginTop: 14 }}>
              <Text style={{ color: "#A7F3D0", textAlign: "center", fontWeight: "700" }}>New here? Create an account</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (mode === "forgot") {
    return (
      <Screen>
        <Wordmark centered />
        <Text style={{ fontSize: 26, fontWeight: "800", color: palette.ink, marginVertical: 16, textAlign: "center" }}>Reset password</Text>
        <Banner tone="info" message="Password reset email is not connected in this release. Sign in with the password you created, or register a new student account." />
        <Button label="Back to login" onPress={() => setMode("login")} />
      </Screen>
    );
  }

  if (mode === "verify" && pending) {
    return (
      <Screen>
        <Wordmark centered />
        <Text style={{ fontSize: 26, fontWeight: "800", color: palette.ink, marginVertical: 16, textAlign: "center" }}>Account active</Text>
        <Banner tone="success" message={`${pending.email} is ready. This release does not send a verification email. You can start onboarding now.`} />
        <Button label="Continue" icon="arrow-forward" onPress={() => onDone(pending)} />
      </Screen>
    );
  }

  if (mode === "login") {
    return (
      <Screen>
        <View style={{ alignItems: "center", marginTop: 12, marginBottom: 20 }}>
          <Wordmark centered />
        </View>
        <Text style={{ fontSize: 26, fontWeight: "800", color: palette.ink, textAlign: "center" }}>Login to ArivuVazhi</Text>
        <Text style={{ color: palette.muted, textAlign: "center", marginTop: 6, marginBottom: 18 }}>Welcome back. Continue your preparation.</Text>
        {error ? <Banner message={error} /> : null}
        <Field label="Email" value={email} onChangeText={setEmail} keyboard="email-address" icon="person-outline" />
        <Field label="Password" value={password} onChangeText={setPassword} secure passwordToggle icon="lock-closed-outline" />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: remember }} onPress={() => setRemember(!remember)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name={remember ? "checkbox" : "square-outline"} size={20} color={remember ? palette.green : palette.muted} />
            <Text style={{ color: palette.ink, fontWeight: "600" }}>Remember me</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Forgot password" onPress={() => setMode("forgot")}>
            <Text style={{ color: palette.green, fontWeight: "700" }}>Forgot password?</Text>
          </Pressable>
        </View>
        <Button label="Login" onPress={submit} />
        <Pressable accessibilityRole="button" onPress={() => { setMode("register"); setError(""); }} style={{ marginTop: 18 }}>
          <Text style={{ color: palette.muted, textAlign: "center", fontWeight: "600" }}>
            New to ArivuVazhi? <Text style={{ color: palette.green, fontWeight: "800" }}>Create an account</Text>
          </Text>
        </Pressable>
      </Screen>
    );
  }

  const selectedExam = exams.find((item) => item.id === examId);
  return (
    <Screen>
      <View style={{ alignItems: "center", marginTop: 8, marginBottom: 16 }}>
        <Wordmark centered />
      </View>
      <Text style={{ fontSize: 26, fontWeight: "800", color: palette.ink, textAlign: "center" }}>Create Account</Text>
      <Text style={{ color: palette.muted, textAlign: "center", marginTop: 6, marginBottom: 16 }}>Start your government exam preparation journey</Text>
      {error ? <Banner message={error} /> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}><Field label="First Name" value={firstName} onChangeText={setFirstName} /></View>
        <View style={{ flex: 1 }}><Field label="Last Name" value={lastName} onChangeText={setLastName} /></View>
      </View>
      <Field label="Email" value={email} onChangeText={setEmail} keyboard="email-address" icon="mail-outline" />
      <Field label="Password" value={password} onChangeText={setPassword} secure passwordToggle icon="lock-closed-outline" />
      <Field label="Confirm Password" value={confirm} onChangeText={setConfirm} secure passwordToggle icon="lock-closed-outline" />
      <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600", marginBottom: 6 }}>Exam Goal</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Exam Goal" onPress={() => setExamOpen(!examOpen)} style={{ borderWidth: 1, borderColor: palette.line, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: palette.surface, marginBottom: examOpen ? 0 : 12 }}>
        <Text style={{ color: selectedExam ? palette.ink : palette.muted, fontSize: 16 }}>{selectedExam?.name || "Select exam"}</Text>
        <Ionicons name={examOpen ? "chevron-up" : "chevron-down"} size={18} color={palette.muted} />
      </Pressable>
      {examOpen ? (
        <View style={{ borderWidth: 1, borderColor: palette.line, borderRadius: 14, backgroundColor: palette.surface, marginBottom: 12, overflow: "hidden" }}>
          {exams.map((exam) => (
            <Pressable key={exam.id} accessibilityRole="button" accessibilityLabel={exam.name} onPress={() => { setExamId(exam.id); setExamOpen(false); }} style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: palette.line, backgroundColor: exam.id === examId ? palette.greenSoft : palette.surface }}>
              <Text style={{ color: palette.ink, fontWeight: exam.id === examId ? "800" : "600" }}>{exam.name}</Text>
            </Pressable>
          ))}
          {!exams.length ? <Text style={{ color: palette.muted, padding: 14 }}>No published exams yet.</Text> : null}
        </View>
      ) : null}
      <Button label="Create Account" onPress={submit} />
      <Pressable accessibilityRole="button" onPress={() => { setMode("login"); setError(""); }} style={{ marginTop: 18 }}>
        <Text style={{ color: palette.muted, textAlign: "center", fontWeight: "600" }}>
          Already have an account? <Text style={{ color: palette.green, fontWeight: "800" }}>Login</Text>
        </Text>
      </Pressable>
    </Screen>
  );
}

export function Onboarding({ user, onDone }: { user: Student; onDone: (user: Student) => void }) {
  const { palette } = useTheme();
  const [intro, setIntro] = useState(0);
  const [started, setStarted] = useState(false);
  const [phone, setPhone] = useState(user.phone || "");
  const [language, setLanguage] = useState<"ta" | "en">(user.language || "ta");
  const [level, setLevel] = useState("");
  const [institution, setInstitution] = useState("");
  const [year, setYear] = useState("");
  const [exams, setExams] = useState<Array<{ id: string; name: string; authority: string }>>([]);
  const [examId, setExamId] = useState("");
  const [pastName, setPastName] = useState("");
  const [pastYear, setPastYear] = useState("");
  const [pastResult, setPastResult] = useState("");
  const [carry, setCarry] = useState(true);
  const [notes, setNotes] = useState(true);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const introSlides = [
    {
      title: "Crack Government Exams with Confidence",
      body: "Personalized learning, AI support and structured preparation in one place.",
      image: BrandImages.characters,
    },
    {
      title: "Build a clear study plan",
      body: "Plan today, this week and this month. Carry unfinished work forward when you want.",
      image: BrandImages.practice,
    },
    {
      title: "Practice and mock with real rules",
      body: "Scoring stays deterministic on the server. One mock attempt per mock each day.",
      image: BrandImages.practice,
    },
    {
      title: "Ask the AI tutor when stuck",
      body: "Tamil, English or Tanglish. Answers stay inside approved notes for your exam.",
      image: BrandImages.aiTutor,
    },
  ];

  useEffect(() => {
    Promise.all([
      api<Array<{ id: string; name: string; authority: string }>>("/exams"),
      storageGet("av_m_exam_goal"),
    ]).then(([items, goal]) => {
      setExams(items);
      setExamId(goal && items.some((item) => item.id === goal) ? goal : items[0]?.id || "");
    }).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (started) return;
    const timer = setInterval(() => {
      setIntro((current) => (current + 1) % 4);
    }, 3500);
    return () => clearInterval(timer);
  }, [started]);

  async function finish() {
    if (!examId) { setError("Choose an exam to continue."); return; }
    setLoading(true);
    setError("");
    try {
      const education = level && institution && year ? [{ level, institution, year }] : [];
      const next = await api<Student>("/onboarding", { method: "POST", body: JSON.stringify({ language, examId, education }) });
      const history = pastName ? [{ examName: pastName, year: pastYear, result: pastResult || "attempted" }] : [];
      const saved = await api<Student>("/profile", { method: "PATCH", body: JSON.stringify({ phone, preferences: { carryForward: carry, notifications: notes, appLanguage: language }, examHistory: history }) });
      await storageSet("av_m_exam_goal", "");
      onDone({ ...next, ...saved });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save onboarding");
    } finally {
      setLoading(false);
    }
  }

  if (!started) {
    const slide = introSlides[intro];
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, justifyContent: "space-between", paddingTop: 8 }}>
          <View style={{ alignItems: "center" }}>
            <Wordmark centered />
          </View>
          <View style={{ alignItems: "center" }}>
            <Image source={slide.image} style={{ width: "100%", height: 240, borderRadius: 24 }} resizeMode="contain" />
            <Text style={{ color: palette.ink, fontSize: 26, fontWeight: "800", textAlign: "center", marginTop: 18, lineHeight: 34 }}>{slide.title}</Text>
            <Text style={{ color: palette.muted, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 10 }}>{slide.body}</Text>
          </View>
          <View>
            <Dots count={4} index={intro} />
            <Button
              label="Get Started"
              icon="arrow-forward"
              onPress={() => {
                if (intro < introSlides.length - 1) setIntro(intro + 1);
                else setStarted(true);
              }}
            />
          </View>
        </View>
      </Screen>
    );
  }

  const titles = ["About you", "Education", "Exam", "Previous attempts", "Learning"];
  return (
    <Screen>
      <Wordmark />
      <Text style={{ color: palette.green, fontWeight: "700", marginTop: 12 }}>Step {step + 1} of 5</Text>
      <Text style={{ fontSize: 28, fontWeight: "800", color: palette.primary, marginBottom: 12 }}>{titles[step]}</Text>
      {error ? <Banner message={error} /> : null}
      {step === 0 && (
        <View>
          <Text style={{ color: palette.muted, marginBottom: 12 }}>{user.firstName} {user.lastName}</Text>
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboard="number-pad" icon="call-outline" />
          <Text style={{ color: palette.muted, marginBottom: 8 }}>App and exam language (you can split these later in Edit profile)</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Button label="Tamil" tone={language === "ta" ? "primary" : "ghost"} onPress={() => setLanguage("ta")} /></View>
            <View style={{ flex: 1 }}><Button label="English" tone={language === "en" ? "primary" : "ghost"} onPress={() => setLanguage("en")} /></View>
          </View>
        </View>
      )}
      {step === 1 && (
        <View>
          <Field label="Level" value={level} onChangeText={setLevel} placeholder="Degree, diploma..." />
          <Field label="Institution" value={institution} onChangeText={setInstitution} />
          <Field label="Year" value={year} onChangeText={setYear} placeholder="2024" />
          <Text style={{ color: palette.muted }}>Optional. You can add this later in profile.</Text>
        </View>
      )}
      {step === 2 && exams.map((exam) => (
        <Pressable key={exam.id} accessibilityRole="button" accessibilityLabel={exam.name} onPress={() => setExamId(exam.id)} style={{ borderWidth: 1, borderColor: examId === exam.id ? palette.green : palette.line, backgroundColor: examId === exam.id ? palette.greenSoft : palette.surface, borderRadius: 16, padding: 14, marginBottom: 8 }}>
          <Text style={{ color: palette.ink, fontWeight: "700" }}>{exam.name}</Text>
          <Text style={{ color: palette.muted }}>{exam.authority}</Text>
        </Pressable>
      ))}
      {step === 3 && (
        <View>
          <Text style={{ color: palette.muted, marginBottom: 8 }}>Optional. Leave blank if this is your first attempt.</Text>
          <Field label="Exam name" value={pastName} onChangeText={setPastName} />
          <Field label="Year" value={pastYear} onChangeText={setPastYear} />
          <Field label="Result" value={pastResult} onChangeText={setPastResult} placeholder="Attempted, qualified..." />
        </View>
      )}
      {step === 4 && (
        <View>
          <Button label={carry ? "Carry unfinished tasks forward" : "Keep tasks on their original day"} tone={carry ? "primary" : "ghost"} onPress={() => setCarry(!carry)} />
          <Button label={notes ? "In-app notifications on" : "In-app notifications off"} tone={notes ? "primary" : "ghost"} onPress={() => setNotes(!notes)} />
          <Text style={{ color: palette.muted, marginTop: 8 }}>In-app updates appear under the bell. You can schedule an Android study reminder from the planner.</Text>
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        {step > 0 ? <View style={{ flex: 1 }}><Button label="Back" tone="ghost" onPress={() => setStep(step - 1)} /></View> : null}
        <View style={{ flex: 1 }}>
          <Button label={step === 4 ? (loading ? "Saving" : "Finish") : "Next"} disabled={loading} onPress={() => step === 4 ? finish() : setStep(step + 1)} />
        </View>
      </View>
    </Screen>
  );
}
