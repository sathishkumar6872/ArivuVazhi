import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, type Student } from "./api";
import type { Route } from "./nav";
import { useTheme } from "./theme";
import { Banner, Button, Card, Choice, ColorIcon, Dialog, Empty, FRESH_LEVEL, Header, LevelSteps, Loading, Pill, Progress, ScoreRing, Screen, Segment, Sheet, accentAt, subjectVisual, type Level } from "./ui";

export function ExamsScreen({ user, go }: { user: Student; go: (route: Route) => void }) {
  const { palette } = useTheme();
  const [exams, setExams] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("My Exams");
  useEffect(() => { api<any[]>("/exams").then(setExams).catch((err) => setError(err.message)); }, []);
  const mine = (exams || []).filter((exam) => exam.id === user.primaryExamId || user.examIds?.includes(exam.id));
  const list = tab === "My Exams" ? mine : exams || [];
  return (
    <Screen>
      <Header title="Exams" />
      <Segment options={["My Exams", "All Exams"]} value={tab} onChange={setTab} />
      {error ? <Banner message={error} /> : null}
      {!exams && !error ? <Loading /> : null}
      {list.map((exam, index) => {
        const current = exam.id === user.primaryExamId;
        return (
          <Card key={exam.id} onPress={() => go({ name: "exam", examId: exam.id })} style={current ? { backgroundColor: palette.greenSoft, borderColor: palette.green } : undefined}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <ColorIcon icon="school" accent={current ? "green" : accentAt(index + 1)} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.primary, fontWeight: "800" }}>{exam.name}</Text>
                <Text style={{ color: palette.muted, marginTop: 2 }}>{current ? "Your current exam" : exam.authority}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.muted} />
            </View>
          </Card>
        );
      })}
      {exams && !list.length && <Empty title={tab === "My Exams" ? "No exam selected" : "No published exams"} body={tab === "My Exams" ? "Open All Exams and set one exam as current." : "An admin publishes an exam before it appears here."} />}
    </Screen>
  );
}

export function ExamScreen({ examId, user, onUser, back, go }: { examId: string; user: Student; onUser: (user: Student) => void; back: () => void; go: (route: Route) => void }) {
  const { palette } = useTheme();
  const [exam, setExam] = useState<any>(null);
  const [papers, setPapers] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("Overview");
  useEffect(() => {
    setError("");
    api(`/exams/${examId}`).then(setExam).catch((err) => setError(err.message));
  }, [examId]);
  useEffect(() => {
    if (tab !== "PYQ") return;
    setPapers(null);
    api<any[]>(`/pyq?examId=${examId}`)
      .then(setPapers)
      .catch((err) => setError(err.message));
  }, [tab, examId]);

  const subjects = exam?.subjects || [];
  const topicCount = subjects.reduce((sum: number, subject: any) => sum + (subject.topics?.length || 0), 0);
  // Level progress: each topic counts Easy/Medium/Hard passed as thirds.
  const studiedTopics = subjects.reduce(
    (sum: number, subject: any) => sum + (subject.topics || []).reduce((acc: number, topic: any) => acc + (topic.level?.percent || 0) / 100, 0),
    0,
  );
  const syllabusPercent = topicCount ? Math.round((studiedTopics / topicCount) * 100) : 0;
  const pattern = exam?.pattern;
  const isCurrent = exam?.id === user.primaryExamId;
  const examLanguage = user.language === "ta" ? "Tamil" : "English";

  return (
    <Screen>
      <Header title={exam?.name || "Exam"} subtitle={exam?.authority} onBack={back} />
      <Segment options={["Overview", "Syllabus", "Pattern", "PYQ"]} value={tab} onChange={setTab} />
      {error ? <Banner message={error} /> : null}
      {!exam && !error ? <Loading /> : null}

      {exam && tab === "Overview" && (
        <View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {isCurrent ? <Pill label="Your current exam" tone="good" /> : null}
            <Pill label={examLanguage} />
            <Pill label={exam.code || exam.authority} />
          </View>

          {exam.description ? (
            <Text style={{ color: palette.muted, lineHeight: 20, marginBottom: 14 }}>{exam.description}</Text>
          ) : null}

          <Card>
            <Text style={{ color: palette.ink, fontWeight: "800", marginBottom: 10 }}>Key facts</Text>
            <View style={{ gap: 8 }}>
              <FactRow label="Questions" value={pattern ? String(pattern.totalQuestions) : "—"} />
              <FactRow label="Duration" value={pattern ? `${pattern.durationMinutes} min` : "—"} />
              <FactRow label="Marks / Q" value={pattern ? String(pattern.marksPerQuestion) : "—"} />
              <FactRow label="Negative" value={pattern ? String(pattern.negativeMarks) : "—"} />
              <FactRow label="Syllabus" value={`${subjects.length} subjects · ${topicCount} topics`} />
              <FactRow label="Your coverage" value={topicCount ? `${syllabusPercent}% topics touched` : "Not started"} />
            </View>
          </Card>

          {topicCount > 0 ? (
            <View style={{ marginTop: 4, marginBottom: 8 }}>
              <Progress value={syllabusPercent} />
            </View>
          ) : null}

          {!isCurrent ? (
            <Button
              label="Set as current exam"
              onPress={async () =>
                onUser(await api(`/exams/${exam.id}/select`, { method: "POST", body: JSON.stringify({ primary: true }) }))
              }
            />
          ) : null}

          <Button
            label="Start practice"
            icon="play"
            onPress={() => go({ name: "quiz", examId: exam.id, title: `${exam.name} practice`, difficulty: "easy" })}
          />
          <Button label="Open syllabus" tone="ghost" onPress={() => setTab("Syllabus")} />
          <Button label="Daily mock" tone="ghost" onPress={() => go({ name: "mocks" })} />
        </View>
      )}

      {exam && tab === "Syllabus" && (
        subjects.length ? (
          subjects.map((subject: any, subjectIndex: number) => {
            const visual = subjectVisual(subject.name, subjectIndex);
            const total = subject.topics?.length || 0;
            const studied = (subject.topics || []).filter((topic: any) => topic.level?.mastered).length;
            const percent = subjectPercent(subject);
            return (
              <Card
                key={subject.id}
                onPress={() =>
                  go({
                    name: "topics",
                    subjectId: subject.id,
                    subjectName: subject.name,
                    examId: exam.id,
                  })
                }
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <ColorIcon icon={visual.icon} accent={visual.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.ink, fontWeight: "800" }}>{subject.name}</Text>
                    <Text style={{ color: palette.muted, marginTop: 4 }}>
                      {total} topics · {studied} mastered
                    </Text>
                    {total > 0 ? <Progress value={percent} /> : null}
                  </View>
                  <Text style={{ color: palette.green, fontWeight: "800" }}>{percent}%</Text>
                  <Ionicons name="chevron-forward" size={16} color={palette.muted} />
                </View>
              </Card>
            );
          })
        ) : (
          <Empty title="Syllabus coming" body="Subjects appear after admin refreshes this exam syllabus." />
        )
      )}

      {exam && tab === "Pattern" && (
        pattern ? (
          <View>
            <Card>
              <Text style={{ color: palette.ink, fontWeight: "800", marginBottom: 10 }}>Exam pattern</Text>
              <FactRow label="Total questions" value={String(pattern.totalQuestions)} />
              <FactRow label="Duration" value={`${pattern.durationMinutes} minutes`} />
              <FactRow label="Marks per question" value={String(pattern.marksPerQuestion)} />
              <FactRow label="Negative marking" value={String(pattern.negativeMarks)} />
            </Card>
            {(pattern.sections || []).length ? (
              <Card>
                <Text style={{ color: palette.ink, fontWeight: "800", marginBottom: 8 }}>Sections</Text>
                {pattern.sections.map((section: any, index: number) => (
                  <Text key={`${section.name}-${index}`} style={{ color: palette.muted, marginTop: 6 }}>
                    {section.name} · {section.questionCount} questions
                  </Text>
                ))}
              </Card>
            ) : null}
          </View>
        ) : (
          <Empty title="No pattern yet" body="Pattern details are not published for this exam." />
        )
      )}

      {exam && tab === "PYQ" && (
        <>
          {!papers && !error ? <Loading /> : null}
          {papers?.map((paper) => (
            <Card key={paper.id} onPress={() => go({ name: "pyqPaper", paperId: paper.id })}>
              <Text style={{ color: palette.ink, fontWeight: "700" }}>{paper.title}</Text>
              <Text style={{ color: palette.muted }}>
                {paper.year} · {paper.questionCount || paper.questionIds?.length || 0} questions · {paper.sourceName}
              </Text>
            </Card>
          ))}
          {papers && !papers.length && (
            <Empty title="No PYQ yet" body="Previous year papers for this exam will show here when published." />
          )}
        </>
      )}
    </Screen>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 4 }}>
      <Text style={{ color: palette.muted }}>{label}</Text>
      <Text style={{ color: palette.ink, fontWeight: "700", flexShrink: 1, textAlign: "right" }}>{value}</Text>
    </View>
  );
}

