"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { PageSkeleton } from "@/components/PageSkeleton";

type Question = { id: string; stem: string; options: Array<{ key: string; text: string }> };
type Attempt = {
  id: string;
  deadlineAt: string;
  status: string;
  redirect?: string;
  questions?: Question[];
  answers?: Array<{ questionId: string; selectedKey: string; markedForReview?: boolean }>;
};

export default function AttemptPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, { selectedKey: string; markedForReview: boolean }>>({});
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    api<Attempt>(`/mocks/attempts/${params.id}`)
      .then((data) => {
        if (data.redirect === "result" || data.status === "submitted") {
          router.replace(`/mocks/${params.id}/result`);
          return;
        }
        setAttempt(data);
        const map: Record<string, { selectedKey: string; markedForReview: boolean }> = {};
        data.answers?.forEach((answer) => {
          map[answer.questionId] = { selectedKey: answer.selectedKey || "", markedForReview: Boolean(answer.markedForReview) };
        });
        setAnswers(map);
      })
      .catch((err) => setError(err.message));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [params.id, router]);

  async function save(next: typeof answers) {
    const payload = Object.entries(next).map(([questionId, value]) => ({ questionId, ...value }));
    await api(`/mocks/attempts/${params.id}`, {
      method: "PUT",
      body: JSON.stringify({ answers: payload, idempotencyKey: `save-${params.id}` }),
    });
    setSaved("Saved on server");
  }

  async function submit(auto = false) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      // After the deadline the server rejects saves (answers are already saved per click), so only a manual submit needs it.
      await save(answers).catch((err) => { if (!auto) throw err; });
      await api(`/mocks/attempts/${params.id}/submit`, {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: `submit-${params.id}` }),
      });
      router.push(`/mocks/${params.id}/result`);
    } catch (err) {
      submittingRef.current = false;
      setSubmitting(false);
      throw err;
    }
  }

  const deadline = attempt ? new Date(attempt.deadlineAt).getTime() : 0;
  const timeUp = Boolean(attempt?.questions) && now >= deadline;
  const autoSubmittedRef = useRef(false);
  useEffect(() => {
    if (!timeUp || autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    setConfirmOpen(false);
    submit(true).catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (!attempt?.questions) {
    return (
      <Box>
        {error ? <Alert severity="error">{error}</Alert> : <PageSkeleton variant="quiz" />}
      </Box>
    );
  }

  const question = attempt.questions[index];
  const remaining = Math.max(0, deadline - now);
  const answeredCount = attempt.questions.filter((item) => answers[item.id]?.selectedKey).length;
  const unansweredCount = attempt.questions.length - answeredCount;
  const reviewCount = attempt.questions.filter((item) => answers[item.id]?.markedForReview).length;
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
        <Typography fontWeight={800}>Mock attempt</Typography>
        <Typography color={remaining < 60000 ? "error" : "primary"} fontWeight={800}>{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</Typography>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {remaining === 0 && <Alert severity="warning" sx={{ mb: 2 }}>Time is up. Submitting the answers already saved...</Alert>}
      <Card sx={{ p: 3 }}>
        <Typography color="text.secondary">Question {index + 1} of {attempt.questions.length}</Typography>
        <Typography sx={{ fontSize: 20, fontWeight: 700, my: 2 }}>{question.stem}</Typography>
        {question.options.map((option) => (
          <Button key={option.key} fullWidth sx={{ justifyContent: "flex-start", mb: 1 }} variant={answers[question.id]?.selectedKey === option.key ? "contained" : "outlined"} onClick={() => {
            const next = { ...answers, [question.id]: { selectedKey: option.key, markedForReview: answers[question.id]?.markedForReview || false } };
            setAnswers(next);
            save(next).catch((err) => setError(err.message));
          }}>{option.key}. {option.text}</Button>
        ))}
        <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="outlined" onClick={() => {
            const next = { ...answers, [question.id]: { selectedKey: answers[question.id]?.selectedKey || "", markedForReview: true } };
            setAnswers(next);
            save(next).catch((err) => setError(err.message));
          }}>Mark for review</Button>
          <Button disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</Button>
          <Button disabled={index === attempt.questions.length - 1} onClick={() => setIndex(index + 1)}>Next</Button>
          <Button variant="contained" disabled={submitting} onClick={() => setConfirmOpen(true)}>{submitting ? "Submitting..." : "Submit"}</Button>
          <Typography color="text.secondary">{saved}</Typography>
        </Box>
      </Card>
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Submit mock test?</DialogTitle>
        <DialogContent>
          <Typography>Answered: {answeredCount}</Typography>
          <Typography>Unanswered: {unansweredCount}</Typography>
          <Typography>Marked for review: {reviewCount}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>You cannot change answers after submitting.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Keep working</Button>
          <Button variant="contained" disabled={submitting} onClick={() => { setConfirmOpen(false); submit().catch((err) => setError(err.message)); }}>Submit</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
