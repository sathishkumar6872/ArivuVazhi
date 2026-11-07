import { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { api, todayKey, shiftDay, type Student } from "./api";
import type { Route } from "./nav";
import { useTheme } from "./theme";
import { Banner, Button, Card, Empty, Field, Header, IconTile, Loading, Progress, ScoreRing, Screen, Segment } from "./ui";
import { useLocale } from "./locale";

export function HomeScreen({ user, go }: { user: Student; go: (route: Route) => void }) {
  const { palette } = useTheme();
  const { language, t } = useLocale();
  const [data, setData] = useState<any>(null);
  const [mocks, setMocks] = useState<any[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api<any>("/dashboard"), api<any[]>("/mocks")])
      .then(([dash, list]) => { setData(dash); setMocks(list); })
      .catch((err) => setError(err.message));
  }, []);
  const tasks = data?.tasks || [];
  const planned = tasks.reduce((sum: number, task: any) => sum + (task.minutes || 0), 0);
  const done = tasks.filter((task: any) => task.status === "completed").reduce((sum: number, task: any) => sum + (task.minutes || 0), 0);
  const resume = mocks.find((mock) => mock.todayStatus === "in_progress");
  async function toggle(task: any) {
    const status = task.status === "completed" ? "pending" : "completed";
    await api(`/planner/${task.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setData({ ...data, tasks: tasks.map((item: any) => item.id === task.id ? { ...item, status } : item) });
  }
  const name = data?.greetingName || user.firstName;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const hello = language === "ta" ? (hour < 12 ? "வணக்கம்" : hour < 17 ? "வணக்கம்" : "வணக்கம்") : "Hi";
  const openCount = tasks.filter((task: any) => task.status !== "completed").length;
  const accuracy = data?.accuracy || 0;
  const streak = data?.streak || user.streak || 0;
  const ready = Boolean(data);
  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <View>
          <Text style={{ color: palette.primary, fontSize: 26, fontWeight: "800" }}>{hello} {name}!</Text>
          <Text style={{ color: palette.muted, marginTop: 2 }}>{ready ? (data?.exam?.name || "Choose your exam") : " "}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => go({ name: "alerts" })} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="notifications-outline" size={18} color={palette.primary} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => go({ name: "profile" })} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: palette.primary, fontWeight: "800" }}>{name?.[0] || "A"}</Text>
          </Pressable>
        </View>
      </View>
      {error ? <Banner message={error} /> : null}
      {!ready && !error ? <Loading variant="home" /> : null}

      {ready ? (
        <View>
          <Card style={{ backgroundColor: palette.primary, borderColor: palette.primary, marginTop: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <View style={{ width: 92, height: 92, borderRadius: 46, borderWidth: 8, borderColor: palette.accent, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#FFFFFF", fontSize: 24, fontWeight: "800" }}>{accuracy}%</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.mint, fontWeight: "700", fontSize: 12 }}>PRACTICE ACCURACY</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginTop: 4 }}>{streak} day study streak</Text>
                <Text style={{ color: "#D1FAE5", marginTop: 4 }}>{done} of {planned || 0} planned minutes done today</Text>
              </View>
            </View>
          </Card>

          <Pressable accessibilityRole="button" accessibilityLabel="Change exam" onPress={() => go({ name: "exams" })} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: palette.greenSoft, borderRadius: 16, padding: 14, marginTop: 12, marginBottom: 4 }}>
            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: palette.surface, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="school" size={20} color={palette.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.ink, fontWeight: "800", fontSize: 15 }}>{data?.exam?.name || "Choose an exam"}</Text>
              <Text style={{ color: palette.muted, marginTop: 2 }}>{t("Your current exam")}</Text>
            </View>
            <Text style={{ color: palette.green, fontWeight: "800" }}>{t("Change")}</Text>
          </Pressable>

          {resume ? (
            <Card onPress={() => go({ name: "mockRun", mockId: resume.id })} style={{ marginTop: 8, borderColor: palette.accent }}>
              <Text style={{ color: palette.green, fontWeight: "800" }}>Continue mock</Text>
              <Text style={{ color: palette.ink, fontWeight: "700", marginTop: 4 }}>{resume.title}</Text>
            </Card>
          ) : null}

          <Text style={{ color: palette.primary, fontSize: 17, fontWeight: "800", marginTop: 18, marginBottom: 8 }}>Quick actions</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            <IconTile icon="create-outline" label="Practice" onPress={() => go({ name: "practice" })} />
            <IconTile icon="document-text-outline" label="Mock Tests" onPress={() => go({ name: "mocks" })} />
            <IconTile icon="chatbubble-ellipses-outline" label="AI Tutor" onPress={() => go({ name: "tutor" })} />
            <IconTile icon="library-outline" label="Syllabus" onPress={() => go({ name: "exams" })} />
            <IconTile icon="calendar-outline" label="Study Plan" onPress={() => go({ name: "planner" })} />
            <IconTile icon="stats-chart-outline" label="Analytics" onPress={() => go({ name: "analytics" })} />
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, marginBottom: 8 }}>
            <Text style={{ color: palette.primary, fontSize: 17, fontWeight: "800" }}>{t("Today's plan")} ({openCount})</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Open planner" onPress={() => go({ name: "planner" })}><Text style={{ color: palette.green, fontWeight: "800" }}>{t("View all")}</Text></Pressable>
          </View>
          {tasks.map((task: any) => (
            <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={task.title} onPress={() => toggle(task)} style={{ flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.line, padding: 14, marginBottom: 8 }}>
              <Ionicons name={task.status === "completed" ? "checkmark-circle" : "ellipse-outline"} size={22} color={task.status === "completed" ? palette.green : "#C5D0C9"} />
              <Text style={{ flex: 1, color: palette.ink, fontWeight: "600" }}>{task.title}</Text>
              <Text style={{ color: palette.muted }}>{task.minutes}m</Text>
            </Pressable>
          ))}
          {!tasks.length ? <Empty title="No plan yet" body="Add a task from the planner." /> : null}
        </View>
      ) : null}
    </Screen>
  );
}

export function PlannerScreen({ back }: { back: () => void }) {
  const { palette } = useTheme();
  const [day, setDay] = useState(todayKey());
  const [tasks, setTasks] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [reminder, setReminder] = useState("");
  const [week, setWeek] = useState<Array<{ day: string; count: number }>>([]);
  const [view, setView] = useState("Today");
  async function load(date = day) {
    setTasks(await api<any[]>(`/planner?date=${date}`));
  }
  useEffect(() => {
    const start = shiftDay(todayKey(), -3);
    Promise.all(Array.from({ length: 7 }, (_, index) => {
      const date = shiftDay(start, index);
      return api<any[]>(`/planner?date=${date}`).then((items) => ({ day: date, count: items.length }));
    })).then(setWeek).catch(() => undefined);
  }, []);
  useEffect(() => { api<any[]>(`/planner?date=${day}`).then(setTasks).catch((err) => setError(err.message)); }, [day]);
  const done = tasks.filter((task) => task.status === "completed").length;
  const max = Math.max(1, ...week.map((item) => item.count));
  const monthPrefix = day.slice(0, 7);
  const monthDays = Array.from({ length: new Date(Number(monthPrefix.slice(0, 4)), Number(monthPrefix.slice(5, 7)), 0).getDate() }, (_, index) => `${monthPrefix}-${String(index + 1).padStart(2, "0")}`);
  return (
    <Screen>
      <Header title="Study planner" onBack={back} />
      <Segment options={["Today", "Week", "Month"]} value={view} onChange={setView} />
      {error ? <Banner message={error} /> : null}
      {reminder ? <Banner tone="success" message={reminder} /> : null}
      {view === "Week" && (
        <Card>
          <Text style={{ color: palette.ink, fontWeight: "800" }}>This week</Text>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 110, marginTop: 12 }}>
            {week.map((item) => (
              <Pressable key={item.day} accessibilityRole="button" accessibilityLabel={item.day} onPress={() => { setDay(item.day); setView("Today"); }} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
                <View style={{ width: 16, height: Math.max(8, Math.round((item.count / max) * 84)), borderRadius: 8, backgroundColor: item.day === day ? palette.green : palette.greenSoft }} />
                <Text style={{ color: palette.muted, fontSize: 11, marginTop: 4 }}>{item.day.slice(8)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={{ color: palette.muted, marginTop: 8 }}>Bar height is the number of planned tasks that day.</Text>
        </Card>
      )}
      {view === "Month" && (
        <Card>
          <Text style={{ color: palette.ink, fontWeight: "800", marginBottom: 10 }}>{monthPrefix}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {monthDays.map((date) => (
              <Pressable key={date} accessibilityRole="button" accessibilityLabel={date} onPress={() => { setDay(date); setView("Today"); }} style={{ width: "12.5%", aspectRatio: 1, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: date === day ? palette.green : date === todayKey() ? palette.greenSoft : palette.bg }}>
                <Text style={{ color: date === day ? palette.greenInk : palette.ink, fontWeight: "700" }}>{Number(date.slice(8))}</Text>
              </Pressable>
            ))}
          </View>
        </Card>
      )}
      <Text style={{ color: palette.muted, marginBottom: 8 }}>{day} · {done} of {tasks.length} complete</Text>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
        {week.map((item) => (
          <Pressable key={item.day} accessibilityRole="button" accessibilityLabel={item.day} onPress={() => setDay(item.day)} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", backgroundColor: item.day === day ? palette.green : palette.surface }}>
            <Text style={{ color: item.day === day ? palette.greenInk : palette.ink, fontSize: 11, fontWeight: "700" }}>{item.day.slice(8)}</Text>
          </Pressable>
        ))}
      </View>
      {tasks.map((task) => (
        <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={task.title} onPress={async () => { await api(`/planner/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: task.status === "completed" ? "pending" : "completed" }) }); await load(day); }} style={{ flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.line, padding: 14, marginBottom: 8 }}>
          <Ionicons name={task.status === "completed" ? "checkmark-circle" : "ellipse-outline"} size={22} color={task.status === "completed" ? palette.green : "#C5D0C9"} />
          <Text style={{ flex: 1, color: palette.ink, fontWeight: "600" }}>{task.title}</Text>
          <Text style={{ color: palette.muted }}>{task.minutes}m</Text>
        </Pressable>
      ))}
      {!tasks.length && <Empty title="Nothing on this day" body="Add a task below. Unfinished work moves to today when carry-forward is on." />}
      <Field label="New task" value={title} onChangeText={setTitle} />
      <Button label="Add 30 min task" onPress={async () => {
        if (title.trim().length < 2) { setError("Task title needs at least 2 characters."); return; }
        await api("/planner", { method: "POST", body: JSON.stringify({ title, dueDate: day, minutes: 30 }) });
        setTitle("");
        await load(day);
      }} />
      <Button label={Platform.OS === "web" ? "Study reminders are on Android" : "Remind me in 1 hour"} tone="ghost" disabled={Platform.OS === "web"} onPress={async () => {
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("study-reminders", { name: "Study reminders", importance: AndroidImportance.DEFAULT });
        }
        const permission = await Notifications.requestPermissionsAsync();
        if (!permission.granted) { setError("Notification permission was not granted."); return; }
        await Notifications.scheduleNotificationAsync({
          content: { title: "ArivuVazhi study plan", body: tasks.find((task) => task.status !== "completed")?.title || "Open your study plan and complete one task." },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3600, channelId: "study-reminders" },
        });
        setReminder("Study reminder scheduled for one hour from now.");
      }} />
    </Screen>
  );
}

