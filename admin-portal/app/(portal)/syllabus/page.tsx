"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, Chip, MenuItem, TextField, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Eyebrow, PageSkeleton, useData } from "@/components/Frame";

type Exam = { id: string; name: string; code: string };
type Topic = { id: string; name: string; nameEn?: string; nameTa?: string; status: string };
type Subject = {
  id: string;
  name: string;
  nameEn?: string;
  nameTa?: string;
  status: string;
  topics: Topic[];
};
type Snapshot = {
  id: string;
  year: number;
  versionLabel: string;
  source: string;
  status: string;
  notes: string;
  subjects: Array<{
    name?: string;
    nameEn?: string;
    nameTa?: string;
    topics?: Array<string | { name?: string; nameEn?: string; nameTa?: string }>;
  }>;
};

type SyllabusPayload = { current: Subject[]; history: Snapshot[] };

export default function SyllabusPage() {
  const exams = useData<Exam[]>("/admin/exams");
  const [examId, setExamId] = useState("");
  const [data, setData] = useState<SyllabusPayload | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!examId && exams.data?.[0]) setExamId(exams.data[0].id);
  }, [exams.data, examId]);

  const [loadingSyllabus, setLoadingSyllabus] = useState(false);

  async function load(id = examId) {
    if (!id) return;
    setLoadingSyllabus(true);
    try {
      setData(await api<SyllabusPayload>(`/admin/syllabus?examId=${id}`));
    } finally {
      setLoadingSyllabus(false);
    }
  }

  useEffect(() => {
    load().catch((err) => {
      setError(err.message);
      setLoadingSyllabus(false);
    });
  }, [examId]);

  async function refreshSubjects() {
    setBusy("subjects");
    setError("");
    setInfo("");
    try {
      const result = await api<{ provider?: string; subjectCount?: number }>("/admin/syllabus/refresh", {
        method: "POST",
        body: JSON.stringify({ examId, year: new Date().getFullYear() }),
      });
      setInfo(`Step 1 done: ${result.subjectCount ?? "?"} bilingual subjects via ${result.provider || "AI"}. Next: each subject-ku Update topics.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subject refresh fail");
    } finally {
      setBusy("");
    }
  }

  async function refreshSubjectTopics(subjectId: string, label: string) {
    setBusy(subjectId);
    setError("");
    setInfo("");
    try {
      const result = await api<{ provider?: string; topicCount?: number }>(
        `/admin/syllabus/subjects/${subjectId}/refresh`,
        {
          method: "POST",
          body: JSON.stringify({ year: new Date().getFullYear() }),
        },
      );
      setInfo(`${label}: ${result.topicCount ?? "?"} bilingual topics via ${result.provider || "AI"}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Topic refresh fail");
    } finally {
      setBusy("");
    }
  }

  return (
    <Box>
      <Eyebrow>SUBJECT → TOPICS · EN + TA</Eyebrow>
      <Typography variant="h1">Syllabus</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        1) Discover bilingual subjects. 2) Oru subject choose panni topics update. Student app-la Exam language (EN/TA) base-la name show aagum.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {info && <Alert severity="success" sx={{ mb: 2 }}>{info}</Alert>}
      <TextField select label="Exam" value={examId} onChange={(event) => setExamId(event.target.value)} sx={{ my: 1, minWidth: 280 }}>
        {(exams.data || []).map((exam) => (
          <MenuItem key={exam.id} value={exam.id}>{exam.name}</MenuItem>
        ))}
      </TextField>
      <Box sx={{ mb: 2 }}>
        <Button variant="contained" disabled={!examId || Boolean(busy)} onClick={refreshSubjects}>
          {busy === "subjects" ? "Subjects AI fetch…" : "1. Discover subjects (EN + TA)"}
        </Button>
      </Box>

      {(exams.loading || loadingSyllabus) ? <PageSkeleton rows={5} /> : null}
      {!(exams.loading || loadingSyllabus) && <Typography fontWeight={800} sx={{ mb: 1 }}>Live subjects</Typography>}
      {!(exams.loading || loadingSyllabus) && (data?.current || []).map((subject) => {
        const en = subject.nameEn || subject.name;
        const ta = subject.nameTa || subject.name;
        return (
          <Card key={subject.id} sx={{ p: 2, mb: 1.5 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, alignItems: "flex-start" }}>
              <Box>
                <Typography fontWeight={800}>{en}</Typography>
                <Typography color="text.secondary">{ta}</Typography>
                <Typography fontSize={13} sx={{ mt: 0.5 }}>
                  {subject.topics.length} topics
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                disabled={Boolean(busy)}
                onClick={() => refreshSubjectTopics(subject.id, en)}
              >
                {busy === subject.id ? "Topics fetch…" : "2. Update topics"}
              </Button>
            </Box>
            {subject.topics.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                {subject.topics.map((topic) => (
                  <Typography key={topic.id} fontSize={13} sx={{ py: 0.25 }}>
                    · {topic.nameEn || topic.name}
                    {topic.nameTa ? ` / ${topic.nameTa}` : ""}
                  </Typography>
                ))}
              </Box>
            )}
          </Card>
        );
      })}
      {!(exams.loading || loadingSyllabus) && !data?.current?.length && (
        <Typography color="text.secondary" sx={{ mb: 2 }}>Subjects illa — Step 1 press pannunga.</Typography>
      )}

      <Typography fontWeight={800} sx={{ mt: 3, mb: 1 }}>History</Typography>
      {(data?.history || []).map((snap) => (
        <Card key={snap.id} sx={{ p: 2, mb: 1.5 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
            <Typography fontWeight={800}>{snap.versionLabel || snap.year} · {snap.source}</Typography>
            <Chip size="small" label={snap.status} sx={{ fontWeight: 800 }} />
          </Box>
          <Typography color="text.secondary" fontSize={13} sx={{ mb: 1 }}>{snap.notes}</Typography>
          {snap.subjects.map((subject, index) => (
            <Box key={`${subject.nameEn || subject.name}-${index}`} sx={{ mb: 1 }}>
              <Typography fontWeight={700}>
                {subject.nameEn || subject.name}
                {subject.nameTa ? ` / ${subject.nameTa}` : ""}
              </Typography>
              <Typography fontSize={13} color="text.secondary">
                {(subject.topics || [])
                  .map((topic) => (typeof topic === "string" ? topic : topic.nameEn || topic.name || ""))
                  .filter(Boolean)
                  .join(" · ") || "Topics pending"}
              </Typography>
            </Box>
          ))}
        </Card>
      ))}
    </Box>
  );
}
