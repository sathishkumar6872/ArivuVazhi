"use client";

import { useState } from "react";
import { Box, Button, Card, MenuItem, TextField, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Eyebrow, PageSkeleton, useData } from "@/components/Frame";

type Exam = { id: string; name: string; authority: string; code: string; lifecycle: string; version: string };

export default function ExamsPage() {
  const { data, error, loading, reload } = useData<Exam[]>("/admin/exams");
  const [form, setForm] = useState({ name: "", code: "", authority: "TNPSC" });
  return (
    <Box>
      <Eyebrow>MANUAL ONLY</Eyebrow>
      <Typography variant="h1">Examinations</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Exam add/lifecycle mattum manual. Syllabus, questions, PYQ automatic / student-side — inga create panna koodathu.
      </Typography>
      {error && <Typography color="error">{error}</Typography>}
      <Card sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { md: "1fr 1fr 1fr auto" }, gap: 1 }}>
          <TextField label="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <TextField label="Code" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
          <TextField label="Authority" value={form.authority} onChange={(event) => setForm({ ...form, authority: event.target.value })} />
          <Button variant="contained" onClick={async () => { await api("/admin/exams", { method: "POST", body: JSON.stringify(form) }); setForm({ name: "", code: "", authority: "TNPSC" }); reload(); }}>Create exam</Button>
        </Box>
      </Card>
      {loading ? <PageSkeleton variant="cards" rows={5} /> : (
      <Card sx={{ p: 2 }}>
        {(data || []).map((exam) => (
          <Box key={exam.id} sx={{ display: "flex", justifyContent: "space-between", py: 1.2, borderBottom: "1px solid #e6eaf0", gap: 2 }}>
            <Box><b>{exam.name}</b><Typography color="text.secondary">{exam.authority} · {exam.code} · {exam.version}</Typography></Box>
            <TextField select size="small" value={exam.lifecycle} onChange={async (event) => { await api(`/admin/exams/${exam.id}`, { method: "PATCH", body: JSON.stringify({ lifecycle: event.target.value }) }); reload(); }}>
              {["draft", "under_review", "published", "revised", "archived"].map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}
            </TextField>
          </Box>
        ))}
      </Card>
      )}
    </Box>
  );
}
