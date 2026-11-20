"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Box, Button, Card, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import { PageSkeleton, useData } from "@/components/Frame";
import { api } from "@/lib/api";

type Overview = {
  students: number;
  awaitingApproval: number;
  openTickets: number;
  flaggedQuestions: number;
  mocksToday: { ready: number; generating: number; failed: number };
  aiStatus: { provider: string; lastError: string; lastErrorAt?: string | null };
  currentAffairs?: {
    newsDay: string;
    published: number;
    dropped: number;
    hidden: number;
    running: boolean;
    lastRun: { newsDay: string; status: string; error: string } | null;
    archive?: { monthsDone: number; monthsTotal: number; running: boolean };
  };
};

const PROVIDER_LABEL: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  openai: "OpenAI",
  ollama: "Ollama",
  local: "Off",
};

/** Today: one screen that says whether anything needs the admin's attention. */
export default function OverviewPage() {
  const { data, error, loading, reload } = useData<Overview>("/admin/overview");
  const [retrying, setRetrying] = useState(false);
  const [runningCa, setRunningCa] = useState(false);
  const [message, setMessage] = useState("");

  async function retryMocks() {
    setRetrying(true);
    setMessage("");
    try {
      const result = await api<{ started: boolean; reason?: string }>("/admin/jobs/daily-mocks", { method: "POST", body: "{}" });
      setMessage(result.started ? "Retry started. Failed mocks are being prepared again." : "A mock run is already in progress.");
      setTimeout(reload, 3000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not start the retry");
    } finally {
      setRetrying(false);
    }
  }

  async function runCurrentAffairs() {
    setRunningCa(true);
    setMessage("");
    try {
      const result = await api<{ started: boolean; reason?: string }>("/admin/jobs/current-affairs", { method: "POST", body: "{}" });
      setMessage(
        result.started
          ? "Started: yesterday's news (if missing) and the next archive months. This takes a while; refresh later."
          : "A current affairs run is already in progress.",
      );
      setTimeout(reload, 3000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not start current affairs");
    } finally {
      setRunningCa(false);
    }
  }

  if (loading && !data) return <PageSkeleton variant="dashboard" />;

  const mocks = data?.mocksToday || { ready: 0, generating: 0, failed: 0 };
  const ai = data?.aiStatus || { provider: "local", lastError: "" };
  const aiOn = ai.provider !== "local";
  const aiOk = aiOn && !ai.lastError;
  const pending = [
    { label: "Approvals", count: data?.awaitingApproval || 0, href: "/approvals" },
    { label: "Flagged questions", count: data?.flaggedQuestions || 0, href: "/questions" },
    { label: "Support tickets", count: data?.openTickets || 0, href: "/support" },
  ];
  const pendingTotal = pending.reduce((sum, item) => sum + item.count, 0);
  const ca = data?.currentAffairs;
  const caOk = Boolean(ca && ca.published > 0);
  const caFailed = ca?.lastRun?.status === "failed";
  const allGood = mocks.failed === 0 && aiOk && pendingTotal === 0 && caOk;

  return (
    <Box sx={{ maxWidth: 960 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography color="text.secondary">
          {data ? `${data.students} students` : ""}
        </Typography>
        <Button size="small" onClick={reload}>Refresh</Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {message && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setMessage("")}>{message}</Alert>}
      {data && (
        <Alert severity={allGood ? "success" : "warning"} sx={{ mb: 2, fontWeight: 600 }}>
          {allGood ? "Everything looks fine today." : "Some things need your attention below."}
        </Alert>
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 2 }}>
        {/* 1. Daily mocks */}
        <Card sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography fontWeight={800}>Daily mocks</Typography>
            <StatusChip ok={mocks.failed === 0} okLabel="OK" badLabel={`${mocks.failed} failed`} />
          </Stack>
          <Count label="Ready" value={mocks.ready} />
          <Count label="Preparing" value={mocks.generating} />
          <Count label="Failed" value={mocks.failed} bad={mocks.failed > 0} />
          <Box sx={{ flex: 1 }} />
          <Button
            variant="contained"
            disabled={retrying || mocks.failed === 0}
            onClick={retryMocks}
            startIcon={retrying ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {retrying ? "Starting…" : "Retry failed"}
          </Button>
        </Card>

        {/* 2. AI */}
        <Card sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography fontWeight={800}>AI tutor</Typography>
            <StatusChip ok={aiOk} okLabel="Working" badLabel={aiOn ? "Error" : "Off"} />
          </Stack>
          <Count label="Provider" value={PROVIDER_LABEL[ai.provider] || ai.provider} />
          {ai.lastError ? (
            <Typography fontSize={13} color="error.main" sx={{ wordBreak: "break-word" }}>
              {ai.lastError}
            </Typography>
          ) : (
            <Typography fontSize={13} color="text.secondary">
              {aiOn ? "No errors." : "Students get saved-notes answers only."}
            </Typography>
          )}
          <Box sx={{ flex: 1 }} />
          <Button variant="outlined" component={Link} href="/ai">Open AI settings</Button>
        </Card>

        {/* 3. Current affairs */}
        <Card sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography fontWeight={800}>Current affairs</Typography>
            <StatusChip
              ok={caOk}
              okLabel="Published"
              badLabel={ca?.running ? "Running" : caFailed ? "Failed" : "Not yet"}
            />
          </Stack>
          <Count label="News day" value={ca?.newsDay || "—"} />
          <Count label="Published to students" value={ca?.published || 0} />
          <Count label="Dropped by checks" value={ca?.dropped || 0} />
          {ca?.hidden ? <Count label="Hidden by student reports" value={ca.hidden} bad /> : null}
          {ca?.archive ? (
            <Count
              label={`Archive (last ${ca.archive.monthsTotal} months)${ca.archive.running ? " · running" : ""}`}
              value={`${ca.archive.monthsDone}/${ca.archive.monthsTotal}`}
            />
          ) : null}
          {caFailed && ca?.lastRun?.error ? (
            <Typography fontSize={13} color="error.main" sx={{ wordBreak: "break-word" }}>{ca.lastRun.error}</Typography>
          ) : (
            <Typography fontSize={13} color="text.secondary">Runs at 3:00 AM for yesterday&apos;s news, then 2 archive months. Only fully verified items are published.</Typography>
          )}
          <Box sx={{ flex: 1 }} />
          <Button
            variant="outlined"
            disabled={runningCa || Boolean(ca?.running) || Boolean(ca?.archive?.running) || (caOk && ca?.archive?.monthsDone === ca?.archive?.monthsTotal)}
            onClick={runCurrentAffairs}
            startIcon={runningCa ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {ca?.running ? "Running…" : "Run now"}
          </Button>
        </Card>

        {/* 4. Pending */}
        <Card sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
            <Typography fontWeight={800}>Pending</Typography>
            <StatusChip ok={pendingTotal === 0} okLabel="All clear" badLabel={`${pendingTotal} open`} />
          </Stack>
          {pending.map((item) => (
            <Button
              key={item.href}
              component={Link}
              href={item.href}
              color="inherit"
              sx={{ justifyContent: "space-between", textTransform: "none", px: 1.5, py: 1, borderRadius: 2, bgcolor: item.count ? "#FFF7ED" : "#F6F8F7" }}
            >
              <span>{item.label}</span>
              <Typography component="span" fontWeight={800} color={item.count ? "warning.dark" : "text.secondary"}>
                {item.count}
              </Typography>
            </Button>
          ))}
        </Card>
      </Box>
    </Box>
  );
}

function Count({ label, value, bad }: { label: string; value: number | string; bad?: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between">
      <Typography color="text.secondary" fontSize={14}>{label}</Typography>
      <Typography fontWeight={800} color={bad ? "error.main" : "text.primary"}>{value}</Typography>
    </Stack>
  );
}

function StatusChip({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <Chip
      size="small"
      label={ok ? okLabel : badLabel}
      sx={{ fontWeight: 800, bgcolor: ok ? "#ECFDF3" : "#FEF3F2", color: ok ? "#027A48" : "#B42318" }}
    />
  );
}
