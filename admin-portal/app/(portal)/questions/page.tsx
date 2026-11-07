"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "@/lib/api";
import { PageSkeleton, useData } from "@/components/Frame";

type Exam = { id: string; name: string; code: string; lifecycle: string };
type Question = {
  id: string;
  stem: string;
  status: string;
  source: string;
  difficulty: string;
  correctKey: string;
  explanation: string;
  options: Array<{ key: string; text: string }>;
};

export default function QuestionsPage() {
  const exams = useData<Exam[]>("/admin/exams");
  const [examId, setExamId] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<Question | null>(null);
  const [correctKey, setCorrectKey] = useState("A");
  const [changeReason, setChangeReason] = useState("");
  const [oldAnswerMistake, setOldAnswerMistake] = useState("");
  const [newAnswerWhyCorrect, setNewAnswerWhyCorrect] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  useEffect(() => {
    if (examId || !exams.data?.length) return;
    const preferred =
      exams.data.find((exam) => exam.code === "TNPSC-G2") ||
      exams.data.find((exam) => exam.lifecycle === "published") ||
      exams.data[0];
    setExamId(preferred.id);
  }, [exams.data, examId]);

  async function load() {
    if (!examId) return;
    setLoadingQuestions(true);
    try {
      setQuestions(await api<Question[]>(`/admin/questions?examId=${examId}&limit=50`));
    } finally {
      setLoadingQuestions(false);
    }
  }

  useEffect(() => {
    load().catch((err) => {
      setError(err.message);
      setLoadingQuestions(false);
    });
  }, [examId]);

  function openCorrect(question: Question) {
    setEdit(question);
    setCorrectKey(question.correctKey);
    setChangeReason("");
    setOldAnswerMistake("");
    setNewAnswerWhyCorrect("");
  }

  async function submitCorrection() {
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/questions/${edit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          correctKey,
          changeReason,
          oldAnswerMistake,
          newAnswerWhyCorrect,
        }),
      });
      setEdit(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction fail");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Question bank student-side AI generate pannum. Admin view-only. Key wrong na correction + reason + old/new explanation mandatory.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <TextField select label="Exam" value={examId} onChange={(event) => setExamId(event.target.value)} sx={{ my: 2, minWidth: 260 }}>
        {(exams.data || []).map((exam) => (
          <MenuItem key={exam.id} value={exam.id}>{exam.name}</MenuItem>
        ))}
      </TextField>
      {(exams.loading || loadingQuestions) ? <PageSkeleton variant="table" rows={6} /> : (
      <Card sx={{ overflow: "auto" }}>
        <Box
          component="table"
          sx={{ width: "100%", borderCollapse: "collapse", "& th, & td": { textAlign: "left", p: 1.4, borderBottom: "1px solid #EEF1F6", fontSize: 13 } }}
        >
          <thead>
            <tr>
              <th>Question</th>
              <th>Source</th>
              <th>Key</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {questions.map((question) => (
              <tr key={question.id}>
                <td>{question.stem}</td>
                <td>{question.source}</td>
                <td>{question.correctKey}</td>
                <td>
                  <Chip
                    size="small"
                    label={question.status}
                    sx={{
                      fontWeight: 800,
                      bgcolor: question.status === "published" ? "#ECFDF3" : "#FFF6ED",
                      color: question.status === "published" ? "#027A48" : "#B54708",
                    }}
                  />
                </td>
                <td>
                  <Button size="small" onClick={() => openCorrect(question)}>Correct key</Button>
                </td>
              </tr>
            ))}
            {!questions.length && (
              <tr>
                <td colSpan={5}>
                  <Typography color="text.secondary">No generated questions yet for this exam.</Typography>
                </td>
              </tr>
            )}
          </tbody>
        </Box>
      </Card>
      )}

      <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} fullWidth maxWidth="sm">
        <DialogTitle>Correct answer key</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>{edit?.stem}</Typography>
          <TextField
            select
            fullWidth
            margin="dense"
            label="New correct key"
            value={correctKey}
            onChange={(event) => setCorrectKey(event.target.value)}
          >
            {(edit?.options || []).map((option) => (
              <MenuItem key={option.key} value={option.key}>{option.key}. {option.text}</MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            margin="dense"
            label="Why are you changing this?"
            multiline
            minRows={2}
            value={changeReason}
            onChange={(event) => setChangeReason(event.target.value)}
          />
          <TextField
            fullWidth
            margin="dense"
            label="Old answer — what was wrong?"
            multiline
            minRows={2}
            value={oldAnswerMistake}
            onChange={(event) => setOldAnswerMistake(event.target.value)}
          />
          <TextField
            fullWidth
            margin="dense"
            label="New answer — why is it correct?"
            multiline
            minRows={2}
            value={newAnswerWhyCorrect}
            onChange={(event) => setNewAnswerWhyCorrect(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEdit(null)}>Cancel</Button>
          <Button variant="contained" disabled={busy} onClick={submitCorrection}>
            {busy ? "Saving…" : "Save correction"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
