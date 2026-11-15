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
  reviewedBy?: string;
  flagged?: boolean;
  flagReason?: string;
  reportCount?: number;
  stats?: { answered: number; correct: number };
};

const PAGE_SIZE = 50;

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
  const [status, setStatus] = useState("");
  const [review, setReview] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("served");
  const [page, setPage] = useState(1);

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
      const params = new URLSearchParams({ examId, limit: String(PAGE_SIZE), page: String(page), sort });
      if (status) params.set("status", status);
      if (review) params.set("reviewedBy", review);
      if (flaggedOnly) params.set("flagged", "true");
      if (query) params.set("q", query);
      setQuestions(await api<Question[]>(`/admin/questions?${params}`));
    } finally {
      setLoadingQuestions(false);
    }
  }

  useEffect(() => {
    load().catch((err) => {
      setError(err.message);
      setLoadingQuestions(false);
    });
  }, [examId, status, review, flaggedOnly, query, sort, page]);

  async function decide(question: Question, next: "published" | "rejected") {
    setError("");
    try {
      await api(`/admin/questions/${question.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

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
        Each exam has one shared question pool. AI-generated questions join it after passing an AI answer check (auto) or your approval.
        Questions with 3 student reports, or that most students get wrong, are hidden and flagged for you. Changing a key needs a reason.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", my: 2 }}>
        <TextField select size="small" label="Exam" value={examId} onChange={(event) => { setExamId(event.target.value); setPage(1); }} sx={{ minWidth: 220 }}>
          {(exams.data || []).map((exam) => (
            <MenuItem key={exam.id} value={exam.id}>{exam.name}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} sx={{ minWidth: 150 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="published">Published</MenuItem>
          <MenuItem value="under_review">Under review</MenuItem>
          <MenuItem value="rejected">Rejected</MenuItem>
        </TextField>
        <TextField select size="small" label="Reviewed by" value={review} onChange={(event) => { setReview(event.target.value); setPage(1); }} sx={{ minWidth: 150 }}>
          <MenuItem value="">Anyone</MenuItem>
          <MenuItem value="auto">AI check</MenuItem>
          <MenuItem value="admin">Admin</MenuItem>
          <MenuItem value="none">Not reviewed</MenuItem>
        </TextField>
        <TextField select size="small" label="Sort" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} sx={{ minWidth: 150 }}>
          <MenuItem value="served">Most answered</MenuItem>
          <MenuItem value="new">Newest</MenuItem>
        </TextField>
        <Chip label="Flagged only" color={flaggedOnly ? "error" : "default"} variant={flaggedOnly ? "filled" : "outlined"} onClick={() => { setFlaggedOnly(!flaggedOnly); setPage(1); }} />
        <Box component="form" onSubmit={(event: React.FormEvent) => { event.preventDefault(); setQuery(search.trim()); setPage(1); }} sx={{ display: "flex", gap: 1 }}>
          <TextField size="small" label="Search question text" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Button type="submit" variant="outlined">Search</Button>
        </Box>
      </Box>
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
              <th>Answered</th>
              <th>Reports</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {questions.map((question) => (
              <tr key={question.id}>
                <td>
                  {question.stem}
                  {question.flagReason ? <Typography fontSize={12} color={question.flagged ? "error.main" : "text.secondary"}>{question.flagReason}</Typography> : null}
                </td>
                <td>{question.source}</td>
                <td>{question.correctKey}</td>
                <td>
                  {question.stats?.answered || 0}
                  {question.stats?.answered ? <Typography fontSize={12} color="text.secondary">{Math.round((question.stats.correct / question.stats.answered) * 100)}% correct</Typography> : null}
                </td>
                <td>{question.reportCount || 0}</td>
                <td>
                  <Chip
                    size="small"
                    label={question.flagged ? "flagged" : question.status === "published" ? (question.reviewedBy === "auto" ? "published · AI" : "published · admin") : question.status}
                    sx={{
                      fontWeight: 800,
                      bgcolor: question.flagged ? "#FEE2E2" : question.status === "published" ? "#ECFDF3" : "#FFF6ED",
                      color: question.flagged ? "#B42318" : question.status === "published" ? "#027A48" : "#B54708",
                    }}
                  />
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {question.flagged || question.status !== "published" ? (
                    <Button size="small" color="success" onClick={() => decide(question, "published")}>Approve</Button>
                  ) : null}
                  {question.status !== "rejected" ? (
                    <Button size="small" color="error" onClick={() => decide(question, "rejected")}>Reject</Button>
                  ) : null}
                  <Button size="small" onClick={() => openCorrect(question)}>Correct key</Button>
                </td>
              </tr>
            ))}
            {!questions.length && (
              <tr>
                <td colSpan={7}>
                  <Typography color="text.secondary">No questions match these filters.</Typography>
                </td>
              </tr>
            )}
          </tbody>
        </Box>
      </Card>
      )}
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 2 }}>
        <Button variant="outlined" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <Typography color="text.secondary">Page {page}</Typography>
        <Button variant="outlined" disabled={questions.length < PAGE_SIZE} onClick={() => setPage(page + 1)}>Next</Button>
      </Box>

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
