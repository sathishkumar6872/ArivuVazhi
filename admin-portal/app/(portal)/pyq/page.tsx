"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Card, Checkbox, Chip, FormControlLabel, LinearProgress, MenuItem, Tab, Tabs, TextField, Typography } from "@mui/material";
import { API_URL, api } from "@/lib/api";
import { Eyebrow, useData } from "@/components/Frame";

type Exam = { id: string; name: string };
type Settings = { startYear: number; endYear: number; languages: string[]; stages: string[]; method: string; docTypes: string[]; schedule: string; lastRunAt?: string };
type YearRow = { year: number; questionPapers: number; answerKeys: number; linkOnly: number; awaitingReview: number; failed: number; status: string[] };
type Overview = { settings: Settings | null; years: YearRow[]; missing: Array<{ year: number; docType: string }> };
type Doc = {
  id: string; paperId: string; year: number; stage: string; paperName: string; language: string; shift: string;
  docType: "question_paper" | "answer_key"; keyVersion: string; versionNo: number; fileId: string; fileName: string; mimeType: string;
  status: string; warnings: string[]; source: { kind: string; name: string; url: string; pageUrl: string };
  processing: { method: string; error: string; questions: number; answers: number };
  answers: Array<{ number: number; key: string; note: string }>;
};
type Question = { id: string; pyqNumber: number; pyqPage: number | null; stem: string; options: Array<{ key: string; text: string }>; correctKey: string; keyStatus: string; status: string; questionType: string; subjectId: string; topicId: string; subtopic: string; difficulty: string; aiSuggestedKey: string; flagReason: string; duplicateOf: string };
type Session = { id: string; title: string; year: number; stage: string; paperName: string; language: string; shift: string; status: string; rightsStatus: string; documents: number; matchStatus: string[] };
type SessionDetail = Session & {
  documents: Doc[];
  questions: Question[];
  syllabus: { subjects: Array<{ id: string; name: string }>; topics: Array<{ id: string; name: string; subjectId: string }>; questionTypes: string[] };
};
const ANSWER_EVIDENCE = { oldAnswerMistake: "Previous answer did not match the reviewed source", newAnswerWhyCorrect: "Checked against the original paper by the admin" };
type Source = { id: string; name: string; url: string; type: string; examIds: string[]; enabled: boolean; lastCheckedAt: string | null; lastSuccessAt: string | null; reliability: string; lastError: string; autoAdded?: boolean };
type Job = { id: string; status: string; trigger: string; startYear: number; endYear: number; sourcesChecked: string[]; discovered: number; downloaded: number; uploaded: number; skipped: number; failed: number; missing: Array<{ year: number; docType: string }>; log: string[]; error: string; startedAt: string; finishedAt: string | null;
  progress?: { step: number; label: string; done: number; total: number; current: string };
  reading?: { done: number; total: number; failed: number };
};

const thisYear = new Date().getFullYear();

/** Year-range choices: last 10 years, then 5-year blocks going back 25 years. */
const RANGES = [
  { value: `${thisYear - 9}-${thisYear}`, label: `Last 10 years (${thisYear - 9}–${thisYear})` },
  ...Array.from({ length: 5 }, (_, i) => {
    const end = thisYear - i * 5;
    const start = end - 4;
    return { value: `${start}-${end}`, label: i === 0 ? `Last 5 years (${start}–${end})` : `${start}–${end}` };
  }),
];
const TYPE_LABEL = { question_paper: "Question paper", answer_key: "Answer key" } as const;
const KEY_LABEL: Record<string, string> = { official_final: "official · final", official_revised: "official · revised", official_tentative: "official · tentative", admin: "set by admin", unverified: "no official answer" };
const statusColor = (label: string) => (/Both Found|Found/.test(label) ? "success" : /Missing/.test(label) ? "warning" : /Required/.test(label) ? "info" : "default") as "success" | "warning" | "info" | "default";

const STEPS = ["Find official site", "Read pages", "AI checks links", "Download", "Read questions"];