export function AnalyticsScreen({ back }: { back: () => void }) {
  const { palette } = useTheme();
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [mocks, setMocks] = useState<any[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api<any>("/analytics"), api<any[]>("/practice/history"), api<any[]>("/mocks")])
      .then(([stats, sessions, tests]) => { setData(stats); setHistory(sessions); setMocks(tests.filter((item) => item.lastScore)); })
      .catch((err) => setError(err.message));
  }, []);
  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDay(todayKey(), index - 6);
    const sessions = history.filter((item) => String(item.completedAt || item.updatedAt || item.createdAt || "").slice(0, 10) === date);
    const answered = sessions.reduce((sum, item) => sum + (item.total || item.answered || 0), 0);
    return { date, answered };
  });
  const trendMax = Math.max(1, ...trend.map((item) => item.answered));
  return (
    <Screen>
      <Header title="Analytics" subtitle={data?.readiness || "Building"} onBack={back} />
      {error ? <Banner message={error} /> : null}
      {!data && !error ? <Loading variant="home" /> : null}
      {data && (
        <View>
          <ScoreRing value={data.accuracy || 0} caption={data.readiness || "Accuracy"} />
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            {[
              ["Questions", data.attempted],
              ["Streak", `${data.streak}d`],
              ["Syllabus", `${data.syllabusCompletion}%`],
            ].map(([label, value]) => (
              <View key={String(label)} style={{ flex: 1, backgroundColor: palette.surface, borderRadius: 14, borderWidth: 1, borderColor: palette.line, padding: 12, alignItems: "center" }}>
                <Text style={{ color: palette.ink, fontSize: 18, fontWeight: "800" }}>{value}</Text>
                <Text style={{ color: palette.muted, fontSize: 12 }}>{label}</Text>
              </View>
            ))}
          </View>
          <Card>
            <Text style={{ color: palette.ink, fontWeight: "800" }}>Last 7 days practice</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 96, marginTop: 12 }}>
              {trend.map((item) => (
                <View key={item.date} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
                  <View style={{ width: 14, height: Math.max(6, Math.round((item.answered / trendMax) * 64)), backgroundColor: palette.green, borderRadius: 7 }} />
                  <Text style={{ color: palette.muted, fontSize: 10, marginTop: 4 }}>{new Date(`${item.date}T00:00:00`).toLocaleDateString("en", { weekday: "narrow" })}</Text>
                </View>
              ))}
            </View>
            <Text style={{ color: palette.muted, fontSize: 12, marginTop: 6 }}>Questions answered each day</Text>
          </Card>
          <Text style={{ color: palette.ink, fontSize: 18, fontWeight: "800", marginBottom: 8 }}>Subjects</Text>
          {(data.subjects || []).map((subject: any) => (
            <Card key={subject.name}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: palette.ink, fontWeight: "700" }}>{subject.name}</Text><Text style={{ color: palette.green, fontWeight: "800" }}>{subject.accuracy}%</Text></View>
              <Progress value={subject.accuracy} />
              <Text style={{ color: palette.muted }}>{subject.attempted} attempted</Text>
            </Card>
          ))}
          {(data.subjects || []).length > 0 && (
            <Card>
              <Text style={{ color: palette.ink, fontWeight: "800" }}>Strengths and focus</Text>
              <Text style={{ color: palette.muted, marginTop: 6 }}>Stronger: {(data.subjects.filter((subject: any) => subject.accuracy >= 60).map((subject: any) => subject.name).join(", ")) || "none yet"}</Text>
              <Text style={{ color: palette.muted, marginTop: 4 }}>Focus next: {(data.subjects.filter((subject: any) => subject.accuracy < 60).map((subject: any) => subject.name).join(", ")) || "none below 60%"}</Text>
            </Card>
          )}
          {!data.subjects?.length && <Empty title="No subject split yet" body="Finish a practice set to see strengths and weak areas." />}
          <Text style={{ color: palette.ink, fontSize: 18, fontWeight: "700", marginVertical: 8 }}>Recent practice</Text>
          {history.slice(0, 6).map((session) => (
            <Card key={session.id}><Text style={{ color: palette.ink, fontWeight: "700" }}>{session.correct}/{session.total} correct</Text><Text style={{ color: palette.muted }}>{session.status}</Text></Card>
          ))}
          <Text style={{ color: palette.ink, fontSize: 18, fontWeight: "700", marginVertical: 8 }}>Mock scores</Text>
          {mocks.map((mock) => <Card key={mock.id}><Text style={{ color: palette.ink, fontWeight: "700" }}>{mock.title}</Text><Text style={{ color: palette.muted }}>Last score {mock.lastScore.rawScore} / {mock.lastScore.maxScore}</Text></Card>)}
          {!mocks.length && <Empty title="No mock score yet" body="Submit a mock test to see it here. Scoring stays on the server." />}
          <Text style={{ color: palette.muted, marginTop: 8 }}>{data.caveat}</Text>
        </View>
      )}
    </Screen>
  );
}

export function AlertsScreen({ back }: { back: () => void }) {
  const { palette } = useTheme();
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<any[]>("/notifications").then(setItems).catch((err) => setError(err.message)); }, []);
  return (
    <Screen>
      <Header title="Notifications" onBack={back} />
      {error ? <Banner message={error} /> : null}
      {!items && !error ? <Loading /> : null}
      {items?.map((item) => (
        <Card key={item.id} onPress={async () => { await api(`/notifications/${item.id}/read`, { method: "POST" }); setItems(items.map((row) => row.id === item.id ? { ...row, read: true } : row)); }}>
          <Text style={{ color: palette.ink, fontWeight: "700" }}>{item.title}</Text>
          <Text style={{ color: palette.muted }}>{item.body}</Text>
          <Text style={{ color: item.read ? palette.muted : palette.green, fontWeight: "700", marginTop: 6 }}>{item.read ? "Read" : "New"}</Text>
        </Card>
      ))}
      {items && !items.length && <Empty title="No notifications" body="Exam and support updates will appear here." />}
    </Screen>
  );
}
