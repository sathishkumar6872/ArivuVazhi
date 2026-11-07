"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, MenuItem, TextField, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AuthShowcase } from "@/components/AuthShowcase";

type Exam = { id: string; name: string; authority: string };

export default function RegisterPage() {
  const { register, refreshUser } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Exam[]>("/auth/catalogue").then((items) => {
      setExams(items);
      if (items[0]) setExamId(items[0].id);
    }).catch(() => undefined);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await register(form);
      if (examId) {
        await api("/onboarding", { method: "POST", body: JSON.stringify({ language: "en", examId }) });
        await refreshUser();
        router.push("/dashboard");
      } else {
        router.push("/onboarding");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShowcase title="Start your government exam preparation journey" subtitle="Create a free account, pick a primary exam, and get a plan for today.">
      <Box sx={{ width: "100%", maxWidth: 460 }}>
        <Typography sx={{ fontSize: 32, fontWeight: 800 }}>Create Account</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>Release 1 is free. Your profile stays private.</Typography>
        <Box component="form" onSubmit={submit}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            <TextField label="First name" required value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
            <TextField label="Last name" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
          </Box>
          <TextField label="Email" type="email" fullWidth margin="normal" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <TextField label="Password" type="password" fullWidth margin="normal" required helperText="At least 8 characters, with a letter and a number" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          <TextField select label="Primary exam" fullWidth margin="normal" value={examId} onChange={(event) => setExamId(event.target.value)}>
            {exams.map((exam) => <MenuItem key={exam.id} value={exam.id}>{exam.name}</MenuItem>)}
          </TextField>
          <Button type="submit" variant="contained" fullWidth size="large" sx={{ mt: 1, py: 1.3 }} disabled={busy}>Create Account</Button>
        </Box>
        <Typography sx={{ mt: 3 }} color="text.secondary">Already have an account? <Link href="/login">Login</Link></Typography>
      </Box>
    </AuthShowcase>
  );
}
