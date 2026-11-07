"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, Box, Button, Card, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Eyebrow } from "@/components/Shell";
import { PageSkeleton } from "@/components/PageSkeleton";

type Result = {
  title: string;
  rawScore: number;
  maxScore: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  questions: Array<{ id: string; stem: string; options: Array<{ key: string; text: string }>; selectedKey: string; correctKey: string; explanation: string; correct: boolean }>;
};

export default function ResultPage() {
  const params = useParams<{ id: string }>();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Result>(`/mocks/attempts/${params.id}/result`).then(setResult).catch((err) => setError(err.message));
  }, [params.id]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!result) return <PageSkeleton variant="dashboard" />;

  return (
    <Box>
      <Eyebrow>RESULT REVIEW</Eyebrow>
      <Typography variant="h1">{result.title || "Mock result"}</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Marks are calculated on the server from the exam rule snapshot.</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
        <Card sx={{ p: 2 }}>Score<Typography sx={{ fontSize: 28, fontWeight: 800 }}>{result.rawScore} / {result.maxScore}</Typography></Card>
        <Card sx={{ p: 2 }}>Correct<Typography sx={{ fontSize: 28, fontWeight: 800 }}>{result.correct}</Typography></Card>
        <Card sx={{ p: 2 }}>Incorrect<Typography sx={{ fontSize: 28, fontWeight: 800 }}>{result.incorrect}</Typography></Card>
        <Card sx={{ p: 2 }}>Unanswered<Typography sx={{ fontSize: 28, fontWeight: 800 }}>{result.unanswered}</Typography></Card>
      </Box>
      {result.questions.map((question, index) => (
        <Card key={question.id} sx={{ p: 2, mt: 2 }}>
          <Typography fontWeight={800}>{index + 1}. {question.stem}</Typography>
          <Typography color={question.correct ? "success.main" : "warning.main"}>Your answer: {question.selectedKey || "blank"} · Correct: {question.correctKey}</Typography>
          <Typography color="text.secondary">{question.explanation}</Typography>
        </Card>
      ))}
      <Button component={Link} href="/mocks" sx={{ mt: 2 }} variant="contained">Back to mocks</Button>
    </Box>
  );
}
