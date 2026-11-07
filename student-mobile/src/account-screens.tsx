import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, type Student } from "./api";
import type { Route } from "./nav";
import { useTheme } from "./theme";
import { Banner, Button, Card, Dialog, Empty, Field, Header, IconButton, Loading, Screen } from "./ui";
import { useLocale } from "./locale";

export function ProfileScreen({ user, go, logout }: { user: Student; go: (route: Route) => void; logout: () => void }) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const [confirm, setConfirm] = useState(false);
  const quick: Array<{ label: string; icon: keyof typeof Ionicons.glyphMap; route: Route }> = [
    { label: "Analytics", icon: "stats-chart-outline", route: { name: "analytics" } },
    { label: "Notes", icon: "document-text-outline", route: { name: "notes" } },
    { label: "Bookmarks", icon: "bookmark-outline", route: { name: "bookmarks" } },
    { label: "Achievements", icon: "ribbon-outline", route: { name: "achievements" } },
  ];
  const rows: Array<{ label: string; icon: keyof typeof Ionicons.glyphMap; route: Route }> = [
    { label: "Edit profile", icon: "create-outline", route: { name: "editProfile" } },
    { label: "Settings", icon: "settings-outline", route: { name: "settings" } },
    { label: "AI memory", icon: "sparkles-outline", route: { name: "settings" } },
    { label: "Help and support", icon: "help-circle-outline", route: { name: "support" } },
    { label: "Notifications", icon: "notifications-outline", route: { name: "alerts" } },
  ];
  return (
    <Screen>
      <View style={{ backgroundColor: palette.primary, borderRadius: 24, padding: 18, marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ width: 68, height: 68, borderRadius: 22, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: palette.primary, fontSize: 26, fontWeight: "800" }}>{user.firstName?.[0] || "A"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "800" }}>{user.firstName} {user.lastName}</Text>
            <Text style={{ color: palette.mint, marginTop: 2 }} numberOfLines={1}>{user.email}</Text>
            <Text style={{ color: palette.highlight, fontSize: 12, fontWeight: "700", marginTop: 6 }}>
              {(user.preferences?.appLanguage || user.language) === "ta" ? t("Tamil") : t("English")} · Exam {user.language === "ta" ? t("Tamil") : t("English")}
            </Text>
          </View>
          <IconButton label={t("Edit profile")} icon="create-outline" tone="ghost" onPress={() => go({ name: "editProfile" })} />
        </View>
      </View>

      <Text style={{ color: palette.primary, fontWeight: "800", marginBottom: 10 }}>Quick access</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 8 }}>
        {quick.map((item) => (
          <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => go(item.route)} style={{ width: "23%", alignItems: "center", marginBottom: 12 }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
              <Ionicons name={item.icon} size={22} color={palette.primary} />
            </View>
            <Text style={{ color: palette.ink, fontSize: 11, fontWeight: "700", textAlign: "center" }}>{t(item.label)}</Text>
          </Pressable>
        ))}
      </View>

      <Card style={{ paddingVertical: 4, marginBottom: 12 }}>
        {rows.map((row, index) => (
          <Pressable key={row.label} accessibilityRole="button" accessibilityLabel={row.label} onPress={() => go(row.route)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderTopWidth: index ? 1 : 0, borderTopColor: palette.line }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: palette.greenSoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={row.icon} size={18} color={palette.primary} />
            </View>
            <Text style={{ flex: 1, color: palette.ink, fontWeight: "700" }}>{t(row.label)}</Text>
            <Ionicons name="chevron-forward" size={16} color={palette.muted} />
          </Pressable>
        ))}
      </Card>

      <Pressable accessibilityRole="button" accessibilityLabel="Logout" onPress={() => setConfirm(true)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, backgroundColor: palette.dangerSoft, padding: 14 }}>
        <Ionicons name="log-out-outline" size={18} color={palette.danger} />
        <Text style={{ color: palette.danger, fontWeight: "800" }}>{t("Logout")}</Text>
      </Pressable>
      <Dialog visible={confirm} title="Log out?" body="This device will forget the session. You can sign in again." confirm="Logout" cancel="Stay" danger onCancel={() => setConfirm(false)} onConfirm={logout} />
    </Screen>
  );
}

type EduRow = { level: string; institution: string; year: string };
type ExpRow = { examName: string; year: string; result: string };

