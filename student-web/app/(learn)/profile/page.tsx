"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, MenuItem, TextField, Typography } from "@mui/material";
import { api, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Eyebrow } from "@/components/Shell";

type Memory = { enabled: boolean; items: Array<{ id: string; text: string }> };

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", language: "en" as "en" | "ta" });
  const [memory, setMemory] = useState<Memory>({ enabled: true, items: [] });
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [examName, setExamName] = useState("");
  const [year, setYear] = useState("");
  const [result, setResult] = useState("");

  useEffect(() => {
    if (!user) return;
    setForm({ firstName: user.firstName, lastName: user.lastName, phone: user.phone || "", language: user.language });
    api<Memory>("/tutor/memory").then(setMemory).catch(() => undefined);
  }, [user]);

  async function saveProfile() {
    await api<User>("/profile", { method: "PATCH", body: JSON.stringify(form) });
    await refreshUser();
    setMessage("Profile saved");
  }

  async function addHistory() {
    const examHistory = [...(user?.examHistory || []), { examName, year, result }];
    await api("/profile", { method: "PATCH", body: JSON.stringify({ examHistory }) });
    await refreshUser();
    setExamName(""); setYear(""); setResult("");
  }

  async function saveNote() {
    await api("/notes", { method: "POST", body: JSON.stringify({ body: note }) });
    setNote("");
    setMessage("Note saved");
  }

  return (
    <Box>
      <Eyebrow>YOUR ACCOUNT</Eyebrow>
      <Typography variant="h1">My Profile</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Manage your information, notes and what the tutor remembers.</Typography>
      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <Card sx={{ p: 2 }}>
          <Typography fontWeight={800}>Personal details</Typography>
          <TextField label="First name" fullWidth margin="normal" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
          <TextField label="Last name" fullWidth margin="normal" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
          <TextField label="Phone" fullWidth margin="normal" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          <TextField select label="Preferred language" fullWidth margin="normal" value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value as "en" | "ta" })}>
            <MenuItem value="ta">Tamil</MenuItem>
            <MenuItem value="en">English</MenuItem>
          </TextField>
          <Button variant="contained" onClick={() => saveProfile().catch((err) => setMessage(err.message))}>Save changes</Button>
        </Card>
        <Card sx={{ p: 2 }}>
          <Typography fontWeight={800}>Learning memory</Typography>
          <Typography color="text.secondary">Memory is {memory.enabled ? "on" : "off"}. You can correct, reset or disable it.</Typography>
          {memory.items.map((item) => <Typography key={item.id} sx={{ py: 1 }}>{item.text}</Typography>)}
          {!memory.items.length && <Typography color="text.secondary" sx={{ my: 1 }}>No memory items yet.</Typography>}
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button variant="outlined" onClick={async () => { const next = await api<Memory>("/tutor/memory", { method: "PATCH", body: JSON.stringify({ enabled: !memory.enabled }) }); setMemory(next); }}>Turn {memory.enabled ? "off" : "on"}</Button>
            <Button color="warning" onClick={async () => { await api("/tutor/memory/reset", { method: "POST" }); setMemory({ ...memory, items: [] }); }}>Reset memory</Button>
          </Box>
          <TextField label="Private note" fullWidth margin="normal" multiline value={note} onChange={(event) => setNote(event.target.value)} />
          <Button onClick={() => saveNote().catch((err) => setMessage(err.message))}>Save note</Button>
        </Card>
      </Box>
      <Card sx={{ p: 2, mt: 2 }}>
        <Typography fontWeight={800}>Previous exam history</Typography>
        {(user?.examHistory || []).map((item, index) => <Typography key={index}>{item.examName} · {item.year} · {item.result}</Typography>)}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 120px 140px auto" }, gap: 1, mt: 1 }}>
          <TextField label="Exam" value={examName} onChange={(event) => setExamName(event.target.value)} />
          <TextField label="Year" value={year} onChange={(event) => setYear(event.target.value)} />
          <TextField label="Result" value={result} onChange={(event) => setResult(event.target.value)} />
          <Button variant="contained" onClick={() => addHistory().catch((err) => setMessage(err.message))}>Add</Button>
        </Box>
      </Card>
    </Box>
  );
}