export function PyqScreen({ user, go, back }: { user: Student; go: (route: Route) => void; back: () => void }) {
  const { palette } = useTheme();
  const [papers, setPapers] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user.primaryExamId) {
      setPapers([]);
      return;
    }
    api<any[]>(`/pyq?examId=${user.primaryExamId}`).then(setPapers).catch((err) => setError(err.message));
  }, [user.primaryExamId]);
  return (
    <Screen>
      <Header title="Previous papers" subtitle="Only rights-verified papers" onBack={back} />
      {error ? <Banner message={error} /> : null}
      {!user.primaryExamId ? (
        <Empty title="Choose an exam" body="Set a current exam first, then open previous papers." />
      ) : null}
      {user.primaryExamId && !papers && !error ? <Loading /> : null}
      {papers?.map((paper) => (
        <Card key={paper.id} onPress={() => go({ name: "pyqPaper", paperId: paper.id })}>
          <Text style={{ color: palette.ink, fontWeight: "700" }}>{paper.title}</Text>
          <Text style={{ color: palette.muted }}>{paper.year} · {paper.questionCount} questions · {paper.sourceName}</Text>
        </Card>
      ))}
      {user.primaryExamId && papers && !papers.length && (
        <Empty title="No papers yet" body="A paper appears only after rights are verified and it is published." />
      )}
    </Screen>
  );
}