function emptyEdu(): EduRow { return { level: "", institution: "", year: "" }; }
function emptyExp(): ExpRow { return { examName: "", year: "", result: "" }; }

function LanguagePick({ label, value, onChange }: { label?: string; value: "ta" | "en"; onChange: (value: "ta" | "en") => void }) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const options: Array<"ta" | "en"> = ["ta", "en"];
  return (
    <View style={{ marginBottom: 8 }}>
      {label ? <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600", marginBottom: 6 }}>{label}</Text> : null}
      <View style={{ flexDirection: "row", backgroundColor: palette.greenSoft, borderRadius: 14, padding: 4 }}>
        {options.map((option) => {
          const active = value === option;
          return (
            <Pressable key={option} accessibilityRole="button" accessibilityLabel={option === "ta" ? t("Tamil") : t("English")} onPress={() => onChange(option)} style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: active ? palette.primary : "transparent" }}>
              <Text style={{ color: active ? palette.greenInk : palette.muted, fontWeight: "800", fontSize: 13 }}>{option === "ta" ? t("Tamil") : t("English")}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function EditProfileScreen({ user, onUser, back }: { user: Student; onUser: (user: Student) => void; back: () => void }) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [appLanguage, setAppLanguage] = useState<"ta" | "en">(user.preferences?.appLanguage || user.language || "en");
  const [examLanguage, setExamLanguage] = useState<"ta" | "en">(user.language || "en");
  const [education, setEducation] = useState<EduRow[]>(
    user.education?.length
      ? user.education.map((row) => ({ level: row.level || "", institution: row.institution || "", year: row.year || "" }))
      : [emptyEdu()],
  );
  const [experience, setExperience] = useState<ExpRow[]>(
    user.examHistory?.length
      ? user.examHistory.map((row) => ({ examName: row.examName || "", year: row.year || "", result: row.result || "" }))
      : [emptyExp()],
  );
  const [exams, setExams] = useState<Array<{ id: string; name: string; authority?: string }>>([]);
  const [examId, setExamId] = useState(user.primaryExamId || "");
  const [examOpen, setExamOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<Array<{ id: string; name: string; authority?: string }>>("/exams")
      .then((items) => {
        setExams(items);
        if (!examId && items[0]) setExamId(items[0].id);
      })
      .catch((err) => setError(err.message));
  }, []);

  const selectedExam = exams.find((item) => item.id === examId);

  function updateEdu(index: number, patch: Partial<EduRow>) {
    setEducation((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function updateExp(index: number, patch: Partial<ExpRow>) {
    setExperience((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function save() {
    if (firstName.trim().length < 1) { setError("Enter your first name."); return; }
    const educationPayload = education
      .map((row) => ({ level: row.level.trim(), institution: row.institution.trim(), year: row.year.trim() }))
      .filter((row) => row.level && row.institution && row.year);
    const partialEdu = education.some((row) => (row.level || row.institution || row.year) && !(row.level.trim() && row.institution.trim() && row.year.trim()));
    if (partialEdu) { setError("Complete each education row (level, institution, year) or clear it."); return; }
    const experiencePayload = experience
      .map((row) => ({ examName: row.examName.trim(), year: row.year.trim(), result: row.result.trim() || "attempted" }))
      .filter((row) => row.examName);
    const partialExp = experience.some((row) => (row.year || row.result) && !row.examName.trim());
    if (partialExp) { setError("Each experience row needs an exam name, or clear the row."); return; }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      let next = await api<Student>("/profile", {
        method: "PATCH",
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          language: examLanguage,
          education: educationPayload,
          examHistory: experiencePayload,
          preferences: {
            carryForward: user.preferences?.carryForward ?? true,
            notifications: user.preferences?.notifications ?? true,
            appLanguage,
          },
        }),
      });
      if (examId && examId !== user.primaryExamId) {
        next = await api<Student>(`/exams/${examId}/select`, { method: "POST", body: JSON.stringify({ primary: true }) });
      }
      onUser(next);
      setMessage("Profile saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Header title={t("Edit profile")} subtitle="Update your student details" onBack={back} />
      {error ? <Banner message={error} /> : null}
      {message ? <Banner tone="success" message={message} /> : null}

      <View style={{ alignItems: "center", marginBottom: 18 }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: palette.primary, fontSize: 32, fontWeight: "800" }}>{(firstName || "A")[0]}</Text>
        </View>
        <Text style={{ color: palette.ink, fontWeight: "700", marginTop: 10 }}>{user.email}</Text>
        <Text style={{ color: palette.muted, fontSize: 12, marginTop: 2, textAlign: "center" }}>Email cannot be changed in this release</Text>
      </View>

      <Card style={{ marginBottom: 12 }}>
        <Text style={{ color: palette.primary, fontWeight: "800", marginBottom: 12 }}>{t("Personal")}</Text>
        <Field label="First name" value={firstName} onChangeText={setFirstName} icon="person-outline" />
        <Field label="Last name" value={lastName} onChangeText={setLastName} />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboard="number-pad" icon="call-outline" />
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <Text style={{ color: palette.primary, fontWeight: "800", marginBottom: 4 }}>{t("App language")}</Text>
        <Text style={{ color: palette.muted, marginBottom: 8, fontSize: 13 }}>Menus, tabs and labels in the app.</Text>
        <LanguagePick label="" value={appLanguage} onChange={setAppLanguage} />
        <Text style={{ color: palette.primary, fontWeight: "800", marginBottom: 4 }}>{t("Exam language")}</Text>
        <Text style={{ color: palette.muted, marginBottom: 8, fontSize: 13 }}>
          Practice, mock and syllabus questions this language-la generate aagum. Tutor follows whatever you type.
        </Text>
        <LanguagePick label="" value={examLanguage} onChange={setExamLanguage} />
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <Text style={{ color: palette.primary, fontWeight: "800", marginBottom: 8 }}>{t("Exam goal")}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Exam goal" onPress={() => setExamOpen(!examOpen)} style={{ borderWidth: 1, borderColor: palette.line, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: palette.bg }}>
          <Text style={{ color: selectedExam ? palette.ink : palette.muted, fontSize: 16, flex: 1 }}>{selectedExam?.name || "Select exam"}</Text>
          <Ionicons name={examOpen ? "chevron-up" : "chevron-down"} size={18} color={palette.muted} />
        </Pressable>
        {examOpen ? (
          <View style={{ borderWidth: 1, borderColor: palette.line, borderRadius: 14, backgroundColor: palette.surface, marginTop: 8, overflow: "hidden" }}>
            {exams.map((exam) => (
              <Pressable key={exam.id} accessibilityRole="button" accessibilityLabel={exam.name} onPress={() => { setExamId(exam.id); setExamOpen(false); }} style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: palette.line, backgroundColor: exam.id === examId ? palette.greenSoft : palette.surface }}>
                <Text style={{ color: palette.ink, fontWeight: exam.id === examId ? "800" : "600" }}>{exam.name}</Text>
                {exam.authority ? <Text style={{ color: palette.muted, marginTop: 2 }}>{exam.authority}</Text> : null}
              </Pressable>
            ))}
            {!exams.length ? <Text style={{ color: palette.muted, padding: 14 }}>No published exams yet.</Text> : null}
          </View>
        ) : null}
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ color: palette.primary, fontWeight: "800" }}>{t("Education")}</Text>
          <IconButton label={t("Add education")} icon="add" tone="ghost" onPress={() => setEducation((rows) => [...rows, emptyEdu()])} />
        </View>
        {education.map((row, index) => (
          <View key={`edu-${index}`} style={{ borderWidth: 1, borderColor: palette.line, borderRadius: 14, padding: 12, marginBottom: 10, backgroundColor: palette.bg }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Text style={{ color: palette.muted, fontWeight: "700" }}>#{index + 1}</Text>
              {education.length > 1 ? (
                <IconButton label={t("Remove")} icon="trash-outline" tone="danger" onPress={() => setEducation((rows) => rows.filter((_, i) => i !== index))} />
              ) : null}
            </View>
            <Field label="Level" value={row.level} onChangeText={(value) => updateEdu(index, { level: value })} placeholder="Degree, diploma..." />
            <Field label="Institution" value={row.institution} onChangeText={(value) => updateEdu(index, { institution: value })} />
            <Field label="Year" value={row.year} onChangeText={(value) => updateEdu(index, { year: value })} placeholder="2024" />
          </View>
        ))}
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ color: palette.primary, fontWeight: "800" }}>{t("Experience")}</Text>
          <IconButton label={t("Add experience")} icon="add" tone="ghost" onPress={() => setExperience((rows) => [...rows, emptyExp()])} />
        </View>
        <Text style={{ color: palette.muted, marginBottom: 8, fontSize: 13 }}>Previous exam attempts. Leave empty if this is your first attempt.</Text>
        {experience.map((row, index) => (
          <View key={`exp-${index}`} style={{ borderWidth: 1, borderColor: palette.line, borderRadius: 14, padding: 12, marginBottom: 10, backgroundColor: palette.bg }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Text style={{ color: palette.muted, fontWeight: "700" }}>#{index + 1}</Text>
              {experience.length > 1 ? (
                <IconButton label={t("Remove")} icon="trash-outline" tone="danger" onPress={() => setExperience((rows) => rows.filter((_, i) => i !== index))} />
              ) : null}
            </View>
            <Field label="Exam name" value={row.examName} onChangeText={(value) => updateExp(index, { examName: value })} />
            <Field label="Year" value={row.year} onChangeText={(value) => updateExp(index, { year: value })} />
            <Field label="Result" value={row.result} onChangeText={(value) => updateExp(index, { result: value })} placeholder="Attempted, qualified..." />
          </View>
        ))}
      </Card>

      <Button label={t("Save changes")} icon="checkmark" loading={saving} onPress={save} />
      <Button label={t("Cancel")} tone="ghost" icon="close" onPress={back} />
    </Screen>
  );
}

export function NotesScreen({ back }: { back: () => void }) {
  const { palette } = useTheme();
  const [items, setItems] = useState<any[] | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState("");
  async function load() { setItems(await api<any[]>("/notes")); }
  useEffect(() => { api<any[]>("/notes").then(setItems).catch((err) => setError(err.message)); }, []);
  return (
    <Screen>
      <Header title="Notes" subtitle="Private to your account" onBack={back} />
      {error ? <Banner message={error} /> : null}
      <Field label="Write a note" value={body} onChangeText={setBody} />
      <Button label="Save note" icon="save-outline" disabled={!body.trim()} loading={saving} onPress={async () => {
        setSaving(true);
        try {
          await api("/notes", { method: "POST", body: JSON.stringify({ body }) });
          setBody("");
          await load();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not save note");
        } finally {
          setSaving(false);
        }
      }} />
      {!items && !error ? <Loading /> : null}
      {items?.map((note) => (
        <Card key={note.id}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <Text style={{ flex: 1, color: palette.ink, lineHeight: 20 }}>{note.body}</Text>
            <IconButton label="Delete" icon="trash-outline" tone="danger" loading={deleting === note.id} onPress={async () => {
              setDeleting(note.id);
              try {
                await api(`/notes/${note.id}`, { method: "DELETE" });
                await load();
              } finally {
                setDeleting("");
              }
            }} />
          </View>
        </Card>
      ))}
      {items && !items.length ? <Empty title="No notes yet" body="Save revision points and doubts here." /> : null}
    </Screen>
  );
}

export function AchievementsScreen({ user, back }: { user: Student; back: () => void }) {
  const { palette } = useTheme();
  const [stats, setStats] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  useEffect(() => {
    Promise.all([api<any>("/analytics"), api<any[]>("/practice/history")])
      .then(([analytics, sessions]) => { setStats(analytics); setHistory(sessions); });
  }, []);
  if (!stats) return <Screen><Header title="Achievements" onBack={back} /><Loading /></Screen>;
  const achievements = [
    { title: "First practice", detail: "Complete one practice set", earned: history.some((item) => item.status === "completed") },
    { title: "Five-day learner", detail: "Reach a 5 day study streak", earned: (stats.streak || user.streak || 0) >= 5 },
    { title: "Accuracy builder", detail: "Reach 75% practice accuracy", earned: stats.accuracy >= 75 },
    { title: "Syllabus explorer", detail: "Touch every syllabus topic", earned: stats.topicCount > 0 && stats.studiedTopics >= stats.topicCount },
  ];
  return (
    <Screen>
      <Header title="Achievements" subtitle="Personal milestones" onBack={back} />
      {achievements.map((item) => (
        <Card key={item.title} style={item.earned ? { backgroundColor: palette.greenSoft, borderColor: palette.green } : undefined}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Ionicons name={item.earned ? "ribbon" : "ribbon-outline"} size={24} color={item.earned ? palette.green : palette.muted} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.ink, fontWeight: "800" }}>{item.title}</Text>
              <Text style={{ color: palette.muted }}>{item.detail}</Text>
            </View>
            <Text style={{ color: item.earned ? palette.green : palette.muted, fontWeight: "700" }}>{item.earned ? "Earned" : "Locked"}</Text>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

export function SettingsScreen({ user, onUser, back }: { user: Student; onUser: (user: Student) => void; back: () => void }) {
  const { palette, toggle } = useTheme();
  const [memory, setMemory] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { api("/tutor/memory").then(setMemory).catch(() => undefined); }, []);
  async function save(patch: object) {
    setError("");
    try {
      onUser(await api<Student>("/profile", { method: "PATCH", body: JSON.stringify(patch) }));
      setMessage("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }
  return (
    <Screen>
      <Header title="Settings" onBack={back} />
      {error ? <Banner message={error} /> : null}
      {message ? <Banner tone="success" message={message} /> : null}
      <Card onPress={toggle}><Text style={{ color: palette.muted }}>Theme</Text><Text style={{ color: palette.ink, fontWeight: "800", marginTop: 4 }}>{palette.mode === "dark" ? "Dark" : "Light"} · tap to switch</Text></Card>
      <Card onPress={() => save({ preferences: { ...user.preferences, notifications: !user.preferences?.notifications } })}><Text style={{ color: palette.muted }}>Notifications</Text><Text style={{ color: palette.ink, fontWeight: "800", marginTop: 4 }}>{user.preferences?.notifications ? "In-app on" : "In-app off"}</Text></Card>
      <Card onPress={() => save({ preferences: { ...user.preferences, carryForward: !user.preferences?.carryForward } })}><Text style={{ color: palette.muted }}>Carry unfinished tasks</Text><Text style={{ color: palette.ink, fontWeight: "800", marginTop: 4 }}>{user.preferences?.carryForward ? "On" : "Off"}</Text></Card>
      <Card><Text style={{ color: palette.ink, fontWeight: "800" }}>Privacy and data</Text><Text style={{ color: palette.muted, marginTop: 4 }}>{"Practice, mocks and tutor memory stay on your account. Other students' scores are not shown."}</Text></Card>
      <Card><Text style={{ color: palette.ink, fontWeight: "800" }}>About ArivuVazhi</Text><Text style={{ color: palette.muted, marginTop: 4 }}>Government exam preparation. Release 1 is free. Email password reset is not connected.</Text></Card>
      <Text style={{ color: palette.muted, marginBottom: 8 }}>Profile name, phone, education and exam goal are under Edit profile.</Text>
      <Text style={{ color: palette.ink, fontWeight: "700", marginVertical: 8 }}>AI memory</Text>
      <Card onPress={async () => { const enabled = !user.aiMemoryEnabled; onUser(await api<Student>("/profile", { method: "PATCH", body: JSON.stringify({ aiMemoryEnabled: enabled }) })); await api("/tutor/memory", { method: "PATCH", body: JSON.stringify({ enabled }) }); }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={user.aiMemoryEnabled ? "sparkles" : "sparkles-outline"} size={18} color={palette.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.muted }}>Learning memory</Text>
            <Text style={{ color: palette.ink, fontWeight: "800", marginTop: 2 }}>{user.aiMemoryEnabled ? "On" : "Off"}</Text>
          </View>
        </View>
      </Card>
      {(memory?.items || []).slice(0, 4).map((item: any) => (
        <Field
          key={item.id}
          label="Memory item"
          value={item.text}
          onChangeText={(text) => setMemory({ ...memory, items: memory.items.map((row: any) => row.id === item.id ? { ...row, text } : row) })}
        />
      ))}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
        {(memory?.items || []).length ? (
          <View style={{ flex: 1 }}>
            <Button label="Save" icon="save-outline" tone="ghost" onPress={async () => {
              setMemory(await api("/tutor/memory", { method: "PATCH", body: JSON.stringify({ items: memory.items.map((item: any) => ({ id: item.id, text: item.text })) }) }));
              setMessage("Memory corrections saved");
            }} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button label="Reset" icon="refresh-outline" tone="danger" onPress={async () => { await api("/tutor/memory/reset", { method: "POST" }); setMemory({ ...memory, items: [] }); setMessage("Memory cleared"); }} />
        </View>
      </View>
    </Screen>
  );
}

export function SupportScreen({ back }: { back: () => void }) {
  const { palette } = useTheme();
  const [tickets, setTickets] = useState<any[] | null>(null);
  const [feedback, setFeedback] = useState<any[] | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState<"app_update" | "new_feature" | "bug" | "general">("new_feature");
  const [reply, setReply] = useState("");
  const [openId, setOpenId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    setTickets(await api<any[]>("/support/tickets"));
    setFeedback(await api<any[]>("/feedback"));
  }
  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);
  return (
    <Screen>
      <Header title="Help and support" onBack={back} />
      {error ? <Banner message={error} /> : null}
      {message ? <Banner tone="success" message={message} /> : null}

      <Text style={{ color: palette.primary, fontWeight: "800", marginBottom: 8 }}>App feedback</Text>
      <Text style={{ color: palette.muted, marginBottom: 8, fontSize: 13 }}>
        App update, new feature ideas, bugs — ithu product improve panna use aagum.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {([
          ["new_feature", "New feature"],
          ["app_update", "App update"],
          ["bug", "Bug"],
          ["general", "General"],
        ] as const).map(([value, label]) => (
          <View key={value} style={{ flexGrow: 1, minWidth: "45%" }}>
            <Button label={label} tone={feedbackCategory === value ? "primary" : "ghost"} onPress={() => setFeedbackCategory(value)} />
          </View>
        ))}
      </View>
      <Field label="Your feedback" value={feedbackMsg} onChangeText={setFeedbackMsg} />
      <Button label="Send feedback" icon="heart-outline" onPress={async () => {
        setError("");
        if (feedbackMsg.trim().length < 5) { setError("Feedback needs at least 5 characters."); return; }
        await api("/feedback", { method: "POST", body: JSON.stringify({ category: feedbackCategory, message: feedbackMsg.trim() }) });
        setFeedbackMsg("");
        setMessage("Feedback sent — thanks");
        await load();
      }} />
      {feedback?.slice(0, 3).map((item) => (
        <Card key={item.id}>
          <Text style={{ color: palette.ink, fontWeight: "700" }}>{item.category} · {item.status}</Text>
          <Text style={{ color: palette.muted }}>{item.message}</Text>
        </Card>
      ))}

      <Text style={{ color: palette.primary, fontWeight: "800", marginTop: 16, marginBottom: 8 }}>Support ticket</Text>
      <Field label="Subject" value={subject} onChangeText={setSubject} />
      <Field label="Message" value={body} onChangeText={setBody} />
      <Button label="Send ticket" icon="send" onPress={async () => {
        if (subject.trim().length < 3 || body.trim().length < 3) { setError("Subject and message need at least 3 characters."); return; }
        await api("/support/tickets", { method: "POST", body: JSON.stringify({ subject, body, category: "general" }) });
        setSubject(""); setBody(""); setMessage("Ticket sent");
        await load();
      }} />
      {!tickets && !error ? <Loading /> : null}
      {tickets?.map((ticket) => (
        <Card key={ticket.id}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.ink, fontWeight: "700" }}>{ticket.subject}</Text>
              <Text style={{ color: palette.muted }}>{ticket.status} · {ticket.body}</Text>
            </View>
            <IconButton label={openId === ticket.id ? "Hide reply" : "Reply"} icon={openId === ticket.id ? "chevron-up" : "chatbubble-outline"} tone="ghost" onPress={() => setOpenId(openId === ticket.id ? "" : ticket.id)} />
          </View>
          {openId === ticket.id && (
            <View style={{ marginTop: 8 }}>
              <Field label="Reply" value={reply} onChangeText={setReply} />
              <Button label="Send reply" icon="send" onPress={async () => { await api(`/support/tickets/${ticket.id}/reply`, { method: "POST", body: JSON.stringify({ body: reply }) }); setReply(""); setMessage("Reply sent"); await load(); }} />
            </View>
          )}
        </Card>
      ))}
      {tickets && !tickets.length && <Empty title="No tickets" body="Write to us if something in practice, mocks or the tutor looks wrong." />}
    </Screen>
  );
}
