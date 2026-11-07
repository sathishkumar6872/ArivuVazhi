"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Card, MenuItem, TextField, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Exam = { id: string; name: string; authority: string };

export default function OnboardingPage() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [language, setLanguage] = useState<"ta" | "en">("ta");
  const [examId, setExamId] = useState("");
  const [level, setLevel] = useState("");
  const [institution, setInstitution] = useState("");
  const [year, setYear] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (user?.onboardingComplete) router.replace("/dashboard");
  }, [loading, user, router]);

  useEffect(() => {
    api<Exam[]>("/exams").then((items) => {
      setExams(items);
      if (items[0]) setExamId(items[0].id);
    }).catch((err) => setError(err.message));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/onboarding", {
        method: "POST",
        body: JSON.stringify({
          language,
          examId,
          education: level ? [{ level, institution, year }] : [],
        }),
      });
      await refreshUser();
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save onboarding");
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3 }}>
      <Card sx={{ p: 4, width: "100%", maxWidth: 560 }}>
        <Typography sx={{ color: "primary.main", fontSize: 11, fontWeight: 800, letterSpacing: 1.4 }}>GET STARTED</Typography>
        <Typography variant="h1">Choose your exam</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>We will build today's plan around this goal. You can add another exam later.</Typography>
        <Box component="form" onSubmit={submit}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField select label="Language" fullWidth margin="normal" value={language} onChange={(event) => setLanguage(event.target.value as "ta" | "en")}>
            <MenuItem value="ta">Tamil</MenuItem>
            <MenuItem value="en">English</MenuItem>
          </TextField>
          <TextField select label="Primary examination" fullWidth margin="normal" value={examId} onChange={(event) => setExamId(event.target.value)} required>
            {exams.map((exam) => <MenuItem key={exam.id} value={exam.id}>{exam.name} · {exam.authority}</MenuItem>)}
          </TextField>
          <TextField label="Education level" fullWidth margin="normal" value={level} onChange={(event) => setLevel(event.target.value)} />
          <TextField label="Institution" fullWidth margin="normal" value={institution} onChange={(event) => setInstitution(event.target.value)} />
          <TextField label="Year" fullWidth margin="normal" value={year} onChange={(event) => setYear(event.target.value)} />
          <Button type="submit" variant="contained" sx={{ mt: 2 }}>Open my dashboard</Button>
        </Box>
      </Card>
    </Box>
  );
}