export function PyqPaperScreen({ paperId, back }: { paperId: string; back: () => void }) {
  const { palette } = useTheme();
  const [paper, setPaper] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  useEffect(() => {
    setIndex(0);
    setAnswers({});
    setResult(null);
    api(`/pyq/${paperId}`).then(setPaper).catch((err) => setError(err.message));
  }, [paperId]);

  const questions = paper?.questions || [];
  const question = questions[index];
  const selected = question ? answers[question.id] : "";
  const answeredCount = Object.keys(answers).length;

  async function submitPaper() {
    setBusy(true);
    setError("");
    try {
      const payload = await api<any>(`/pyq/${paperId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          answers: Object.entries(answers).map(([questionId, selectedKey]) => ({ questionId, selectedKey })),
        }),
      });
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header
        title={paper?.title || "Paper"}
        subtitle={paper ? `${paper.year} · ${questions.length} questions` : undefined}
        onBack={back}
      />
      {error ? <Banner message={error} /> : null}
      {!paper && !error ? <Loading /> : null}
      {paper && !questions.length ? (
        <Empty title="No questions" body="This paper has no published questions yet." />
      ) : null}

      {paper && questions.length > 0 && !result && question && (
        <View>
          <Text style={{ color: palette.muted, marginBottom: 8 }}>
            Q {index + 1} of {questions.length} · keys unlock only after submit
          </Text>
          <Progress value={((index + (selected ? 1 : 0)) / questions.length) * 100} />
          <Text style={{ color: palette.ink, fontSize: 17, fontWeight: "700", lineHeight: 24, marginVertical: 12 }}>
            {question.stem}
          </Text>
          {question.options.map((option: any) => (
            <Choice
              key={option.key}
              letter={option.key}
              text={option.text}
              state={selected === option.key ? "selected" : "idle"}
              onPress={() => setAnswers((current) => ({ ...current, [question.id]: option.key }))}
            />
          ))}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="Previous" tone="ghost" disabled={index === 0} onPress={() => setIndex(index - 1)} />
            </View>
            <View style={{ flex: 1 }}>
              {index + 1 < questions.length ? (
                <Button label="Next" disabled={!selected} onPress={() => setIndex(index + 1)} />
              ) : (
                <Button
                  label={busy ? "Submitting…" : "Submit paper"}
                  disabled={answeredCount < questions.length || busy}
                  onPress={submitPaper}
                />
              )}
            </View>
          </View>
          {answeredCount < questions.length && index + 1 >= questions.length ? (
            <Banner tone="info" message={`Answer all questions to submit (${answeredCount}/${questions.length}).`} />
          ) : null}
        </View>
      )}

      {result && (
        <View>
          <Card>
            <Text style={{ color: palette.ink, fontSize: 28, fontWeight: "800" }}>
              {result.correct} / {result.total}
            </Text>
            <Text style={{ color: palette.muted }}>
              {Math.round((result.correct / result.total) * 100)}% · scored after submit
            </Text>
            <Progress value={Math.round((result.correct / result.total) * 100)} />
          </Card>
          {(result.questions || []).map((item: any, qIndex: number) => (
            <Card
              key={item.id}
              style={{
                backgroundColor: item.correct ? palette.greenSoft : palette.dangerSoft,
                borderColor: "transparent",
              }}
            >
              <Text style={{ color: palette.ink, fontWeight: "700" }}>{qIndex + 1}. {item.stem}</Text>
              <Text style={{ color: item.correct ? palette.green : palette.danger, fontWeight: "800", marginTop: 6 }}>
                {item.correct ? "Correct" : `Your answer ${item.selectedKey || "—"} · Key ${item.correctKey}`}
              </Text>
              {item.explanation ? (
                <Text style={{ color: palette.muted, marginTop: 6 }}>{item.explanation}</Text>
              ) : null}
            </Card>
          ))}
          <Button label="Back" onPress={back} />
        </View>
      )}
    </Screen>
  );
}

/** Average Easy → Medium → Hard progress of a subject's topics (0–100). */
function subjectPercent(subject: any) {
  const topics = subject?.topics || [];
  if (!topics.length) return 0;
  return Math.round(topics.reduce((sum: number, topic: any) => sum + (topic.level?.percent || 0), 0) / topics.length);
}

/** Levels open in at least one topic (Quick practice uses only those topics). */
function openLevels(subjects: any[]): Record<Level, boolean> {
  const topics = subjects.flatMap((subject: any) => subject.topics || []);
  return {
    easy: true,
    medium: topics.some((topic: any) => topic.level?.levels?.medium?.unlocked),
    hard: topics.some((topic: any) => topic.level?.levels?.hard?.unlocked),
  };
}

const LEVEL_NAME: Record<Level, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
const STATUS_LABEL: Record<string, string> = { completed: "Completed", abandoned: "Left midway", active: "In progress" };

/** One topic row: name, level chips and overall level progress. Tapping the row practises the current level. */
function TopicLevelCard({ topic, subtitle, onStart }: { topic: any; subtitle?: string; onStart: (level: Level) => void }) {
  const { palette } = useTheme();
  const level = topic.level || FRESH_LEVEL;
  return (
    <Card onPress={() => onStart(level.current)}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: palette.ink, fontWeight: "800" }}>{topic.name}</Text>
          <Text style={{ color: palette.muted, fontSize: 12, marginTop: 2 }}>
            {subtitle ? `${subtitle} · ` : ""}{level.mastered ? "Mastered" : `Next: ${LEVEL_NAME[level.current as Level]}`}
          </Text>
        </View>
        <Text style={{ color: palette.green, fontWeight: "800" }}>{level.percent}%</Text>
      </View>
      <LevelSteps level={level} onPick={onStart} />
    </Card>
  );
}

export function PracticeScreen({ user, go }: { user: Student; go: (route: Route) => void }) {
  const { palette } = useTheme();
  const [exam, setExam] = useState<any>(null);
  const [marks, setMarks] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [resume, setResume] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(user.primaryExamId));
  const [tab, setTab] = useState("Subjects");
  const [difficulty, setDifficulty] = useState<Level>("easy");
  useEffect(() => {
    if (!user.primaryExamId) {
      setExam(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    Promise.all([
      api(`/exams/${user.primaryExamId}`),
      api<any[]>("/bookmarks").catch(() => []),
      api<any[]>("/practice/history").catch(() => []),
      api<any>(`/practice/active?examId=${user.primaryExamId}`).catch(() => null),
    ])
      .then(([nextExam, nextMarks, nextHistory, nextResume]) => {
        if (!alive) return;
        setExam(nextExam);
        setMarks(nextMarks);
        setHistory(nextHistory);
        setResume(nextResume);
        setError("");
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user.primaryExamId]);
  const subjects = exam?.subjects || [];
  const topics = subjects.flatMap((subject: any) => (subject.topics || []).map((topic: any) => ({ ...topic, subjectName: subject.name })));
  const open = openLevels(subjects);
  const startTopic = (topic: any, level: Level) => go({ name: "quiz", examId: user.primaryExamId, topicId: topic.id, title: topic.name, difficulty: level });
  return (
    <Screen>
      <Header title="Practice" subtitle={exam?.name || "Primary exam"} />
      {resume ? (
        <Card onPress={() => go({ name: "quiz", examId: resume.examId, topicId: resume.topicId || undefined, title: resume.topicName || "Practice", difficulty: resume.difficulty || undefined, sessionId: resume.id })} style={{ backgroundColor: palette.greenSoft, borderColor: palette.green }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Ionicons name="play-circle" size={30} color={palette.green} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.primary, fontWeight: "800" }}>Continue practice</Text>
              <Text style={{ color: palette.muted, marginTop: 2 }}>
                {resume.topicName || "Quick practice"}{resume.difficulty ? ` · ${LEVEL_NAME[resume.difficulty as Level]}` : ""} · {resume.answered} of {resume.total} done
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={palette.muted} />
          </View>
        </Card>
      ) : null}
      <Segment options={["Subjects", "Topics", "Saved", "History"]} value={tab} onChange={setTab} />
      {error ? <Banner message={error} /> : null}
      {loading ? <Loading label="Loading practice…" /> : null}
      {!loading && !user.primaryExamId && (
        <Empty title="Choose an exam" body="Open the Exams tab, pick an exam, then set it as your current exam." />
      )}
      {!loading && user.primaryExamId && tab === "Subjects" && (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ color: palette.muted, fontWeight: "700", marginBottom: 6 }}>Quick practice level</Text>
          <Segment options={["easy", "medium", "hard"]} value={difficulty} onChange={(value) => setDifficulty(value as Level)} />
          {open[difficulty] ? (
            <Button
              label={`Quick 5 · ${LEVEL_NAME[difficulty]}`}
              icon="flash"
              onPress={() => go({ name: "quiz", examId: user.primaryExamId, title: `Quick practice · ${LEVEL_NAME[difficulty]}`, difficulty })}
            />
          ) : (
            <Banner tone="info" message={`${LEVEL_NAME[difficulty]} unlocks topic by topic: score ${difficulty === "medium" ? "80% in Easy" : "70% in Medium"} (10+ questions) on a topic first.`} />
          )}
        </View>
      )}
      {!loading && tab === "Subjects" && user.primaryExamId && subjects.map((subject: any, subjectIndex: number) => {
        const rows = subject.topics || [];
        const percent = subjectPercent(subject);
        const mastered = rows.filter((topic: any) => topic.level?.mastered).length;
        const visual = subjectVisual(subject.name, subjectIndex);
        return (
          <Card key={subject.id} onPress={() => go({ name: "topics", subjectId: subject.id, subjectName: subject.name, examId: user.primaryExamId })}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <ColorIcon icon={visual.icon} accent={visual.accent} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: palette.ink, fontWeight: "800", flex: 1 }}>{subject.name}</Text>
                  <Text style={{ color: palette.green, fontWeight: "800" }}>{percent}%</Text>
                </View>
                <Progress value={percent} />
                <Text style={{ color: palette.muted }}>{rows.length} {rows.length === 1 ? "topic" : "topics"} · {mastered} mastered</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.muted} />
            </View>
          </Card>
        );
      })}
      {!loading && tab === "Subjects" && user.primaryExamId && exam && !subjects.length && (
        <Empty title="No syllabus yet" body="Subjects for your exam are being prepared. Please check back soon." />
      )}
      {!loading && tab === "Topics" && topics.map((topic: any) => (
        <TopicLevelCard key={topic.id} topic={topic} subtitle={topic.subjectName} onStart={(level) => startTopic(topic, level)} />
      ))}
      {!loading && tab === "Topics" && user.primaryExamId && exam && !topics.length && (
        <Empty title="No topics yet" body="Topics for your exam are being prepared. Please check back soon." />
      )}
      {!loading && tab === "Saved" && marks.map((question) => (
        <Card key={question.id}><Text style={{ color: palette.ink, fontWeight: "700" }}>{question.stem}</Text></Card>
      ))}
      {!loading && tab === "Saved" && !marks.length && <Empty title="No bookmarks" body="Save a question after you check the answer." />}
      {!loading && tab === "History" && history.map((session) => (
        <Card
          key={session.id}
          onPress={session.answered ? () => go({
            name: "practiceResult",
            sessionId: session.id,
            examId: session.examId,
            topicId: session.topicId || undefined,
            title: session.topicName || "Quick practice",
            difficulty: session.difficulty || undefined,
            kind: session.kind,
            correct: session.correct,
            answered: session.answered,
            total: session.total,
          }) : undefined}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ color: palette.ink, fontWeight: "800", flex: 1 }}>{session.topicName || "Quick practice"}</Text>
            <Text style={{ color: palette.green, fontWeight: "800" }}>{session.correct}/{session.answered}</Text>
          </View>
          <Text style={{ color: palette.muted, marginTop: 2 }}>
            {session.kind === "retry" ? "Retry · " : ""}{session.difficulty ? LEVEL_NAME[session.difficulty as Level] : "Mixed"} · {STATUS_LABEL[session.status] || session.status} · {session.answered} of {session.total} answered
          </Text>
        </Card>
      ))}
      {!loading && tab === "History" && !history.length && <Empty title="No practice history" body="Complete a practice set to see it here." />}
    </Screen>
  );
}

export function TopicsScreen({ route, back, go }: { route: Extract<Route, { name: "topics" }>; back: () => void; go: (route: Route) => void }) {
  const { palette } = useTheme();
  const [exam, setExam] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api(`/exams/${route.examId}`)
      .then(setExam)
      .catch((err) => setError(err.message));
  }, [route.examId]);
  const subject = exam?.subjects?.find((item: any) => item.id === route.subjectId);
  const topicRows = subject?.topics || [];
  return (
    <Screen>
      <Header title={route.subjectName} subtitle={subject ? `${subjectPercent(subject)}% · Easy → Medium → Hard` : undefined} onBack={back} />
      {error ? <Banner message={error} /> : null}
      {!exam && !error ? <Loading /> : null}
      {exam && topicRows.length ? (
        <Text style={{ color: palette.muted, marginBottom: 8, lineHeight: 18 }}>
          Each topic opens level by level: 80% in Easy unlocks Medium, 70% in Medium unlocks Hard, 60% in Hard masters it (10+ questions each).
        </Text>
      ) : null}
      {topicRows.map((topic: any) => (
        <TopicLevelCard
          key={topic.id}
          topic={topic}
          onStart={(level) => go({ name: "quiz", examId: route.examId, topicId: topic.id, title: topic.name, difficulty: level })}
        />
      ))}
      {exam && subject && !topicRows.length && (
        <Empty title="No topics" body="Topics for this subject are being prepared. Please check back soon." />
      )}
      {exam && !subject && <Empty title="Subject missing" body="This subject is not in the current syllabus." />}
    </Screen>
  );
}

/** Lets a student flag a wrong or unclear question; 3 reports hide it until an admin reviews it. */
function ReportQuestion({ questionId }: { questionId: string }) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <Text style={{ color: palette.muted, textAlign: "center", marginVertical: 8 }}>Thanks — reported for review.</Text>;
  if (!open) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Report this question" onPress={() => setOpen(true)} style={{ alignSelf: "center", padding: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="flag-outline" size={14} color={palette.muted} />
        <Text style={{ color: palette.muted, fontWeight: "700" }}>Report a problem</Text>
      </Pressable>
    );
  }
  const send = async (reason: "wrong_answer" | "unclear") => {
    await api(`/questions/${questionId}/report`, { method: "POST", body: JSON.stringify({ reason }) });
    setDone(true);
  };
  return (
    <View style={{ flexDirection: "row", gap: 8, marginVertical: 4 }}>
      <View style={{ flex: 1 }}><Button label="Answer is wrong" tone="ghost" onPress={() => send("wrong_answer")} /></View>
      <View style={{ flex: 1 }}><Button label="Question unclear" tone="ghost" onPress={() => send("unclear")} /></View>
    </View>
  );
}

export function QuizScreen({ route, back, onDone }: { route: Extract<Route, { name: "quiz" }>; back: () => void; onDone: (route: Route) => void }) {
  const { palette } = useTheme();
  const [sessionId, setSessionId] = useState("");
  const [questions, setQuestions] = useState<any[]>([]);
  const [index, setIndex] = useState(0);
  const [feedbackByQuestion, setFeedbackByQuestion] = useState<Record<string, any>>({});
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [attempt, setAttempt] = useState(0);
  const [kind, setKind] = useState<"practice" | "retry">(route.retryOf ? "retry" : "practice");
  useEffect(() => {
    setSessionId("");
    setQuestions([]);
    setIndex(0);
    setFeedbackByQuestion({});
    setElapsed(0);
    setError("");
    setSaved({});
    const load = route.sessionId
      ? // Resume: answered questions come back with their result; continue at the first unanswered.
        api<any>(`/practice/sessions/${route.sessionId}`).then((session) => {
          const answered: Record<string, any> = {};
          for (const question of session.questions) {
            if (question.yourAnswer) answered[question.id] = { selectedKey: question.yourAnswer, correct: question.correct, correctKey: question.correctKey, explanation: question.explanation };
          }
          setFeedbackByQuestion(answered);
          const firstOpen = session.questions.findIndex((question: any) => !question.yourAnswer);
          setIndex(firstOpen < 0 ? Math.max(0, session.questions.length - 1) : firstOpen);
          setKind(session.kind || "practice");
          return session;
        })
      : api<any>("/practice/sessions", {
          method: "POST",
          body: JSON.stringify({ examId: route.examId, topicId: route.topicId, difficulty: route.difficulty, retryOf: route.retryOf, count: 5 }),
        });
    load
      .then((session) => {
        setSessionId(session.id);
        setQuestions(session.questions);
      })
      .catch((err) => setError(err.message));
  }, [route.examId, route.topicId, route.difficulty, route.sessionId, route.retryOf, attempt]);
  const question = questions[index];
  const feedback = question ? feedbackByQuestion[question.id] : null;
  useEffect(() => {
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  async function answer(key: string) {
    if (feedback) return;
    try {
      // The server keeps the first answer; a repeat returns that original result.
      const checked = await api(`/practice/sessions/${sessionId}/answers`, { method: "POST", body: JSON.stringify({ questionId: question.id, selectedKey: key }) });
      setFeedbackByQuestion((current) => ({ ...current, [question.id]: checked }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check");
    }
  }
  async function next() {
    if (index + 1 >= questions.length) {
      const result = await api<any>(`/practice/sessions/${sessionId}/complete`, { method: "POST" });
      onDone({
        name: "practiceResult",
        sessionId,
        examId: route.examId,
        topicId: route.topicId,
        title: route.title,
        difficulty: route.difficulty,
        kind,
        correct: result.correct || 0,
        answered: result.answered || Object.keys(feedbackByQuestion).length,
        total: result.total || questions.length,
        topics: result.topics || [],
        pendingOffline: Boolean(result.pendingOffline),
      });
      return;
    }
    setIndex(index + 1);
  }
  const subtitle = [kind === "retry" ? "Retry wrong answers" : route.difficulty ? LEVEL_NAME[route.difficulty] : "", question ? `${index + 1} of ${questions.length}` : ""].filter(Boolean).join(" · ");
  return (
    <Screen>
      <Header title={route.title} subtitle={subtitle} onBack={back} />
      {!question && !error ? <Loading variant="quiz" label="Preparing your questions…" /> : null}
      {error && !question ? (
        <View>
          <Empty title={/unlock/i.test(error) ? "Level locked" : "Could not start practice"} body={error} />
          {/unlock/i.test(error) ? (
            <Button label="Back" tone="ghost" onPress={back} />
          ) : (
            <Button label="Try again" icon="refresh" onPress={() => setAttempt((value) => value + 1)} />
          )}
        </View>
      ) : null}
      {error && question ? <Banner message={error} /> : null}
      {question && (
        <View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ color: palette.green, fontWeight: "800" }}>Q {index + 1} of {questions.length}</Text>
            <Text style={{ color: palette.muted }}>{String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</Text>
          </View>
          <Progress value={((index + (feedback ? 1 : 0)) / questions.length) * 100} />
          <Text style={{ color: palette.ink, fontSize: 18, fontWeight: "700", lineHeight: 26, marginVertical: 12 }}>{question.stem}</Text>
          {question.options.map((option: any) => {
            const selected = feedback?.selectedKey === option.key;
            const correct = feedback && !feedback.pendingOffline && option.key === feedback.correctKey;
            const state = correct ? "correct" : selected && feedback && !feedback.pendingOffline && !feedback.correct ? "wrong" : selected ? "selected" : "idle";
            return <Choice key={option.key} letter={option.key} text={option.text} state={state} disabled={Boolean(feedback)} onPress={() => answer(option.key)} />;
          })}
          {feedback?.pendingOffline ? (
            <Banner tone="info" message="Answer saved on this device. Correct answer and explanation will be available after reconnecting." />
          ) : feedback && (
            <Card style={{ backgroundColor: feedback.correct ? palette.greenSoft : palette.dangerSoft, borderColor: "transparent" }}>
              <Text style={{ color: feedback.correct ? palette.green : palette.danger, fontWeight: "800" }}>{feedback.correct ? "Correct answer" : `Answer ${feedback.correctKey}`}</Text>
              <Text style={{ color: palette.ink, marginTop: 6, lineHeight: 20 }}>{feedback.explanation}</Text>
            </Card>
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Button label="Previous" tone="ghost" disabled={index === 0} onPress={() => setIndex(index - 1)} /></View>
            <View style={{ flex: 1 }}><Button label={index + 1 >= questions.length ? "See result" : "Next"} disabled={!feedback} onPress={next} /></View>
          </View>
          {feedback && (
            <Button
              label={saved[question.id] ? "Saved" : "Bookmark"}
              tone="ghost"
              icon={saved[question.id] ? "bookmark" : "bookmark-outline"}
              disabled={saved[question.id]}
              onPress={async () => {
                await api("/bookmarks", { method: "POST", body: JSON.stringify({ questionId: question.id }) });
                setSaved((current) => ({ ...current, [question.id]: true }));
              }}
            />
          )}
          {feedback && !feedback.pendingOffline ? <ReportQuestion key={question.id} questionId={question.id} /> : null}
        </View>
      )}
    </Screen>
  );
}

export function PracticeResultScreen({ route, back, go }: { route: Extract<Route, { name: "practiceResult" }>; back: () => void; go: (route: Route) => void }) {
  const { palette } = useTheme();
  const [review, setReview] = useState<any>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    if (route.pendingOffline) return;
    api<any>(`/practice/sessions/${route.sessionId}`).then(setReview).catch((err) => setError(err.message));
  }, [route.sessionId, route.pendingOffline]);
  const answered = review?.answered ?? route.answered;
  const correct = review?.correct ?? route.correct;
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  const wrong = answered - correct;
  const isRetry = (review?.kind || route.kind) === "retry";
  const topics = route.topics || [];
  return (
    <Screen>
      <Header title="Practice result" subtitle={route.title} onBack={back} />
      <Card>
        <Text style={{ color: palette.muted }}>{isRetry ? "Retry score" : "Score"}</Text>
        {route.pendingOffline ? (
          <Text style={{ color: palette.ink, fontSize: 22, fontWeight: "700", marginTop: 6 }}>Saved for sync</Text>
        ) : (
          <Text style={{ color: palette.ink, fontSize: 36, fontWeight: "700" }}>{correct} / {answered}</Text>
        )}
        <Text style={{ color: palette.muted }}>
          {route.pendingOffline ? "Score after reconnect" : `${accuracy}% accuracy${route.difficulty ? ` · ${LEVEL_NAME[route.difficulty]}` : ""}${isRetry ? " · not counted in progress" : ""}`}
        </Text>
        {!route.pendingOffline && <Progress value={accuracy} />}
      </Card>

      {topics.map((topic: any) => (
        <Card key={topic.topicId}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: palette.ink, fontWeight: "800", flex: 1 }}>{topic.name || "Topic"}</Text>
            <Text style={{ color: palette.green, fontWeight: "800" }}>{topic.mastered ? "Mastered" : `Next: ${LEVEL_NAME[topic.current as Level]}`}</Text>
          </View>
          <LevelSteps level={topic} onPick={(level) => go({ name: "quiz", examId: route.examId, topicId: topic.topicId, title: topic.name || route.title, difficulty: level })} />
        </Card>
      ))}

      {review?.weakTopic ? (
        <Banner tone="info" message={`Weak area: ${review.weakTopic.name}. Practise it again to strengthen it.`} />
      ) : null}

      <View style={{ gap: 8, marginBottom: 12 }}>
        {!isRetry && !route.pendingOffline ? (
          <Button
            label="Next 5 questions"
            icon="arrow-forward"
            onPress={() => go({ name: "quiz", examId: route.examId, topicId: route.topicId, title: route.title, difficulty: route.difficulty })}
          />
        ) : null}
        {!isRetry && wrong > 0 && !route.pendingOffline ? (
          <Button label={`Retry wrong answers (${wrong})`} tone="ghost" icon="refresh" onPress={() => go({ name: "quiz", examId: route.examId, title: `${route.title} · retry`, retryOf: route.sessionId })} />
        ) : null}
        <Button label="Back to practice" tone="ghost" onPress={back} />
      </View>

      {error ? <Banner message={error} /> : null}
      {review ? <Text style={{ color: palette.primary, fontSize: 17, fontWeight: "800", marginBottom: 8 }}>Review answers</Text> : null}
      {(review?.questions || []).filter((question: any) => question.yourAnswer).map((question: any, at: number) => {
        const yours = question.options.find((option: any) => option.key === question.yourAnswer);
        const right = question.options.find((option: any) => option.key === question.correctKey);
        return (
          <Card key={question.id} style={{ borderColor: question.correct ? palette.good : palette.danger }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Ionicons name={question.correct ? "checkmark-circle" : "close-circle"} size={20} color={question.correct ? palette.good : palette.danger} />
              <Text style={{ color: palette.ink, fontWeight: "700", flex: 1, lineHeight: 20 }}>{at + 1}. {question.stem}</Text>
            </View>
            {!question.correct ? (
              <Text style={{ color: palette.danger, marginTop: 6 }}>Your answer: {question.yourAnswer}. {yours?.text || ""}</Text>
            ) : null}
            <Text style={{ color: palette.good, marginTop: 4, fontWeight: "700" }}>Correct: {question.correctKey}. {right?.text || ""}</Text>
            {question.explanation ? <Text style={{ color: palette.muted, marginTop: 6, lineHeight: 19 }}>{question.explanation}</Text> : null}
            <Button
              label={saved[question.id] ? "Saved" : "Bookmark"}
              tone="ghost"
              icon={saved[question.id] ? "bookmark" : "bookmark-outline"}
              disabled={saved[question.id]}
              onPress={async () => {
                await api("/bookmarks", { method: "POST", body: JSON.stringify({ questionId: question.id }) });
                setSaved((current) => ({ ...current, [question.id]: true }));
              }}
            />
            <ReportQuestion questionId={question.id} />
          </Card>
        );
      })}
    </Screen>
  );
}

export function BookmarksScreen({ back }: { back: () => void }) {
  const { palette } = useTheme();
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  async function load() { setItems(await api<any[]>("/bookmarks")); }
  useEffect(() => { api<any[]>("/bookmarks").then(setItems).catch((err) => setError(err.message)); }, []);
  return (
    <Screen>
      <Header title="Bookmarks" onBack={back} />
      {error ? <Banner message={error} /> : null}
      {!items && !error ? <Loading /> : null}
      {items?.map((question) => (
        <Card key={question.id}>
          <Text style={{ color: palette.ink, fontWeight: "700" }}>{question.stem}</Text>
          <Button label="Remove" tone="ghost" onPress={async () => { await api(`/bookmarks/${question.id}`, { method: "DELETE" }); await load(); }} />
        </Card>
      ))}
      {items && !items.length && <Empty title="No bookmarks" body="Save a question after you check the answer." />}
    </Screen>
  );
}

/** How today's personal mock stands, for a list row or the intro screen. */
function mockReadiness(mock: any): { label: string; tone: "soft" | "good" | "warn"; ready: boolean; detail: string } {
  if (mock.todayStatus === "submitted") return { label: "Attempted", tone: "soft", ready: false, detail: "" };
  if (mock.todayStatus === "in_progress") return { label: "Continue", tone: "good", ready: true, detail: "" };
  if (mock.todaySet === "ready") return { label: "Ready", tone: "good", ready: true, detail: "" };
  const prep = mock.preparation;
  if (mock.todaySet === "failed") return { label: "Not ready", tone: "warn", ready: false, detail: prep?.error || "Preparation failed. It will be retried." };
  if (mock.todaySet === "generating") {
    return { label: "Preparing", tone: "soft", ready: false, detail: prep?.total ? `Preparing your questions: ${prep.done} of ${prep.total}` : "Preparing your questions" };
  }
  return { label: "Not ready", tone: "soft", ready: false, detail: "Today's questions are not prepared yet." };
}

/** Reload the mock list every 10 s while today's set is still being prepared. */
function useMocks(watch: (list: any[]) => boolean) {
  const [mocks, setMocks] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    api<any[]>("/mocks").then((list) => { if (alive) { setMocks(list); setError(""); } }).catch((err) => alive && setError(err.message));
    return () => { alive = false; };
  }, [tick]);
  const waiting = mocks ? watch(mocks) : false;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setTick((value) => value + 1), 10_000);
    return () => clearTimeout(timer);
  }, [waiting, mocks]);
  return { mocks, error, reload: () => setTick((value) => value + 1) };
}

export function MocksScreen({ go, back }: { go: (route: Route) => void; back: () => void }) {
  const { palette } = useTheme();
  const [tab, setTab] = useState("Available");
  const { mocks, error } = useMocks((list) => list.some((mock) => mock.todaySet === "generating"));
  const list = (mocks || []).filter((mock) => tab === "Attempted" ? mock.todayStatus === "submitted" || mock.lastScore : mock.todayStatus !== "submitted");
  return (
    <Screen>
      <Header title="Mock tests" subtitle="A fresh full mock of your exam every day" onBack={back} />
      <Segment options={["Available", "Attempted"]} value={tab} onChange={setTab} />
      {error ? <Banner message={error} /> : null}
      {!mocks && !error ? <Loading /> : null}
      {list.map((mock) => {
        const state = mockReadiness(mock);
        return (
          <Card key={mock.id} onPress={() => mock.todayStatus === "submitted" ? go({ name: "mockResult", attemptId: mock.todayAttemptId }) : go({ name: "mockIntro", mockId: mock.id })}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: palette.ink, fontWeight: "700", flex: 1 }}>{mock.title}</Text>
              <Pill label={state.label} tone={state.tone} />
            </View>
            <Text style={{ color: palette.muted }}>{mock.questionCount} questions · {mock.durationMinutes} min</Text>
            {tab === "Available" && state.detail ? <Text style={{ color: palette.muted, marginTop: 4 }}>{state.detail}</Text> : null}
            {mock.lastScore ? <Text style={{ color: palette.muted }}>Last score {mock.lastScore.rawScore}/{mock.lastScore.maxScore}</Text> : null}
          </Card>
        );
      })}
      {mocks && !list.length && (
        <Empty
          title={tab === "Available" ? (mocks.length ? "Done for today" : "No mock yet") : "No attempts yet"}
          body={tab === "Available" ? (mocks.length ? "Today's mock is submitted. A new one is prepared at 2:00 AM." : "Choose your exam first. Its daily mock appears here.") : "Finish a mock to see it here. The server keeps the score."}
        />
      )}
    </Screen>
  );
}

export function MockIntroScreen({ mockId, go, back }: { mockId: string; go: (route: Route) => void; back: () => void }) {
  const { palette } = useTheme();
  const [note, setNote] = useState("");
  const { mocks, error, reload } = useMocks((list) => list.find((item) => item.id === mockId)?.todaySet === "generating");
  const mock = mocks ? mocks.find((item) => item.id === mockId) || null : undefined;
  const state = mock ? mockReadiness(mock) : null;
  async function prepare() {
    // The start call begins preparing today's set when it does not exist yet.
    try {
      await api(`/mocks/${mockId}/start`, { method: "POST", body: JSON.stringify({ idempotencyKey: `mobile-prepare-${mockId}` }) });
      go({ name: "mockRun", mockId });
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not prepare the mock");
      reload();
    }
  }
  return (
    <Screen>
      <Header title={mock?.title || "Mock test"} onBack={back} />
      {error ? <Banner message={error} /> : null}
      {mock === undefined && !error ? <Loading /> : null}
      {mock === null ? <Empty title="Mock not found" body="Go back and open the mock list again." /> : null}
      {mock && state ? (
        <View>
          <Card>
            <Text style={{ color: palette.ink, fontWeight: "700" }}>{mock.questionCount} questions · {mock.durationMinutes} minutes</Text>
            <Text style={{ color: palette.muted, marginTop: 6 }}>{mock.marksPerQuestion} marks each · negative {mock.negativeMarks}</Text>
          </Card>
          {(mock.instructions || []).map((line: string) => <Text key={line} style={{ color: palette.muted, marginBottom: 8, lineHeight: 20 }}>{line}</Text>)}
          {!state.ready ? <Banner tone="info" message={note || state.detail} /> : null}
          {state.ready ? (
            <Button label={mock.todayStatus === "in_progress" ? "Continue test" : "Start test"} onPress={() => go({ name: "mockRun", mockId })} />
          ) : mock.todaySet === "generating" ? (
            <Button label="Preparing questions" disabled loading onPress={() => undefined} />
          ) : (
            <Button label="Prepare today's mock" onPress={prepare} />
          )}
        </View>
      ) : null}
    </Screen>
  );
}

export function MockRunScreen({ mockId, onDone }: { mockId: string; onDone: (route: Route) => void }) {
  const { palette } = useTheme();
  const [attempt, setAttempt] = useState<any>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { selectedKey: string; markedForReview: boolean }>>({});
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [saved, setSaved] = useState("");
  const submitted = useRef(false);
  useEffect(() => {
    api<any>(`/mocks/${mockId}/start`, { method: "POST", body: JSON.stringify({ idempotencyKey: `mobile-${mockId}-${Date.now()}` }) })
      .then((next) => {
        if (next.redirect === "result" || next.status === "submitted") { onDone({ name: "mockResult", attemptId: next.id }); return; }
        setAttempt(next);
        const savedAnswers: Record<string, { selectedKey: string; markedForReview: boolean }> = {};
        (next.answers || []).forEach((answer: any) => { savedAnswers[answer.questionId] = { selectedKey: answer.selectedKey || "", markedForReview: Boolean(answer.markedForReview) }; });
        setAnswers(savedAnswers);
      })
      .catch((err) => setError(err.message));
  }, [mockId]);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!attempt?.id) return;
    const handle = setTimeout(() => {
      const payload = Object.entries(answers).filter(([, value]) => value.selectedKey || value.markedForReview).map(([questionId, value]) => ({ questionId, selectedKey: value.selectedKey, markedForReview: value.markedForReview }));
      api(`/mocks/attempts/${attempt.id}`, { method: "PUT", body: JSON.stringify({ answers: payload }) }).then(() => setSaved("Saved")).catch((err) => setError(err.message));
    }, 700);
    return () => clearTimeout(handle);
  }, [answers, attempt?.id]);

  const question = attempt?.questions?.[index];
  const left = attempt ? Math.max(0, new Date(attempt.deadlineAt).getTime() - now) : 0;
  const clock = `${String(Math.floor(left / 60000)).padStart(2, "0")}:${String(Math.floor((left / 1000) % 60)).padStart(2, "0")}`;
  async function submit() {
    if (submitted.current || !attempt?.id) return;
    submitted.current = true;
    try {
      const payload = Object.entries(answers).map(([questionId, value]) => ({ questionId, selectedKey: value.selectedKey, markedForReview: value.markedForReview }));
      await api(`/mocks/attempts/${attempt.id}`, { method: "PUT", body: JSON.stringify({ answers: payload }) });
      await api(`/mocks/attempts/${attempt.id}/submit`, { method: "POST", body: JSON.stringify({ idempotencyKey: `submit-${attempt.id}` }) });
      onDone({ name: "mockResult", attemptId: attempt.id });
    } catch (err) {
      submitted.current = false;
      setError(err instanceof Error ? err.message : "Could not submit");
    }
  }
  useEffect(() => {
    if (!attempt || left !== 0) return;
    const handle = setTimeout(() => { void submit(); }, 0);
    return () => clearTimeout(handle);
  }, [left, attempt?.id]);
  const current = answers[question?.id] || { selectedKey: "", markedForReview: false };
  return (
    <Screen>
      <Header title={clock} subtitle={saved || "Server timer"} right={<Pressable accessibilityRole="button" accessibilityLabel="Question list" onPress={() => setPaletteOpen(true)}><Text style={{ color: palette.green, fontWeight: "700" }}>List</Text></Pressable>} />
      {error ? <Banner message={error} /> : null}
      {!question && !error ? <Loading variant="quiz" label="Preparing mock · AI may generate questions…" /> : null}
      {question && (
        <View>
          <Text style={{ color: palette.muted, fontWeight: "700" }}>Question {index + 1} of {attempt.questions.length}</Text>
          <Text style={{ color: palette.ink, fontSize: 18, fontWeight: "700", lineHeight: 26, marginVertical: 10 }}>{question.stem}</Text>
          {question.options.map((option: any) => (
            <Choice key={option.key} letter={option.key} text={option.text} state={current.selectedKey === option.key ? "selected" : "idle"} onPress={() => setAnswers({ ...answers, [question.id]: { ...current, selectedKey: option.key } })} />
          ))}
          <Button label={current.markedForReview ? "Marked for review" : "Mark for review"} tone="ghost" onPress={() => setAnswers({ ...answers, [question.id]: { ...current, markedForReview: !current.markedForReview } })} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Button label="Previous" tone="ghost" disabled={index === 0} onPress={() => setIndex(index - 1)} /></View>
            <View style={{ flex: 1 }}>{index < attempt.questions.length - 1 ? <Button label="Next" onPress={() => setIndex(index + 1)} /> : <Button label="Submit" onPress={() => setConfirm(true)} />}</View>
          </View>
        </View>
      )}
      <Dialog visible={confirm} title="Submit this test?" body="You can submit once today. Unanswered questions stay blank. The server calculates the score." confirm="Submit" cancel="Keep working" onCancel={() => setConfirm(false)} onConfirm={async () => { await submit(); setConfirm(false); }} />
      <Sheet visible={paletteOpen} title="Questions" onClose={() => setPaletteOpen(false)}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(attempt?.questions || []).map((item: any, itemIndex: number) => {
            const state = answers[item.id];
            const label = state?.markedForReview ? "Review" : state?.selectedKey ? "Answered" : "Blank";
            return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Question ${itemIndex + 1} ${label}`} onPress={() => { setIndex(itemIndex); setPaletteOpen(false); }} style={{ width: 64, padding: 8, borderRadius: 10, backgroundColor: palette.bg }}><Text style={{ color: palette.ink, fontWeight: "700" }}>{itemIndex + 1}</Text><Text style={{ color: palette.muted, fontSize: 11 }}>{label}</Text></Pressable>;
          })}
        </View>
      </Sheet>
    </Screen>
  );
}

