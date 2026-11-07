"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Eyebrow } from "@/components/Shell";
import { PageSkeleton } from "@/components/PageSkeleton";

type Option = { key: string; text: string };
type Question = { id: string; stem: string; options: Option[] };
type Paper = {
  id: string;
  title: string;
  year: number;
  sourceName: string;
  note: string;
  questionCount?: number;
  questions?: Question[];
};
type ReviewQuestion = Question & {
  selectedKey: string;
  correct: boolean;
  correctKey: string;
  explanation?: string;
};
type Result = { paperId: string; total: number; answered: number; correct: number; questions: ReviewQuestion[] };

export default function PyqPage() {
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Paper[]>("/pyq").then(setPapers).catch((err) => setError(err.message));
  }, []);

  async function openPaper(id: string) {
    setError("");
    setResult(null);
    setAnswers({});
    setPaper(await api<Paper>(`/pyq/${id}`));
  }

  async function submit() {
    if (!paper?.questions?.length) return;
    setBusy(true);
    setError("");
    try {
      const payload = await api<Result>(`/pyq/${paper.id}/submit`, {
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

  const questions = paper?.questions || [];
  const answered = Object.keys(answers).length;

  return (
    <Box>
      <Eyebrow>PREVIOUS YEAR PRACTICE</Eyebrow>
      <Typography variant="h1">PYQ</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Only papers with verified usage rights are shown. Keys unlock after you submit.
      </Typography>
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {!paper && !papers && !error ? <PageSkeleton rows={4} /> : null}
      {!paper && (papers || []).map((item) => (
        <Card key={item.id} sx={{ p: 2, mb: 2 }}>
          <Typography fontWeight={800}>{item.title}</Typography>
          <Typography color="text.secondary">{item.year} · {item.sourceName}</Typography>
          <Typography fontSize={13}>{item.note}</Typography>
          <Button sx={{ mt: 1 }} onClick={() => openPaper(item.id).catch((err) => setError(err.message))}>
            Open paper
          </Button>
        </Card>
      ))}
      {!paper && papers && !papers.length ? (
        <Typography color="text.secondary">No published PYQ papers yet.</Typography>
      ) : null}

      {paper && !result && (
        <Box>
          <Typography fontWeight={800} sx={{ mb: 1 }}>
            {paper.title} · {paper.year}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {answered}/{questions.length} answered
          </Typography>
          {questions.map((question, index) => (
            <Card key={question.id} sx={{ p: 2, mb: 1 }}>
              <Typography fontWeight={700}>{index + 1}. {question.stem}</Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
                {(question.options || []).map((option) => {
                  const selected = answers[question.id] === option.key;
                  return (
                    <Button
                      key={option.key}
                      size="small"
                      variant={selected ? "contained" : "outlined"}
                      onClick={() => setAnswers((current) => ({ ...current, [question.id]: option.key }))}
                    >
                      {option.key}. {option.text}
                    </Button>
                  );
                })}
              </Box>
            </Card>
          ))}
          <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
            <Button onClick={() => { setPaper(null); setAnswers({}); }}>Back</Button>
            <Button
              variant="contained"
              disabled={busy || answered < questions.length || !questions.length}
              onClick={() => submit()}
            >
              {busy ? "Submitting…" : "Submit paper"}
            </Button>
          </Box>
        </Box>
      )}

      {result && (
        <Box>
          <Card sx={{ p: 2, mb: 2 }}>
            <Typography variant="h3">{result.correct} / {result.total}</Typography>
            <Typography color="text.secondary">
              {Math.round((result.correct / result.total) * 100)}% · scored after submit
            </Typography>
          </Card>
          {result.questions.map((question, index) => (
            <Card key={question.id} sx={{ p: 2, mb: 1 }}>
              <Typography fontWeight={700}>{index + 1}. {question.stem}</Typography>
              <Typography color={question.correct ? "success.main" : "error.main"} fontWeight={800}>
                {question.correct ? "Correct" : `Your answer ${question.selectedKey || "—"} · Key ${question.correctKey}`}
              </Typography>
              {question.explanation ? (
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>{question.explanation}</Typography>
              ) : null}
            </Card>
          ))}
          <Button
            sx={{ mt: 1 }}
            onClick={() => {
              setResult(null);
              setPaper(null);
              setAnswers({});
            }}
          >
            Back to papers
          </Button>
        </Box>
      )}
    </Box>
  );
}
