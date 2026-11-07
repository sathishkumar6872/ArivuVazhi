"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Card, Chip, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { PageSkeleton } from "@/components/PageSkeleton";

type MockItem = {
  id: string;
  title: string;
  durationMinutes: number;
  questionCount: number;
  negativeMarks: number;
  instructions: string[];
  todayStatus: string;
  todayAttemptId: string;
  lastScore: { rawScore: number; maxScore: number } | null;
};

export default function MocksPage() {
  const router = useRouter();
  const [mocks, setMocks] = useState<MockItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<MockItem[]>("/mocks").then(setMocks).catch((err) => setError(err.message));
  }, []);

  async function start(mock: MockItem) {
    setError("");
    try {
      if (mock.todayStatus === "submitted" && mock.todayAttemptId) {
        router.push(`/mocks/${mock.todayAttemptId}/result`);
        return;
      }
      const attempt = await api<{ id: string }>(`/mocks/${mock.id}/start`, { method: "POST", body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) });
      router.push(`/mocks/${attempt.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start mock");
    }
  }

  return (
    <Box>
      <Typography sx={{ fontSize: 28, fontWeight: 800 }}>Mock Tests</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>One attempt per mock per day. The server owns the timer and the score.</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!mocks && !error ? <PageSkeleton rows={3} /> : null}
      {(mocks || []).map((mock) => (
        <Card key={mock.id} sx={{ p: 3, mb: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography sx={{ fontSize: 22, fontWeight: 800 }}>{mock.title}</Typography>
            <Chip label={mock.todayStatus === "available" ? "Available" : mock.todayStatus.replace("_", " ")} sx={{ bgcolor: "#ECFDF3", color: "#027A48", fontWeight: 800 }} />
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5, mb: 2 }}>
            {[
              ["Questions", mock.questionCount],
              ["Duration", `${mock.durationMinutes} min`],
              ["Negative", mock.negativeMarks],
              ["Last score", mock.lastScore ? `${mock.lastScore.rawScore}/${mock.lastScore.maxScore}` : "Not attempted"],
            ].map(([label, value]) => (
              <Box key={String(label)} sx={{ bgcolor: "#F8F9FC", borderRadius: 3, p: 1.5 }}>
                <Typography color="text.secondary" fontSize={12}>{label}</Typography>
                <Typography fontWeight={800}>{value}</Typography>
              </Box>
            ))}
          </Box>
          {mock.instructions.map((item) => <Typography key={item} color="text.secondary" fontSize={14}>• {item}</Typography>)}
          <Button sx={{ mt: 2 }} variant="contained" onClick={() => start(mock)}>{mock.todayStatus === "in_progress" ? "Resume attempt" : mock.todayStatus === "submitted" ? "Review result" : "Start Mock Test"}</Button>
        </Card>
      ))}
      {mocks && !mocks.length && !error && <Typography color="text.secondary">No published mock is available yet.</Typography>}
    </Box>
  );
}