export function MockResultScreen({ attemptId, back }: { attemptId: string; back: () => void }) {
  const { palette } = useTheme();
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => { api(`/mocks/attempts/${attemptId}/result`).then(setResult).catch((err) => setError(err.message)); }, [attemptId]);
  return (
    <Screen>
      <Header title={result?.title || "Result"} onBack={back} />
      {error ? <Banner message={error} /> : null}
      {!result && !error ? <Loading /> : null}
      {result && (
        <View>
          <ScoreRing value={result.maxScore ? Math.round((result.rawScore / result.maxScore) * 100) : 0} caption={`${result.rawScore} / ${result.maxScore}`} />
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            {[
              ["Correct", result.correct],
              ["Wrong", result.incorrect],
              ["Blank", result.unanswered],
            ].map(([label, value]) => (
              <View key={String(label)} style={{ flex: 1, backgroundColor: palette.surface, borderRadius: 14, borderWidth: 1, borderColor: palette.line, padding: 12, alignItems: "center" }}>
                <Text style={{ color: palette.ink, fontSize: 20, fontWeight: "800" }}>{value}</Text>
                <Text style={{ color: palette.muted }}>{label}</Text>
              </View>
            ))}
          </View>
          {result.weakAreas?.length ? (
            <Card>
              <Text style={{ color: palette.ink, fontWeight: "800", marginBottom: 6 }}>Weak areas to revise</Text>
              {result.weakAreas.map((area: { topicId: string; topic: string; attempted: number; accuracy: number }) => (
                <Text key={area.topicId} style={{ color: palette.muted }}>{area.topic}: {area.accuracy}% across {area.attempted}</Text>
              ))}
            </Card>
          ) : null}
          <Text style={{ color: palette.ink, fontSize: 18, fontWeight: "800", marginBottom: 8 }}>Review answers</Text>
          {(result.questions || []).map((question: any, index: number) => (
            <Card key={question.id}>
              <Text style={{ color: palette.ink, fontWeight: "700" }}>{index + 1}. {question.stem}</Text>
              <Text style={{ color: question.correct ? palette.good : palette.danger, marginTop: 6 }}>{question.correct ? "Correct" : `Your answer ${question.selectedKey || "blank"} · answer ${question.correctKey}`}</Text>
              <Text style={{ color: palette.muted, marginTop: 4 }}>{question.explanation}</Text>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
