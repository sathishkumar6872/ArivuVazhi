"use client";

import { useEffect, useState } from "react";
import { Box, Button, Card, Chip, LinearProgress, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Eyebrow } from "@/components/Shell";
import { PageSkeleton } from "@/components/PageSkeleton";

type Exam = { id: string; name: string; authority: string; description: string; pattern: { durationMinutes: number; totalQuestions: number; marksPerQuestion: number; negativeMarks: number } };
type Detail = Exam & { subjects: Array<{ id: string; name: string; topics: Array<{ id: string; name: string; studied: boolean; accuracy: number; attempted: number }> }> };

export default function ExamsPage() {
  const { user, refreshUser } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(examId?: string) {
    setLoading(true);
    try {
      const list = await api<Exam[]>("/exams");
      setExams(list);
      const id = examId || user?.primaryExamId || list[0]?.id;
      if (id) setDetail(await api<Detail>(`/exams/${id}`));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load().catch((err) => { setError(err.message); setLoading(false); }); }, [user?.primaryExamId]);

  async function select(examId: string, primary = true) {
    await api(`/exams/${examId}/select`, { method: "POST", body: JSON.stringify({ primary }) });
    await refreshUser();
    await load(examId);
  }

  return (
    <Box>
      <Eyebrow>EXAM CENTRE</Eyebrow>
      <Typography variant="h1">My Examinations</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>One primary goal, with other exams ready when you need them.</Typography>
      {error && <Typography color="error">{error}</Typography>}
      {loading ? <PageSkeleton rows={3} /> : (
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
        {exams.map((exam) => (
          <Card key={exam.id} sx={{ p: 2 }}>
            <Chip size="small" label={exam.id === user?.primaryExamId ? "Primary" : "Available"} color={exam.id === user?.primaryExamId ? "primary" : "default"} />
            <Typography sx={{ fontWeight: 800, fontSize: 20, my: 1 }}>{exam.name}</Typography>
            <Typography color="text.secondary" fontSize={13}>{exam.authority}</Typography>
            <Typography color="text.secondary" fontSize={13} sx={{ my: 1 }}>{exam.pattern.totalQuestions} questions · {exam.pattern.durationMinutes} min · {exam.pattern.marksPerQuestion} marks</Typography>
            <Button size="small" variant={exam.id === user?.primaryExamId ? "outlined" : "contained"} onClick={() => select(exam.id)}> {exam.id === user?.primaryExamId ? "View syllabus" : "Set as primary"}</Button>
          </Card>
        ))}
      </Box>
      )}
      {!loading && detail && (
        <Card sx={{ p: 2, mt: 2 }}>
          <Typography fontWeight={800} sx={{ mb: 1 }}>Syllabus progress · {detail.name}</Typography>
          {detail.subjects.map((subject) => {
            const studied = subject.topics.filter((topic) => topic.studied).length;
            const width = subject.topics.length ? Math.round((studied / subject.topics.length) * 100) : 0;
            return (
              <Box key={subject.id} sx={{ mb: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}><Typography>{subject.name}</Typography><b>{studied} / {subject.topics.length} topics</b></Box>
                <LinearProgress variant="determinate" value={width} />
                {subject.topics.map((topic) => <Typography key={topic.id} fontSize={13} color="text.secondary">{topic.name} · {topic.attempted} answered · {topic.accuracy}% accuracy</Typography>)}
              </Box>
            );
          })}
        </Card>
      )}
    </Box>
  );
}
