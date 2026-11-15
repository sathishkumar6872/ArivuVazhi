"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, Chip, MenuItem, TextField, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Eyebrow, PageSkeleton, useData } from "@/components/Frame";

type Exam = { id: string; name: string };
type Extraction = { status: "none" | "processing" | "done" | "failed"; error: string; questions: number; withKey: number };
type Paper = {
  id: string;
  examId: string;
  title: string;
  year: number;
  sourceName: string;
  sourceUrl?: string;
  rightsStatus: string;
  status: string;
  generationSource?: string;
  questionIds?: string[];
  extraction?: Extraction;
};
type Question = {
  id: string;
  pyqNumber: number;
  stem: string;
  options: Array<{ key: string; text: string }>;
  correctKey: string;
  status: string;
  questionType: string;
  subjectId: string;
  flagReason?: string;
};
type PaperDetail = Paper & { questions: Question[] };

const thisYear = new Date().getFullYear();

export default function PyqPage() {
  const exams = useData<Exam[]>("/admin/exams");
  const papers = useData<Paper[]>("/admin/pyq");
  const [examId, setExamId] = useState("");
  const [year, setYear] = useState(String(thisYear - 1));
  const [title, setTitle] = useState("");
  const [sourceName, setSourceName] = useState("TNPSC");
  const [sourceUrl, setSourceUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [open, setOpen] = useState<PaperDetail | null>(null);

  const examName = (id: string) => (exams.data || []).find((exam) => exam.id === id)?.name || "";

  async function loadPaper(id: string) {
    setOpen(await api<PaperDetail>(`/admin/pyq/${id}`));
  }

  // While a paper is being extracted, refresh it every 3 s.
  useEffect(() => {
    if (open?.extraction?.status !== "processing") return;
    const timer = setTimeout(() => loadPaper(open.id).catch(() => undefined), 3000);
    return () => clearTimeout(timer);
  }, [open]);

  async function upload() {
    if (!examId || !file || title.trim().length < 2) {
      setError("Choose the exam, a title and the question paper PDF.");
      return;
    }
    setBusy("upload");
    setError("");
    setInfo("");
    try {
      const params = new URLSearchParams({ examId, year, title: title.trim(), sourceName: sourceName.trim(), sourceUrl: sourceUrl.trim(), fileName: file.name });
      const created = await api<{ id: string }>(`/admin/pyq/import?${params}`, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: file });
      setInfo("Uploaded. AI is reading the questions — this can take a few minutes.");
      setFile(null);
      setTitle("");
      papers.reload?.();
      await loadPaper(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy("");
    }
  }

  async function uploadKey(answerFile: File) {
    if (!open) return;
    setBusy("key");
    setError("");
    try {
      const result = await api<{ found: number; applied: number; withKey: number; total: number }>(
        `/admin/pyq/${open.id}/answer-key?fileName=${encodeURIComponent(answerFile.name)}`,
        { method: "POST", headers: { "Content-Type": "application/pdf" }, body: answerFile },
      );
      setInfo(`Answer key: ${result.applied} answers applied. ${result.withKey} of ${result.total} questions now have a key.`);
      await loadPaper(open.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Answer key failed");
    } finally {
      setBusy("");
    }
  }

  async function setKey(question: Question, key: string) {
    setError("");
    try {
      await api(`/admin/questions/${question.id}`, {
        method: "PATCH",
        body: JSON.stringify({ correctKey: key, changeReason: "Answer key set by admin from the official key", oldAnswerMistake: "Previous key did not match the official answer key", newAnswerWhyCorrect: "Matches the official answer key for this paper" }),
      });
      if (open) await loadPaper(open.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set key");
    }
  }

  async function act(action: "verify" | "publish") {
    if (!open) return;
    setBusy(action);
    setError("");
    try {
      if (action === "verify") {
        await api(`/admin/pyq/${open.id}`, { method: "PATCH", body: JSON.stringify({ rightsStatus: "verified" }) });
        setInfo("Rights marked as verified.");
      } else {
        const result = await api<{ published: number; pending: number }>(`/admin/pyq/${open.id}/publish`, { method: "POST" });
        setInfo(`Published ${result.published} questions. ${result.pending} still need a key or review.`);
      }
      await loadPaper(open.id);
      papers.reload?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <Box>
      <Eyebrow>PREVIOUS YEAR QUESTIONS</Eyebrow>
      <Typography variant="h1">PYQ papers</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Upload the official question paper PDF. AI copies the questions exactly as printed; upload the official answer key to fill the answers.
        Students see a paper only after you verify the rights and publish it. Original PYQs stay separate from AI practice and mock questions.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {info && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo("")}>{info}</Alert>}

      <Card sx={{ p: 2, mb: 3 }}>
        <Typography fontWeight={800} sx={{ mb: 1.5 }}>Upload a question paper</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1.5 }}>
          <TextField select size="small" label="Exam" value={examId} onChange={(event) => setExamId(event.target.value)}>
            {(exams.data || []).map((exam) => <MenuItem key={exam.id} value={exam.id}>{exam.name}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Year" type="number" value={year} onChange={(event) => setYear(event.target.value)} />
          <TextField size="small" label="Title (e.g. Group IV 2023 · General Studies)" value={title} onChange={(event) => setTitle(event.target.value)} />
          <TextField size="small" label="Source (e.g. TNPSC)" value={sourceName} onChange={(event) => setSourceName(event.target.value)} />
          <TextField size="small" label="Source link (official page / PDF URL)" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} />
          <Button variant="outlined" component="label">
            {file ? file.name : "Choose question paper PDF"}
            <input hidden type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </Button>
        </Box>
        <Typography color="text.secondary" fontSize={13} sx={{ mt: 1 }}>Text PDFs only (max 25 MB). Scanned image PDFs are not supported yet.</Typography>
        <Button sx={{ mt: 1.5 }} variant="contained" disabled={busy === "upload"} onClick={upload}>{busy === "upload" ? "Uploading…" : "Upload and extract"}</Button>
      </Card>

      {open ? (
        <Card sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
            <Box>
              <Typography fontWeight={800}>{open.title}</Typography>
              <Typography color="text.secondary">{examName(open.examId)} · {open.year} · {open.sourceName}{open.sourceUrl ? ` · ${open.sourceUrl}` : ""}</Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
              <Chip size="small" label={`extraction: ${open.extraction?.status || "none"}`} color={open.extraction?.status === "failed" ? "error" : open.extraction?.status === "done" ? "success" : "default"} />
              <Chip size="small" label={`rights: ${open.rightsStatus}`} color={open.rightsStatus === "verified" ? "success" : "default"} />
              <Chip size="small" label={open.status} />
              <Button size="small" onClick={() => setOpen(null)}>Close</Button>
            </Box>
          </Box>
          {open.extraction?.status === "processing" ? <Alert severity="info" sx={{ mt: 1.5 }}>Reading questions… this page refreshes by itself.</Alert> : null}
          {open.extraction?.error ? <Alert severity="error" sx={{ mt: 1.5 }}>{open.extraction.error}</Alert> : null}
          <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
            <Button variant="outlined" component="label" disabled={busy === "key" || !open.questions.length}>
              {busy === "key" ? "Reading key…" : "Upload answer key PDF"}
              <input hidden type="file" accept="application/pdf" onChange={(event) => event.target.files?.[0] && uploadKey(event.target.files[0])} />
            </Button>
            <Button variant="outlined" disabled={open.rightsStatus === "verified" || Boolean(busy)} onClick={() => act("verify")}>Mark rights verified</Button>
            <Button variant="contained" disabled={open.rightsStatus !== "verified" || !open.questions.length || Boolean(busy)} onClick={() => act("publish")}>Publish paper</Button>
          </Box>
          <Typography color="text.secondary" fontSize={13} sx={{ mt: 1 }}>
            {open.questions.length} questions · {open.questions.filter((q) => q.correctKey !== "?").length} with answer key · {open.questions.filter((q) => q.status === "published").length} published
          </Typography>
          <Box sx={{ mt: 1.5, display: "grid", gap: 1 }}>
            {open.questions.map((question) => (
              <Box key={question.id} sx={{ p: 1.5, border: "1px solid #D7E8DC", borderRadius: 2 }}>
                <Typography fontWeight={700}>{question.pyqNumber}. {question.stem}</Typography>
                {question.options.map((option) => (
                  <Typography key={option.key} fontSize={14} color={option.key === question.correctKey ? "success.main" : "text.primary"} fontWeight={option.key === question.correctKey ? 800 : 400}>
                    ({option.key}) {option.text}
                  </Typography>
                ))}
                <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 1, flexWrap: "wrap" }}>
                  <TextField select size="small" label="Key" value={question.correctKey} onChange={(event) => setKey(question, event.target.value)} sx={{ minWidth: 90 }} disabled={question.status === "published"}>
                    <MenuItem value="?" disabled>—</MenuItem>
                    {question.options.map((option) => <MenuItem key={option.key} value={option.key}>{option.key}</MenuItem>)}
                  </TextField>
                  <Chip size="small" label={question.questionType || "other"} />
                  <Chip size="small" label={question.subjectId === "unmapped" ? "subject not mapped" : "mapped to syllabus"} color={question.subjectId === "unmapped" ? "warning" : "default"} />
                  <Chip size="small" label={question.status} />
                  {question.flagReason ? <Typography fontSize={12} color="warning.main">{question.flagReason}</Typography> : null}
                </Box>
              </Box>
            ))}
          </Box>
        </Card>
      ) : null}

      <Typography fontWeight={800} sx={{ mb: 1 }}>Papers</Typography>
      {papers.error && <Alert severity="error" sx={{ mb: 2 }}>{papers.error}</Alert>}
      {papers.loading ? <PageSkeleton rows={4} /> : null}
      {!papers.loading && (papers.data || []).map((paper) => (
        <Card key={paper.id} sx={{ p: 2, mb: 1, cursor: "pointer" }} onClick={() => loadPaper(paper.id).catch((err) => setError(err.message))}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, alignItems: "flex-start" }}>
            <Box>
              <Typography fontWeight={800}>{paper.title}</Typography>
              <Typography color="text.secondary">
                {examName(paper.examId)} · {paper.year} · {paper.sourceName} · {paper.questionIds?.length || 0} questions
              </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 0.5 }}>
              {paper.extraction?.status && paper.extraction.status !== "none" ? <Chip size="small" label={`extraction: ${paper.extraction.status}`} /> : null}
              <Chip size="small" label={paper.status} sx={{ fontWeight: 800 }} />
              <Chip size="small" label={`rights: ${paper.rightsStatus}`} />
            </Box>
          </Box>
        </Card>
      ))}
      {!papers.loading && papers.data && !papers.data.length && (
        <Typography color="text.secondary">No PYQ papers yet. Upload the first official paper above.</Typography>
      )}
    </Box>
  );
}