/** Live progress of a discovery job: five steps, a bar for the current step, and counts. */
function JobProgress({ job }: { job: Job }) {
  const running = job.status === "running";
  const reading = job.reading || { done: 0, total: 0, failed: 0 };
  const readingDone = reading.total === 0 || reading.done >= reading.total;
  // Step 5 is "reading questions": active once downloads finished and documents are still being processed.
  const step = running ? Math.max(1, job.progress?.step || 1) : readingDone ? 6 : 5;
  const total = step === 5 ? reading.total : job.progress?.total || 0;
  const done = step === 5 ? reading.done : job.progress?.done || 0;
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const label = step === 5 ? `Reading questions from ${reading.total} new document(s)` : step === 6 ? (job.status === "failed" ? "Stopped" : "Finished") : job.progress?.label || "Starting";
  return (
    <Card sx={{ p: 2, borderColor: job.status === "failed" ? "error.main" : step <= 5 ? "primary.light" : "#D7E8DC", borderWidth: 1.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <Typography fontWeight={800}>{running || step === 5 ? "Discovery in progress" : "Last discovery"}</Typography>
        <Typography color="text.secondary" fontSize={13}>
          started {new Date(job.startedAt).toLocaleTimeString()}{job.finishedAt ? ` · downloads finished ${new Date(job.finishedAt).toLocaleTimeString()}` : ""}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 1.5 }}>
        {STEPS.map((name, index) => {
          const n = index + 1;
          const state = n < step ? "done" : n === step ? "active" : "todo";
          return (
            <Chip
              key={name}
              size="small"
              label={`${state === "done" ? "✓ " : `${n}. `}${name}`}
              color={state === "done" ? "success" : state === "active" ? "primary" : "default"}
              variant={state === "todo" ? "outlined" : "filled"}
            />
          );
        })}
      </Box>
      {step <= 5 ? (
        <>
          <Typography fontWeight={700} fontSize={14}>{label}{total ? ` — ${done} of ${total}` : ""}</Typography>
          <LinearProgress variant={total ? "determinate" : "indeterminate"} value={percent} sx={{ height: 8, borderRadius: 4, my: 1 }} />
          {job.progress?.current && step < 5 ? <Typography color="text.secondary" fontSize={12} sx={{ wordBreak: "break-all" }}>{job.progress.current}</Typography> : null}
        </>
      ) : job.status === "failed" ? (
        <Alert severity="error">{job.error || "Discovery stopped."}</Alert>
      ) : (
        <Typography color="success.main" fontWeight={700} fontSize={14}>All steps finished.</Typography>
      )}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
        {[["Found", job.discovered], ["Downloaded", job.downloaded], ["Added", job.uploaded], ["Skipped", job.skipped], ["Failed", job.failed + reading.failed]].map(([name, value]) => (
          <Chip key={String(name)} size="small" variant="outlined" label={`${name}: ${value}`} />
        ))}
      </Box>
      {!running && job.missing.length ? (
        <Typography fontSize={13} color="warning.main" sx={{ mt: 1 }}>
          Still missing: {job.missing.map((m) => `${m.year} ${m.docType === "question_paper" ? "question paper" : "answer key"}`).join(", ")}
        </Typography>
      ) : null}
    </Card>
  );
}

