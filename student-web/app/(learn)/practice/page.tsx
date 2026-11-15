"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Card, Chip, MenuItem, TextField, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageSkeleton } from "@/components/PageSkeleton";

type Level = "easy" | "medium" | "hard";
type LevelState = { answered: number; accuracy: number; unlocked: boolean; passed: boolean };
type TopicLevel = { current: Level; step: number; mastered: boolean; percent: number; levels: Record<Level, LevelState> };
type Exam = { id: string; name: string };
type Topic = { id: string; name: string; level?: TopicLevel };
type Option = { key: string; text: string };
type Question = { id: string; stem: string; options: Option[]; correctKey?: string; explanation?: string; yourAnswer?: string; correct?: boolean };
type Feedback = { selectedKey: string; correct: boolean; correctKey: string; explanation: string };
type Session = { id: string; kind?: "practice" | "retry"; questions: Question[] };
type Review = {
  id: string;
  kind: "practice" | "retry";
  topicName: string;
  difficulty: string;
  answered: number;
  correct: number;
  total: number;
  weakTopic: { id: string; name: string } | null;
  questions: Question[];
};
type Standing = TopicLevel & { topicId: string; name: string };
type HistoryItem = { id: string; examId: string; status: string; kind: string; topicId: string; topicName: string; difficulty: string; total: number; answered: number; correct: number };
type Active = { id: string; examId: string; topicId: string; topicName: string; difficulty: string; answered: number; total: number } | null;

const LEVELS: Level[] = ["easy", "medium", "hard"];
const LEVEL_NAME: Record<Level, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
const STATUS_LABEL: Record<string, string> = { completed: "Completed", abandoned: "Left midway", active: "In progress" };

