"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, MenuItem, TextField, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageSkeleton } from "@/components/PageSkeleton";

type Exam = { id: string; name: string };
type Topic = { id: string; name: string };
type Question = { id: string; stem: string; options: Array<{ key: string; text: string }>; correctKey?: string; explanation?: string };
type Feedback = { correct: boolean; correctKey: string; explanation: string };

export default function PracticePage() {
  const { user } = useAuth();
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [examId, setExamId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api<Exam[]>("/exams").then((items) => {
      setExams(items);
      setExamId(user?.primaryExamId || items[0]?.id || "");
    }).catch((err) => setError(err.message));
  }, [user?.primaryExamId]);

  useEffect(() => {
    if (!examId) return;
    api<{ subjects: Array<{ topics: Topic[] }> }>(`/exams/${examId}`).then((detail) => {
      setTopics(detail.subjects.flatMap((subject) => subject.topics));
    }).catch((err) => setError(err.message));
  }, [examId]);

  async function start() {
    setError("");
    setSummary("");
    setFeedback(null);
    setSelected("");
    setIndex(0);
    setStarting(true);
    try {
      const session = await api<{ id: string; questions: Question[] }>("/practice/sessions", {
        method: "POST",
        body: JSON.stringify({ examId, topicId: topicId || undefined, difficulty: difficulty || undefined, count: 5 }),
      });
      setSessionId(session.id);
      setQuestions(session.questions);
    } finally {
      setStarting(false);
    }
  }

  async function check() {
    const question = questions[index];
    const result = await api<Feedback>(`/practice/sessions/${sessionId}/answers`, {
      method: "POST",
      body: JSON.stringify({ questionId: question.id, selectedKey: selected }),
    });
    setFeedback(result);
  }

  async function next() {
    setFeedback(null);
    setSelected("");
    if (index + 1 >= questions.length) {
      const done = await api<{ correct: number; total: number }>(`/practice/sessions/${sessionId}/complete`, { method: "POST" });
      setSummary(`Session complete. ${done.correct} correct out of ${done.total}.`);
      setQuestions([]);
      return;
    }
    setIndex(index + 1);
  }

  const question = questions[index];

  return (
    <Box>
      <Typography sx={{ fontSize: 28, fontWeight: 800 }}>Practice</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Questions generate with AI for your exam language when you start. The answer stays hidden until you check.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!exams && !error ? <PageSkeleton rows={3} /> : null}
      {starting ? <PageSkeleton variant="quiz" /> : null}
      {!question && !starting && exams && (
        <Card sx={{ p: 3 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 2 }}>
            <TextField select label="Exam" value={examId} onChange={(event) => setExamId(event.target.value)}>{exams.map((exam) => <MenuItem key={exam.id} value={exam.id}>{exam.name}</MenuItem>)}</TextField>
            <TextField select label="Topic" value={topicId} onChange={(event) => setTopicId(event.target.value)}><MenuItem value="">Any topic</MenuItem>{topics.map((topic) => <MenuItem key={topic.id} value={topic.id}>{topic.name}</MenuItem>)}</TextField>
            <TextField select label="Difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><MenuItem value="">Any</MenuItem><MenuItem value="easy">Easy</MenuItem><MenuItem value="medium">Medium</MenuItem><MenuItem value="hard">Hard</MenuItem></TextField>
          </Box>
          <Button sx={{ mt: 2 }} variant="contained" onClick={() => start().catch((err) => setError(err.message))}>Start practice</Button>
          {summary && <Alert sx={{ mt: 2 }} severity="success">{summary}</Alert>}
        </Card>
      )}
      {question && !starting && (
        <Card sx={{ p: { xs: 2, md: 4 }, maxWidth: 760 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
            <Typography color="primary" fontWeight={800}>Question {index + 1} of {questions.length}</Typography>
            <Typography color="text.secondary" fontWeight={700}>{topics.find((topic) => topic.id === topicId)?.name || exams.find((exam) => exam.id === examId)?.name}</Typography>
          </Box>
          <Typography sx={{ fontSize: 22, fontWeight: 800, mb: 2 }}>{question.stem}</Typography>
          <Box sx={{ display: "grid", gap: 1.2 }}>
            {question.options.map((option) => {
              const picked = selected === option.key;
              const show = Boolean(feedback);
              const correct = feedback?.correctKey === option.key;
              return (
                <Button key={option.key} onClick={() => !feedback && setSelected(option.key)} sx={{ justifyContent: "flex-start", py: 1.4, px: 2, borderRadius: 3, border: "1px solid", borderColor: picked || (show && correct) ? "#5B4DFF" : "#EAECF0", bgcolor: show && correct ? "#F1EEFF" : picked ? "#F8F7FF" : "white", color: "#172033" }}>
                  {option.key}. {option.text}
                </Button>
              );
            })}
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 3 }}>
            <Button variant="outlined" disabled={index === 0} onClick={() => { setFeedback(null); setSelected(""); setIndex(index - 1); }}>Previous</Button>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button variant="contained" disabled={!selected || Boolean(feedback)} onClick={() => check().catch((err) => setError(err.message))}>Check</Button>
              <Button variant="contained" disabled={!feedback} onClick={() => next().catch((err) => setError(err.message))}>{index + 1 >= questions.length ? "Finish" : "Next"}</Button>
            </Box>
          </Box>
          {feedback && <Alert sx={{ mt: 2 }} severity={feedback.correct ? "success" : "warning"}>{feedback.correct ? "Correct." : `Answer: ${feedback.correctKey}.`} {feedback.explanation}</Alert>}
        </Card>
      )}
    </Box>
  );
}