/** Fetch the original file with the admin token and show it inline. */
function Preview({ docId }: { docId: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let revoke = "";
    fetch(`${API_URL}/admin/pyq/documents/${docId}/file`, { headers: { Authorization: `Bearer ${localStorage.getItem("av_admin_access") || ""}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message || "Preview not available");
        revoke = URL.createObjectURL(await res.blob());
        setUrl(revoke);
      })
      .catch((err) => setError(err.message));
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [docId]);
  if (error) return <Alert severity="info">{error}</Alert>;
  if (!url) return <Typography color="text.secondary">Loading original…</Typography>;
  return <Box component="iframe" src={url} title="Original document" sx={{ width: "100%", height: 640, border: "1px solid #D7E8DC", borderRadius: 2 }} />;
}

export default function PyqPage() {
  const exams = useData<Exam[]>("/admin/exams");
  const [examId, setExamId] = useState("");
  const [tab, setTab] = useState(0);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState("");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<Settings>({ startYear: thisYear - 4, endYear: thisYear, languages: ["ta", "en"], stages: [], method: "both", docTypes: ["question_paper", "answer_key"], schedule: "off" });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [open, setOpen] = useState<SessionDetail | null>(null);
  const [previewDoc, setPreviewDoc] = useState("");

  const [form, setForm] = useState({ year: String(thisYear - 1), docType: "question_paper", keyVersion: "final", stage: "", paperName: "", language: "ta", shift: "", subjectCode: "", sourceName: "TNPSC", sourceUrl: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [newSource, setNewSource] = useState({ name: "", url: "", type: "official" });
  const [customRange, setCustomRange] = useState(false);
  const [ai, setAi] = useState<{ provider: string; activeProvider: string; chatgptEnabled: boolean; geminiEnabled: boolean } | null>(null);

  useEffect(() => {
    api<{ provider: string; activeProvider: string; chatgptEnabled: boolean; geminiEnabled: boolean }>("/admin/pyq/settings").then(setAi).catch(() => undefined);
  }, []);

  async function chooseProvider(provider: string) {
    await run("provider", async () => {
      await api("/admin/pyq/settings", { method: "PUT", body: JSON.stringify({ provider }) });
      setAi((current) => (current ? { ...current, provider } : current));
    }, `PYQ will use ${provider === "auto" ? "the active provider" : provider === "chatgpt" ? "ChatGPT" : "Gemini"}.`);
  }

  useEffect(() => {
    if (!examId && exams.data?.length) setExamId(exams.data[0].id);
  }, [exams.data, examId]);

  const refresh = useCallback(async () => {
    if (!examId) return;
    const [ov, js, ss, ds, srcs] = await Promise.all([
      api<Overview>(`/admin/pyq/overview?examId=${examId}`),
      api<Job[]>(`/admin/pyq/jobs?examId=${examId}`),
      api<Session[]>(`/admin/pyq/sessions?examId=${examId}`),
      api<Doc[]>(`/admin/pyq/documents?examId=${examId}`),
      api<Source[]>("/admin/pyq/sources"),
    ]);
    setOverview(ov);
    if (ov.settings) setSettings(ov.settings);
    setJobs(js);
    setSessions(ss);
    setDocs(ds);
    setSources(srcs);
  }, [examId]);

  useEffect(() => {
    setOpen(null);
    refresh().catch((err) => setError(err.message));
  }, [refresh]);

  // Keep refreshing while anything is still processing or a job is running.
  const working =
    jobs.some((job) => job.status === "running" || (job.reading && job.reading.done < job.reading.total)) ||
    docs.some((doc) => doc.status === "processing" || doc.status === "uploaded");
  useEffect(() => {
    if (!working) return;
    const timer = setTimeout(() => refresh().catch(() => undefined), 2500);
    return () => clearTimeout(timer);
  }, [working, jobs, docs, refresh]);

  async function run(name: string, task: () => Promise<unknown>, done?: string) {
    setBusy(name);
    setError("");
    setInfo("");
    try {
      await task();
      if (done) setInfo(done);
      await refresh();
      if (open) setOpen(await api<SessionDetail>(`/admin/pyq/sessions/${open.id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy("");
    }
  }

  const openSession = (id: string) => run("open", async () => { setOpen(await api<SessionDetail>(`/admin/pyq/sessions/${id}`)); setPreviewDoc(""); setTab(2); });

  async function upload() {
    if (!files.length) return setError("Choose at least one file.");
    await run("upload", async () => {
      const failed: string[] = [];
      for (const file of files) {
        const params = new URLSearchParams({ examId, ...form, keyVersion: form.docType === "answer_key" ? form.keyVersion : "", fileName: file.name });
        try {
          await api(`/admin/pyq/documents?${params}`, { method: "POST", headers: { "Content-Type": file.type || "application/pdf" }, body: file });
        } catch (err) {
          failed.push(`${file.name}: ${err instanceof Error ? err.message : "failed"}`);
        }
      }
      setFiles([]);
      if (failed.length) throw new Error(failed.join(" · "));
    }, "Uploaded. Processing runs in the background.");
  }

  const examName = (exams.data || []).find((exam) => exam.id === examId)?.name || "";
  const unmatched = docs.filter((doc) => !doc.paperId && doc.status !== "link_only" && doc.status !== "rejected");
  const linkOnly = docs.filter((doc) => doc.status === "link_only");
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  return (
    <Box>
      <Eyebrow>PREVIOUS YEAR QUESTIONS</Eyebrow>
      <Typography variant="h1">PYQ management</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Collect official question papers and answer keys for any year range — upload them or let discovery read the official sources. Originals stay in Google Drive.
        Nothing reaches students until you approve the documents, verify rights and publish.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {info && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo("")}>{info}</Alert>}
      <TextField select size="small" label="Exam" value={examId} onChange={(event) => setExamId(event.target.value)} sx={{ minWidth: 260, mb: 1 }}>
        {(exams.data || []).map((exam) => <MenuItem key={exam.id} value={exam.id}>{exam.name}</MenuItem>)}
      </TextField>
      <Tabs value={tab} onChange={(_e, value) => setTab(value)} sx={{ mb: 2 }} variant="scrollable">
        <Tab label="Overview & discovery" />
        <Tab label="Upload" />
        <Tab label={`Sessions (${sessions.length})`} />
        <Tab label={`Needs attention (${unmatched.length + linkOnly.length})`} />
        <Tab label="Sources" />
      </Tabs>

      {tab === 0 && (
        <Box sx={{ display: "grid", gap: 2 }}>
          {jobs[0] ? <JobProgress job={jobs[0]} /> : null}
          <Card sx={{ p: 2 }}>
            <Typography fontWeight={800} sx={{ mb: 1.5 }}>AI provider for PYQ</Typography>
            <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
              <TextField select size="small" label="Provider" value={ai?.provider || "auto"} onChange={(e) => chooseProvider(e.target.value)} sx={{ minWidth: 260 }} disabled={!ai || Boolean(busy)}>
                <MenuItem value="auto">Auto (active provider: {ai?.activeProvider || "—"})</MenuItem>
                <MenuItem value="chatgpt" disabled={!ai?.chatgptEnabled}>ChatGPT{ai && !ai.chatgptEnabled ? " — not enabled" : ""}</MenuItem>
                <MenuItem value="gemini" disabled={!ai?.geminiEnabled}>Gemini{ai && !ai.geminiEnabled ? " — not enabled" : ""}</MenuItem>
              </TextField>
              <Typography color="text.secondary" fontSize={13}>Used for finding sources, checking links and reading text PDFs. Scanned PDFs and images (OCR) always use Gemini.</Typography>
            </Box>
          </Card>

          <Card sx={{ p: 2 }}>
            <Typography fontWeight={800} sx={{ mb: 1.5 }}>Collection settings · {examName}</Typography>
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
              <TextField
                select
                size="small"
                label="Year range"
                value={customRange || !RANGES.some((r) => r.value === `${settings.startYear}-${settings.endYear}`) ? "custom" : `${settings.startYear}-${settings.endYear}`}
                onChange={(e) => {
                  if (e.target.value === "custom") return setCustomRange(true);
                  const [startYear, endYear] = e.target.value.split("-").map(Number);
                  setCustomRange(false);
                  setSettings({ ...settings, startYear, endYear });
                }}
                sx={{ minWidth: 230 }}
              >
                {RANGES.map((range) => <MenuItem key={range.value} value={range.value}>{range.label}</MenuItem>)}
                <MenuItem value="custom">Custom…{!RANGES.some((r) => r.value === `${settings.startYear}-${settings.endYear}`) ? ` (${settings.startYear}–${settings.endYear})` : ""}</MenuItem>
              </TextField>
              {customRange || !RANGES.some((r) => r.value === `${settings.startYear}-${settings.endYear}`) ? (
                <>
                  <TextField size="small" type="number" label="From" value={settings.startYear} onChange={(e) => setSettings({ ...settings, startYear: Number(e.target.value) })} sx={{ width: 100 }} />
                  <TextField size="small" type="number" label="To" value={settings.endYear} onChange={(e) => setSettings({ ...settings, endYear: Number(e.target.value) })} sx={{ width: 100 }} />
                </>
              ) : null}
              <TextField select size="small" label="Method" value={settings.method} onChange={(e) => setSettings({ ...settings, method: e.target.value })} sx={{ width: 150 }}>
                <MenuItem value="manual">Manual</MenuItem><MenuItem value="automatic">Automatic</MenuItem><MenuItem value="both">Both</MenuItem>
              </TextField>
              <TextField select size="small" label="Schedule" value={settings.schedule} onChange={(e) => setSettings({ ...settings, schedule: e.target.value })} sx={{ width: 140 }}>
                <MenuItem value="off">Off</MenuItem><MenuItem value="weekly">Weekly</MenuItem>
              </TextField>
              <TextField size="small" label="Stages (comma separated)" value={settings.stages.join(", ")} onChange={(e) => setSettings({ ...settings, stages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            </Box>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mt: 1 }}>
              {[["ta", "Tamil"], ["en", "English"], ["bilingual", "Bilingual"]].map(([value, label]) => (
                <FormControlLabel key={value} control={<Checkbox size="small" checked={settings.languages.includes(value)} onChange={() => setSettings({ ...settings, languages: toggle(settings.languages, value) })} />} label={label} />
              ))}
              {[["question_paper", "Question papers"], ["answer_key", "Answer keys"]].map(([value, label]) => (
                <FormControlLabel key={value} control={<Checkbox size="small" checked={settings.docTypes.includes(value)} onChange={() => setSettings({ ...settings, docTypes: toggle(settings.docTypes, value) })} />} label={label} />
              ))}
            </Box>
            <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
              <Button variant="outlined" disabled={Boolean(busy)} onClick={() => run("settings", () => api(`/admin/pyq/collections/${examId}`, { method: "PUT", body: JSON.stringify(settings) }), "Settings saved.")}>Save settings</Button>
              <Button variant="contained" disabled={Boolean(busy) || settings.method === "manual"} onClick={() => run("discover", () => api("/admin/pyq/discovery/run", { method: "POST", body: JSON.stringify({ examId }) }), "Discovery started.")}>Run discovery now</Button>
            </Box>
          </Card>

          <Card sx={{ p: 2, overflowX: "auto" }}>
            <Typography fontWeight={800} sx={{ mb: 1 }}>Coverage</Typography>
            <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", "& th, & td": { textAlign: "left", p: 1, borderBottom: "1px solid #EEF1F6", fontSize: 13 } }}>
              <thead><tr><th>Year</th><th>Question papers</th><th>Answer keys</th><th>Links to download</th><th>Awaiting review</th><th>Failed</th><th>Status</th></tr></thead>
              <tbody>
                {(overview?.years || []).map((row) => (
                  <tr key={row.year}>
                    <td><b>{row.year}</b></td><td>{row.questionPapers}</td><td>{row.answerKeys}</td><td>{row.linkOnly}</td><td>{row.awaitingReview}</td><td>{row.failed}</td>
                    <td>{row.status.map((label) => <Chip key={label} size="small" label={label} color={statusColor(label)} sx={{ mr: 0.5, mb: 0.5 }} />)}</td>
                  </tr>
                ))}
              </tbody>
            </Box>
          </Card>

          <Card sx={{ p: 2 }}>
            <Typography fontWeight={800} sx={{ mb: 1 }}>Discovery jobs</Typography>
            {!jobs.length ? <Typography color="text.secondary">No jobs yet.</Typography> : null}
            {jobs.map((job) => (
              <Box key={job.id} sx={{ py: 1, borderBottom: "1px solid #EEF1F6" }}>
                <Typography fontSize={14}>
                  <Chip size="small" label={job.status} color={job.status === "done" ? "success" : job.status === "failed" ? "error" : "default"} sx={{ mr: 1 }} />
                  {new Date(job.startedAt).toLocaleString()} · {job.trigger} · {job.startYear}–{job.endYear} · sources {job.sourcesChecked.join(", ") || "—"}
                </Typography>
                <Typography fontSize={13} color="text.secondary">
                  discovered {job.discovered} · downloaded {job.downloaded} · added {job.uploaded} · skipped {job.skipped} · failed {job.failed}
                  {job.missing.length ? ` · missing: ${job.missing.map((m) => `${m.year} ${m.docType === "question_paper" ? "QP" : "AK"}`).join(", ")}` : ""}
                </Typography>
                {job.error ? <Typography fontSize={13} color="error.main">{job.error}</Typography> : null}
              </Box>
            ))}
          </Card>
        </Box>
      )}

      {tab === 1 && (
        <Card sx={{ p: 2 }}>
          <Typography fontWeight={800} sx={{ mb: 1.5 }}>Upload question papers or answer keys · {examName}</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
            <TextField size="small" type="number" label="Year" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
            <TextField select size="small" label="Document type" value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })}>
              <MenuItem value="question_paper">Question paper</MenuItem><MenuItem value="answer_key">Answer key</MenuItem>
            </TextField>
            <TextField select size="small" label="Answer key version" value={form.keyVersion} disabled={form.docType !== "answer_key"} onChange={(e) => setForm({ ...form, keyVersion: e.target.value })}>
              <MenuItem value="tentative">Tentative</MenuItem><MenuItem value="final">Final</MenuItem><MenuItem value="revised">Revised</MenuItem>
            </TextField>
            <TextField select size="small" label="Language" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
              <MenuItem value="ta">Tamil</MenuItem><MenuItem value="en">English</MenuItem><MenuItem value="bilingual">Bilingual</MenuItem>
            </TextField>
            <TextField size="small" label="Exam stage (e.g. Prelims)" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} />
            <TextField size="small" label="Paper / subject" value={form.paperName} onChange={(e) => setForm({ ...form, paperName: e.target.value })} />
            <TextField size="small" label="Session / shift" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })} />
            <TextField size="small" label="Subject code (optional)" placeholder="e.g. 004" value={form.subjectCode} onChange={(e) => setForm({ ...form, subjectCode: e.target.value.trim() })} sx={{ width: 170 }} />
            <TextField size="small" label="Source (e.g. TNPSC)" value={form.sourceName} onChange={(e) => setForm({ ...form, sourceName: e.target.value })} />
            <TextField size="small" label="Source link" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} sx={{ gridColumn: { md: "span 2" } }} />
            <Button variant="outlined" component="label" sx={{ gridColumn: { md: "span 2" } }}>
              {files.length ? `${files.length} file(s) selected` : "Choose files (PDF, PNG, JPEG, WEBP)"}
              <input hidden multiple type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFiles([...(e.target.files || [])])} />
            </Button>
          </Box>
          <Typography color="text.secondary" fontSize={13} sx={{ mt: 1 }}>
            Answer keys are matched to the question paper with the same details, or by the printed subject code. A key PDF with several subjects is split per subject. Scanned papers are read with AI (OCR). Duplicate files are refused.
          </Typography>
          <Button sx={{ mt: 1.5 }} variant="contained" disabled={busy === "upload"} onClick={upload}>{busy === "upload" ? "Uploading…" : "Upload"}</Button>
        </Card>
      )}

      {tab === 2 && (
        <Box sx={{ display: "grid", gap: 1.5 }}>
          {!open && sessions.map((row) => (
            <Card key={row.id} sx={{ p: 2, cursor: "pointer" }} onClick={() => openSession(row.id)}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                <Box>
                  <Typography fontWeight={800}>{row.title}</Typography>
                  <Typography color="text.secondary" fontSize={13}>{row.documents} documents · rights {row.rightsStatus} · {row.status}</Typography>
                </Box>
                <Box>{row.matchStatus.map((label) => <Chip key={label} size="small" label={label} color={statusColor(label)} sx={{ mr: 0.5 }} />)}</Box>
              </Box>
            </Card>
          ))}
          {!open && !sessions.length ? <Typography color="text.secondary">No sessions yet. Upload a question paper or run discovery.</Typography> : null}
          {open && (
            <Card sx={{ p: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
                <Box>
                  <Typography fontWeight={800}>{open.title}</Typography>
                  <Box sx={{ mt: 0.5 }}>{open.matchStatus.map((label) => <Chip key={label} size="small" label={label} color={statusColor(label)} sx={{ mr: 0.5 }} />)}</Box>
                </Box>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Button variant="outlined" disabled={open.rightsStatus === "verified" || Boolean(busy)} onClick={() => run("rights", () => api(`/admin/pyq/sessions/${open.id}`, { method: "PATCH", body: JSON.stringify({ rightsStatus: "verified" }) }), "Rights verified.")}>
                    {open.rightsStatus === "verified" ? "Rights verified" : "Verify rights"}
                  </Button>
                  <Button variant="contained" disabled={Boolean(busy)} onClick={() => run("publish", async () => { const r = await api<{ published: number; pending: number }>(`/admin/pyq/sessions/${open.id}/publish`, { method: "POST" }); setInfo(`Published ${r.published}. ${r.pending} still need an official answer or review.`); })}>Publish</Button>
                  <Button onClick={() => setOpen(null)}>Back</Button>
                </Box>
              </Box>

              <Typography fontWeight={800} sx={{ mt: 2, mb: 1 }}>Documents</Typography>
              {open.documents.map((doc) => (
                <Box key={doc.id} sx={{ p: 1.5, mb: 1, border: "1px solid #D7E8DC", borderRadius: 2 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                    <Typography fontWeight={700}>
                      {TYPE_LABEL[doc.docType]}{doc.docType === "answer_key" ? ` · ${doc.keyVersion} v${doc.versionNo}` : ""} · {doc.fileName}
                    </Typography>
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                      <Chip size="small" label={doc.status} color={doc.status === "approved" ? "success" : doc.status === "failed" ? "error" : "default"} />
                      <Chip size="small" label={doc.source.kind} />
                      {doc.processing.method ? <Chip size="small" label={doc.processing.method === "ocr" ? "OCR" : "text"} /> : null}
                    </Box>
                  </Box>
                  <Typography fontSize={13} color="text.secondary">
                    {doc.docType === "question_paper" ? `${doc.processing.questions} questions read` : `${doc.processing.answers} answers read`}
                    {doc.source.url ? ` · ${doc.source.url}` : ""}
                  </Typography>
                  {doc.processing.error ? <Alert severity="error" sx={{ mt: 1 }}>{doc.processing.error}</Alert> : null}
                  {doc.warnings.map((w) => <Typography key={w} fontSize={13} color="warning.main">• {w}</Typography>)}
                  <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                    <Button size="small" disabled={!doc.fileId} onClick={() => setPreviewDoc(previewDoc === doc.id ? "" : doc.id)}>{previewDoc === doc.id ? "Hide original" : "View original"}</Button>
                    <Button size="small" color="success" disabled={Boolean(busy) || (doc.status !== "processed" && doc.status !== "rejected")} onClick={() => run("approve", () => api(`/admin/pyq/documents/${doc.id}/review`, { method: "POST", body: JSON.stringify({ decision: "approve" }) }), doc.docType === "answer_key" ? "Answer key approved; official answers applied." : "Question paper approved.")}>Approve</Button>
                    <Button size="small" color="error" disabled={Boolean(busy) || doc.status === "rejected"} onClick={() => run("reject", () => api(`/admin/pyq/documents/${doc.id}/review`, { method: "POST", body: JSON.stringify({ decision: "reject" }) }), "Rejected.")}>Reject</Button>
                    <Button size="small" disabled={Boolean(busy) || !doc.fileId} onClick={() => run("retry", () => api(`/admin/pyq/documents/${doc.id}/retry`, { method: "POST" }), "Re-processing started.")}>Retry processing</Button>
                  </Box>
                </Box>
              ))}
              {previewDoc ? <Box sx={{ mb: 2 }}><Preview docId={previewDoc} /></Box> : null}

              <Typography fontWeight={800} sx={{ mt: 2, mb: 1 }}>Questions ({open.questions.length})</Typography>
              {open.questions.map((q) => (
                <Box key={q.id} sx={{ p: 1.5, mb: 1, border: "1px solid #D7E8DC", borderRadius: 2 }}>
                  <Typography fontWeight={700}>{q.pyqNumber}. {q.stem}</Typography>
                  {q.options.map((o) => (
                    <Typography key={o.key} fontSize={14} color={o.key === q.correctKey ? "success.main" : "text.primary"} fontWeight={o.key === q.correctKey ? 800 : 400}>({o.key}) {o.text}</Typography>
                  ))}
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 1, flexWrap: "wrap" }}>
                    <TextField select size="small" label="Answer" value={q.correctKey} sx={{ minWidth: 100 }} onChange={(e) => run("key", () => api(`/admin/questions/${q.id}`, { method: "PATCH", body: JSON.stringify({ correctKey: e.target.value, changeReason: "Answer set by admin while reviewing the PYQ", ...ANSWER_EVIDENCE }) }), "Answer saved (marked as set by admin).")}>
                      <MenuItem value="?" disabled>—</MenuItem>
                      {q.options.map((o) => <MenuItem key={o.key} value={o.key}>{o.key}</MenuItem>)}
                    </TextField>
                    <Chip size="small" label={KEY_LABEL[q.keyStatus] || q.keyStatus || "—"} color={q.keyStatus.startsWith("official") ? "success" : q.keyStatus === "admin" ? "info" : "warning"} />
                    <Chip size="small" label={q.status} />
                    {q.pyqPage ? <Chip size="small" label={`page ${q.pyqPage}`} /> : null}
                    {q.subjectId === "unmapped" ? <Chip size="small" color="warning" label="subject not mapped" /> : null}
                    {q.duplicateOf ? <Chip size="small" color="warning" label="possible duplicate" /> : null}
                    {q.aiSuggestedKey && q.correctKey !== q.aiSuggestedKey ? (
                      <>
                        <Chip size="small" variant="outlined" color="secondary" label={`AI suggestion: ${q.aiSuggestedKey} (not official)`} />
                        <Button size="small" disabled={Boolean(busy)} onClick={() => run("key", () => api(`/admin/questions/${q.id}`, { method: "PATCH", body: JSON.stringify({ correctKey: q.aiSuggestedKey, changeReason: "AI-suggested answer accepted by admin after checking the paper", ...ANSWER_EVIDENCE }) }), "Suggestion accepted (marked as set by admin).")}>Accept suggestion</Button>
                      </>
                    ) : null}
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 1, flexWrap: "wrap" }}>
                    <TextField select size="small" label="Subject" value={open.syllabus.subjects.some((s) => s.id === q.subjectId) ? q.subjectId : ""} sx={{ minWidth: 160 }} onChange={(e) => run("classify", () => api(`/admin/questions/${q.id}`, { method: "PATCH", body: JSON.stringify({ subjectId: e.target.value }) }), "Subject saved.")}>
                      {open.syllabus.subjects.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                    </TextField>
                    <TextField select size="small" label="Topic" value={open.syllabus.topics.some((t) => t.id === q.topicId) ? q.topicId : ""} sx={{ minWidth: 180 }} onChange={(e) => run("classify", () => api(`/admin/questions/${q.id}`, { method: "PATCH", body: JSON.stringify({ topicId: e.target.value }) }), "Topic saved.")}>
                      {open.syllabus.topics.filter((t) => q.subjectId === "unmapped" || t.subjectId === q.subjectId).map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                    </TextField>
                    <TextField size="small" label="Subtopic" defaultValue={q.subtopic || ""} sx={{ minWidth: 160 }} onBlur={(e) => { if (e.target.value.trim() !== (q.subtopic || "")) run("classify", () => api(`/admin/questions/${q.id}`, { method: "PATCH", body: JSON.stringify({ subtopic: e.target.value.trim() }) }), "Subtopic saved."); }} />
                    <TextField select size="small" label="Type" value={q.questionType || "other"} sx={{ minWidth: 140 }} onChange={(e) => run("classify", () => api(`/admin/questions/${q.id}`, { method: "PATCH", body: JSON.stringify({ questionType: e.target.value }) }), "Type saved.")}>
                      {open.syllabus.questionTypes.map((t) => <MenuItem key={t} value={t}>{t.replace(/_/g, " ")}</MenuItem>)}
                    </TextField>
                    <TextField select size="small" label="Difficulty" value={q.difficulty || "medium"} sx={{ minWidth: 120 }} onChange={(e) => run("classify", () => api(`/admin/questions/${q.id}`, { method: "PATCH", body: JSON.stringify({ difficulty: e.target.value }) }), "Difficulty saved.")}>
                      {["easy", "medium", "hard"].map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                    </TextField>
                  </Box>
                  {q.flagReason ? <Typography fontSize={12} color="warning.main" sx={{ mt: 0.5 }}>{q.flagReason}</Typography> : null}
                </Box>
              ))}
            </Card>
          )}
        </Box>
      )}

      {tab === 3 && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Card sx={{ p: 2 }}>
            <Typography fontWeight={800} sx={{ mb: 1 }}>Not matched to a question paper</Typography>
            {!unmatched.length ? <Typography color="text.secondary">Nothing to match.</Typography> : null}
            {unmatched.map((doc) => {
              const candidates = sessions.filter((s) => s.year === doc.year);
              return (
                <Box key={doc.id} sx={{ py: 1, borderBottom: "1px solid #EEF1F6", display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                  <Typography fontSize={14} sx={{ flex: 1, minWidth: 240 }}>{doc.year} · {TYPE_LABEL[doc.docType]} {doc.keyVersion} · {doc.paperName || "—"} · {doc.language || "—"} {doc.shift ? `· ${doc.shift}` : ""} · {doc.fileName}</Typography>
                  <TextField select size="small" label="Match to session" value="" sx={{ minWidth: 260 }} onChange={(e) => run("link", () => api(`/admin/pyq/documents/${doc.id}/link`, { method: "POST", body: JSON.stringify({ paperId: e.target.value }) }), "Matched. Review it in the session.")}>
                    {candidates.length ? candidates.map((s) => <MenuItem key={s.id} value={s.id}>{s.title}</MenuItem>) : <MenuItem disabled value="">No session for {doc.year}</MenuItem>}
                  </TextField>
                </Box>
              );
            })}
          </Card>
          <Card sx={{ p: 2 }}>
            <Typography fontWeight={800} sx={{ mb: 1 }}>Found but not downloaded — download and upload manually</Typography>
            {!linkOnly.length ? <Typography color="text.secondary">Nothing here.</Typography> : null}
            {linkOnly.map((doc) => (
              <Box key={doc.id} sx={{ py: 1, borderBottom: "1px solid #EEF1F6" }}>
                <Typography fontSize={14}>{doc.year} · {TYPE_LABEL[doc.docType]} · {doc.source.name}</Typography>
                <Typography fontSize={13} component="a" href={doc.source.url} target="_blank" rel="noreferrer" sx={{ wordBreak: "break-all" }}>{doc.source.url}</Typography>
                <Typography fontSize={12} color="text.secondary">{doc.warnings[0]}</Typography>
              </Box>
            ))}
          </Card>
        </Box>
      )}

      {tab === 4 && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Card sx={{ p: 2 }}>
            <Typography fontWeight={800} sx={{ mb: 1.5 }}>Add a source</Typography>
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
              <TextField size="small" label="Name (e.g. TNPSC)" value={newSource.name} onChange={(e) => setNewSource({ ...newSource, name: e.target.value })} />
              <TextField size="small" label="Page URL listing question papers" value={newSource.url} onChange={(e) => setNewSource({ ...newSource, url: e.target.value })} sx={{ minWidth: 340 }} />
              <TextField select size="small" label="Type" value={newSource.type} onChange={(e) => setNewSource({ ...newSource, type: e.target.value })} sx={{ width: 170 }}>
                <MenuItem value="official">Official</MenuItem><MenuItem value="verified">Other verified</MenuItem>
              </TextField>
              <Button variant="contained" disabled={Boolean(busy)} onClick={() => run("source", async () => { await api("/admin/pyq/sources", { method: "POST", body: JSON.stringify({ ...newSource, examIds: [examId] }) }); setNewSource({ name: "", url: "", type: "official" }); }, "Source added.")}>Add for {examName || "exam"}</Button>
            </Box>
            <Typography color="text.secondary" fontSize={13} sx={{ mt: 1 }}>Optional: "Run discovery" finds the official site by itself when no source is set (official government domains only). Discovery follows robots.txt, waits between requests, and never signs in or solves CAPTCHAs.</Typography>
          </Card>
          {sources.map((src) => (
            <Card key={src.id} sx={{ p: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                <Box>
                  <Typography fontWeight={800}>{src.name} <Chip size="small" label={src.type} sx={{ ml: 1 }} />{src.autoAdded ? <Chip size="small" color="info" label="found automatically" sx={{ ml: 0.5 }} /> : null}</Typography>
                  <Typography fontSize={13} sx={{ wordBreak: "break-all" }}>{src.url}</Typography>
                  <Typography fontSize={13} color="text.secondary">
                    {src.examIds.length ? `${src.examIds.length} exam(s)` : "all exams"} · checked {src.lastCheckedAt ? new Date(src.lastCheckedAt).toLocaleString() : "never"} · last found {src.lastSuccessAt ? new Date(src.lastSuccessAt).toLocaleString() : "never"}
                  </Typography>
                  {src.lastError ? <Typography fontSize={13} color="error.main">{src.lastError}</Typography> : null}
                </Box>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  <Chip size="small" label={src.reliability} color={src.reliability === "ok" ? "success" : src.reliability === "failing" ? "error" : "default"} />
                  <Button size="small" onClick={() => run("toggle", () => api(`/admin/pyq/sources/${src.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !src.enabled }) }))}>{src.enabled ? "Disable" : "Enable"}</Button>
                  <Button size="small" color="error" onClick={() => run("delete", () => api(`/admin/pyq/sources/${src.id}`, { method: "DELETE" }), "Source removed.")}>Delete</Button>
                </Box>
              </Box>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}