/** Flag a wrong or unclear question; 3 reports hide it until an admin reviews it. */
function ReportQuestion({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <Typography color="text.secondary" fontSize={13} sx={{ mt: 1 }}>Thanks — reported for review.</Typography>;
  const send = async (reason: "wrong_answer" | "unclear") => {
    await api(`/questions/${questionId}/report`, { method: "POST", body: JSON.stringify({ reason }) });
    setDone(true);
  };
  return open ? (
    <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
      <Button size="small" color="error" onClick={() => send("wrong_answer")}>Answer is wrong</Button>
      <Button size="small" onClick={() => send("unclear")}>Question unclear</Button>
    </Box>
  ) : (
    <Button size="small" color="inherit" sx={{ mt: 1, color: "text.secondary" }} onClick={() => setOpen(true)}>Report a problem</Button>
  );
}

export default function PracticePage() {
  const { user } = useAuth();
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [examId, setExamId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [difficulty, setDifficulty] = useState<"" | Level>("");
  const [session, setSession] = useState<Session | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [review, setReview] = useState<Review | null>(null);
  const [standing, setStanding] = useState<Standing[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [active, setActive] = useState<Active>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api<Exam[]>("/exams").then((items) => {
      setExams(items);
      setExamId(user?.primaryExamId || items[0]?.id || "");
    }).catch((err) => setError(err.message));
  }, [user?.primaryExamId]);

  const refresh = useCallback(() => {
    if (!examId) return;
    api<{ subjects: Array<{ topics: Topic[] }> }>(`/exams/${examId}`).then((detail) => {
      setTopics(detail.subjects.flatMap((subject) => subject.topics));
    }).catch((err) => setError(err.message));
    api<HistoryItem[]>("/practice/history").then(setHistory).catch(() => setHistory([]));
    api<Active>(`/practice/active?examId=${examId}`).then(setActive).catch(() => setActive(null));
  }, [examId]);
  useEffect(() => { refresh(); }, [refresh]);

  const topic = topics.find((item) => item.id === topicId);
  const levelOpen = (level: Level) =>
    level === "easy" || (topic ? Boolean(topic.level?.levels[level].unlocked) : topics.some((item) => item.level?.levels[level].unlocked));

  function begin(next: Session, answered: Record<string, Feedback> = {}, at = 0) {
    setSession(next);
    setFeedback(answered);
    setSaved({});
    setSelected("");
    setIndex(at);
    setReview(null);
    setStanding([]);
  }

  async function start(body: Record<string, unknown>) {
    setError("");
    setStarting(true);
    try {
      begin(await api<Session>("/practice/sessions", { method: "POST", body: JSON.stringify({ examId, count: 5, ...body }) }));
    } finally {
      setStarting(false);
    }
  }

  async function resume(id: string) {
    setError("");
    const loaded = await api<Review>(`/practice/sessions/${id}`);
    const answered: Record<string, Feedback> = {};
    for (const question of loaded.questions) {
      if (question.yourAnswer) answered[question.id] = { selectedKey: question.yourAnswer, correct: Boolean(question.correct), correctKey: question.correctKey || "", explanation: question.explanation || "" };
    }
    const firstOpen = loaded.questions.findIndex((question) => !question.yourAnswer);
    begin({ id: loaded.id, kind: loaded.kind, questions: loaded.questions }, answered, firstOpen < 0 ? 0 : firstOpen);
  }

  async function check() {
    if (!session) return;
    const question = session.questions[index];
    // The server keeps the first answer; a repeat returns the original result.
    const result = await api<Feedback>(`/practice/sessions/${session.id}/answers`, {
      method: "POST",
      body: JSON.stringify({ questionId: question.id, selectedKey: selected }),
    });
    setFeedback((current) => ({ ...current, [question.id]: result }));
  }

  async function finish() {
    if (!session) return;
    const done = await api<{ topics: Standing[] }>(`/practice/sessions/${session.id}/complete`, { method: "POST" });
    const loaded = await api<Review>(`/practice/sessions/${session.id}`);
    setSession(null);
    setReview(loaded);
    setStanding(done.topics || []);
    refresh();
  }

  async function bookmark(questionId: string) {
    await api("/bookmarks", { method: "POST", body: JSON.stringify({ questionId }) });
    setSaved((current) => ({ ...current, [questionId]: true }));
  }

  const question = session?.questions[index];
  const shown = question ? feedback[question.id] : undefined;
  const run = (task: Promise<unknown>) => task.catch((err) => setError(err.message));

  return (
    <Box>
      <Typography sx={{ fontSize: 28, fontWeight: 800 }}>Practice</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Each topic opens level by level: 80% in Easy unlocks Medium, 70% in Medium unlocks Hard, 60% in Hard masters it (10+ questions each). Your first answer is final.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!exams && !error ? <PageSkeleton rows={3} /> : null}
      {starting ? <PageSkeleton variant="quiz" /> : null}

      {!session && !review && !starting && exams && (
        <>
          {active ? (
            <Alert severity="info" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => run(resume(active.id))}>Continue</Button>}>
              Unfinished set: {active.topicName || "Quick practice"}{active.difficulty ? ` · ${LEVEL_NAME[active.difficulty as Level]}` : ""} · {active.answered} of {active.total} done
            </Alert>
          ) : null}
          <Card sx={{ p: 3 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 2 }}>
              <TextField select label="Exam" value={examId} onChange={(event) => { setExamId(event.target.value); setTopicId(""); }}>{exams.map((exam) => <MenuItem key={exam.id} value={exam.id}>{exam.name}</MenuItem>)}</TextField>
              <TextField select label="Topic" value={topicId} onChange={(event) => { setTopicId(event.target.value); setDifficulty(""); }}>
                <MenuItem value="">Any topic</MenuItem>
                {topics.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name} · {item.level?.mastered ? "Mastered" : `Next: ${LEVEL_NAME[item.level?.current || "easy"]}`}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label="Level" value={difficulty} onChange={(event) => setDifficulty(event.target.value as "" | Level)}>
                <MenuItem value="">{topic ? "My current level" : "Easy (default)"}</MenuItem>
                {LEVELS.map((level) => (
                  <MenuItem key={level} value={level} disabled={!levelOpen(level)}>{LEVEL_NAME[level]}{levelOpen(level) ? "" : " · locked"}</MenuItem>
                ))}
              </TextField>
            </Box>
            {topic?.level ? (
              <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
                {LEVELS.map((level) => {
                  const state = topic.level!.levels[level];
                  return (
                    <Chip
                      key={level}
                      color={state.passed ? "success" : state.unlocked ? "primary" : "default"}
                      variant={state.passed ? "filled" : "outlined"}
                      label={`${LEVEL_NAME[level]} · ${state.passed ? "passed" : state.unlocked ? (state.answered ? `${state.accuracy}% of ${state.answered}` : "open") : "locked"}`}
                    />
                  );
                })}
              </Box>
            ) : null}
            <Button sx={{ mt: 2 }} variant="contained" onClick={() => run(start({ topicId: topicId || undefined, difficulty: difficulty || undefined }))}>Start practice</Button>
          </Card>

          <Typography sx={{ fontSize: 20, fontWeight: 800, mt: 3, mb: 1 }}>History</Typography>
          {!history.length ? <Typography color="text.secondary">Complete a practice set to see it here.</Typography> : null}
          <Box sx={{ display: "grid", gap: 1 }}>
            {history.map((item) => (
              <Card key={item.id} sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
                <Box>
                  <Typography fontWeight={800}>{item.topicName || "Quick practice"}</Typography>
                  <Typography color="text.secondary" fontSize={13}>
                    {item.kind === "retry" ? "Retry · " : ""}{item.difficulty ? LEVEL_NAME[item.difficulty as Level] : "Mixed"} · {STATUS_LABEL[item.status] || item.status} · {item.correct}/{item.answered} correct
                  </Typography>
                </Box>
                {item.answered ? (
                  <Button size="small" onClick={() => run(api<Review>(`/practice/sessions/${item.id}`).then((loaded) => { setReview(loaded); setStanding([]); }))}>Review</Button>
                ) : null}
              </Card>
            ))}
          </Box>
        </>
      )}

      {session && question && !starting && (
        <Card sx={{ p: { xs: 2, md: 4 }, maxWidth: 760 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
            <Typography color="primary" fontWeight={800}>Question {index + 1} of {session.questions.length}{session.kind === "retry" ? " · Retry" : ""}</Typography>
            <Typography color="text.secondary" fontWeight={700}>{topic?.name || exams?.find((exam) => exam.id === examId)?.name}</Typography>
          </Box>
          <Typography sx={{ fontSize: 22, fontWeight: 800, mb: 2 }}>{question.stem}</Typography>
          <Box sx={{ display: "grid", gap: 1.2 }}>
            {question.options.map((option) => {
              const picked = (shown?.selectedKey || selected) === option.key;
              const correct = shown?.correctKey === option.key;
              const wrong = Boolean(shown) && picked && !shown?.correct;
              return (
                <Button
                  key={option.key}
                  onClick={() => !shown && setSelected(option.key)}
                  sx={{ justifyContent: "flex-start", py: 1.4, px: 2, borderRadius: 3, border: "1px solid", borderColor: correct ? "success.main" : wrong ? "error.main" : picked ? "primary.main" : "#EAECF0", bgcolor: correct ? "#E8F8EE" : wrong ? "#FEE2E2" : picked ? "#F8F7FF" : "white", color: "#172033" }}
                >
                  {option.key}. {option.text}
                </Button>
              );
            })}
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 3, gap: 1, flexWrap: "wrap" }}>
            <Button variant="outlined" disabled={index === 0} onClick={() => { setSelected(""); setIndex(index - 1); }}>Previous</Button>
            <Box sx={{ display: "flex", gap: 1 }}>
              {shown ? (
                <Button variant="text" disabled={saved[question.id]} onClick={() => run(bookmark(question.id))}>{saved[question.id] ? "Saved" : "Bookmark"}</Button>
              ) : (
                <Button variant="contained" disabled={!selected} onClick={() => run(check())}>Check</Button>
              )}
              <Button
                variant="contained"
                disabled={!shown}
                onClick={() => index + 1 >= session.questions.length ? run(finish()) : (setSelected(""), setIndex(index + 1))}
              >
                {index + 1 >= session.questions.length ? "Finish" : "Next"}
              </Button>
            </Box>
          </Box>
          {shown && <Alert sx={{ mt: 2 }} severity={shown.correct ? "success" : "warning"}>{shown.correct ? "Correct." : `Answer: ${shown.correctKey}.`} {shown.explanation}</Alert>}
          {shown ? <ReportQuestion key={question.id} questionId={question.id} /> : null}
        </Card>
      )}

      {review && !session && !starting && (
        <Box sx={{ maxWidth: 820 }}>
          <Card sx={{ p: 3, mb: 2 }}>
            <Typography color="text.secondary">{review.kind === "retry" ? "Retry score · not counted in progress" : "Score"}</Typography>
            <Typography sx={{ fontSize: 36, fontWeight: 800 }}>{review.correct} / {review.answered}</Typography>
            <Typography color="text.secondary">
              {review.answered ? Math.round((review.correct / review.answered) * 100) : 0}% accuracy{review.difficulty ? ` · ${LEVEL_NAME[review.difficulty as Level]}` : ""}{review.topicName ? ` · ${review.topicName}` : ""}
            </Typography>
            {standing.map((item) => (
              <Box key={item.topicId} sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap", alignItems: "center" }}>
                <Typography fontWeight={700} sx={{ mr: 1 }}>{item.name}</Typography>
                {LEVELS.map((level) => (
                  <Chip key={level} size="small" color={item.levels[level].passed ? "success" : item.levels[level].unlocked ? "primary" : "default"} variant={item.levels[level].passed ? "filled" : "outlined"} label={`${LEVEL_NAME[level]}${item.levels[level].passed ? " ✓" : item.levels[level].unlocked ? "" : " 🔒"}`} />
                ))}
              </Box>
            ))}
            {review.weakTopic ? <Alert severity="info" sx={{ mt: 2 }}>Weak area: {review.weakTopic.name}. Practise it again to strengthen it.</Alert> : null}
            <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
              {review.kind !== "retry" ? <Button variant="contained" onClick={() => run(start({ topicId: topicId || undefined, difficulty: difficulty || undefined }))}>Next 5 questions</Button> : null}
              {review.kind !== "retry" && review.answered > review.correct ? (
                <Button variant="outlined" onClick={() => run(start({ retryOf: review.id }))}>Retry wrong answers ({review.answered - review.correct})</Button>
              ) : null}
              <Button onClick={() => setReview(null)}>Back to practice</Button>
            </Box>
          </Card>
          <Typography sx={{ fontSize: 20, fontWeight: 800, mb: 1 }}>Review answers</Typography>
          <Box sx={{ display: "grid", gap: 1.5 }}>
            {review.questions.filter((item) => item.yourAnswer).map((item, at) => {
              const yours = item.options.find((option) => option.key === item.yourAnswer);
              const right = item.options.find((option) => option.key === item.correctKey);
              return (
                <Card key={item.id} sx={{ p: 2, borderLeft: "4px solid", borderLeftColor: item.correct ? "success.main" : "error.main" }}>
                  <Typography fontWeight={700}>{at + 1}. {item.stem}</Typography>
                  {!item.correct ? <Typography color="error.main" sx={{ mt: 1 }}>Your answer: {item.yourAnswer}. {yours?.text}</Typography> : null}
                  <Typography color="success.main" fontWeight={700} sx={{ mt: 0.5 }}>Correct: {item.correctKey}. {right?.text}</Typography>
                  {item.explanation ? <Typography color="text.secondary" sx={{ mt: 1 }}>{item.explanation}</Typography> : null}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Button size="small" sx={{ mt: 1 }} disabled={saved[item.id]} onClick={() => run(bookmark(item.id))}>{saved[item.id] ? "Saved" : "Bookmark"}</Button>
                    <ReportQuestion questionId={item.id} />
                  </Box>
                </Card>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}
