"use client";

import { useState } from "react";
import { Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Eyebrow, PageSkeleton, useData } from "@/components/Frame";

type Exam = { id: string; name: string; authority: string; code: string; lifecycle: string; version: string };

export default function ExamsPage() {
  const { data, error, loading, reload } = useData<Exam[]>("/admin/exams");
  const [form, setForm] = useState({ name: "", code: "", authority: "TNPSC" });
  const [actionError, setActionError] = useState("");
  const [pending, setPending] = useState<{ exam: Exam; lifecycle: string } | null>(null);

  async function run(action: () => Promise<void>) {
    setActionError("");
    try { await action(); } catch (err) { setActionError(err instanceof Error ? err.message : "Request failed"); }
  }
  function changeLifecycle(exam: Exam, lifecycle: string) {
    return run(async () => { await api(`/admin/exams/${exam.id}`, { method: "PATCH", body: JSON.stringify({ lifecycle }) }); reload(); });
  }
  return (
    <Box>
      <Eyebrow>MANUAL ONLY</Eyebrow>
      <Typography variant="h1">Examinations</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Exam add/lifecycle mattum manual. Syllabus, questions, PYQ automatic / student-side — inga create panna koodathu.
      </Typography>
      {error && <Typography color="error">{error}</Typography>}
      {actionError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError("")}>{actionError}</Alert>}
      <Card sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { md: "1fr 1fr 1fr auto" }, gap: 1 }}>
          <TextField label="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <TextField label="Code" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
          <TextField label="Authority" value={form.authority} onChange={(event) => setForm({ ...form, authority: event.target.value })} />
          <Button variant="contained" onClick={() => run(async () => { await api("/admin/exams", { method: "POST", body: JSON.stringify(form) }); setForm({ name: "", code: "", authority: "TNPSC" }); reload(); })}>Create exam</Button>
        </Box>
      </Card>
      {loading ? <PageSkeleton variant="cards" rows={5} /> : (
      <Card sx={{ p: 2 }}>
        {(data || []).map((exam) => (
          <Box key={exam.id} sx={{ display: "flex", justifyContent: "space-between", py: 1.2, borderBottom: "1px solid #e6eaf0", gap: 2 }}>
            <Box><b>{exam.name}</b><Typography color="text.secondary">{exam.authority} · {exam.code} · {exam.version}</Typography></Box>
            <TextField select size="small" value={exam.lifecycle} inputProps={{ "aria-label": `Lifecycle for ${exam.name}` }} onChange={(event) => {
              const lifecycle = event.target.value;
              if (lifecycle === "archived" || lifecycle === "cancelled") setPending({ exam, lifecycle });
              else void changeLifecycle(exam, lifecycle);
            }}>
              {["draft", "under_review", "published", "revised", "archived", "cancelled"].map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}
            </TextField>
          </Box>
        ))}
      </Card>
      )}
      <Dialog open={Boolean(pending)} onClose={() => setPending(null)}>
        <DialogTitle>Mark exam as {pending?.lifecycle}?</DialogTitle>
        <DialogContent>
          <Typography>{pending?.exam.name} will be moved from {pending?.exam.lifecycle} to {pending?.lifecycle}. Students may lose access to it.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => { const next = pending; setPending(null); if (next) void changeLifecycle(next.exam, next.lifecycle); }}>Confirm</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
