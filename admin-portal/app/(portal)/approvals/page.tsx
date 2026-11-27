"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, Chip, LinearProgress, Pagination, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Eyebrow, PageSkeleton, useData } from "@/components/Frame";

type ApprovalItem = {
  type: "question" | "subject" | "topic" | "source" | "pyq";
  id: string;
  title: string;
  status: string;
  source?: string;
  note?: string;
  rightsStatus?: string;
};

type AutoReview = {
  running: boolean;
  total: number;
  done: number;
  passed: number;
  failed: number;
  finishedAt: string;
  error: string;
  waiting: number;
};

type ApprovalPage = {
  items: ApprovalItem[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  autoReview: AutoReview;
};

const PAGE_SIZE = 20;

export default function ApprovalsPage() {
  const [page, setPage] = useState(1);
  const queue = useData<ApprovalPage>(`/admin/approvals?page=${page}&limit=${PAGE_SIZE}`);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const auto = queue.data?.autoReview;

  // While the AI is reviewing, refresh every few seconds to show progress.
  useEffect(() => {
    if (!auto?.running) return;
    const timer = setInterval(queue.reload, 4000);
    return () => clearInterval(timer);
  }, [auto?.running]);

  async function decide(item: ApprovalItem, decision: "approve" | "reject") {
    setBusyId(`${item.type}:${item.id}:${decision}`);
    setError("");
    setMessage("");
    try {
      await api(`/admin/approvals/${item.type}/${item.id}`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      setMessage(`${decision === "approve" ? "Approved" : "Rejected"} ${item.type}`);
      queue.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decision failed");
    } finally {
      setBusyId("");
    }
  }

  async function runAutoReview() {
    setBusyId("auto");
    setError("");
    setMessage("");
    try {
      const status = await api<AutoReview>("/admin/approvals/auto-review", { method: "POST" });
      setMessage(status.total ? `Auto review started for ${status.total} questions.` : "Nothing waiting for auto review.");
      queue.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto review failed to start");
    } finally {
      setBusyId("");
    }
  }

  const data = queue.data;
  const items = data?.items || [];

  return (
    <Box>
      <Eyebrow>GOVERNANCE</Eyebrow>
      <Typography variant="h1">Approvals</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Review under_review questions (including student AI practice), topics, knowledge sources, and PYQ papers before they enter the published bank.
      </Typography>

      {auto && (
        <Card sx={{ p: 2, mb: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 240 }}>
              <Typography fontWeight={700}>Auto review</Typography>
              <Typography color="text.secondary" fontSize={14}>
                AI checks each waiting question's answer and wording. Passed questions are published; failed ones stay here with the AI&apos;s
                reason. Duplicates, unreadable scans and figure questions always stay for you.
              </Typography>
              <Typography fontSize={14} sx={{ mt: 0.5 }}>
                <b>{auto.waiting}</b> questions ready for auto review · up to 200 per run
              </Typography>
            </Box>
            <Button variant="contained" disabled={auto.running || !auto.waiting || Boolean(busyId)} onClick={runAutoReview}>
              {auto.running ? "Reviewing…" : busyId === "auto" ? "Starting…" : "Auto review"}
            </Button>
          </Box>
          {(auto.running || auto.finishedAt) && auto.total > 0 && (
            <Box sx={{ mt: 1.5 }}>
              <LinearProgress variant="determinate" value={(auto.done / auto.total) * 100} sx={{ height: 8, borderRadius: 4 }} />
              <Typography color="text.secondary" fontSize={13} sx={{ mt: 0.75 }}>
                {auto.running ? "Running" : "Last run"}: {auto.done} of {auto.total} checked · {auto.passed} published · {auto.failed} need you
              </Typography>
            </Box>
          )}
          {auto.error && <Alert severity="error" sx={{ mt: 1.5 }}>{auto.error}</Alert>}
        </Card>
      )}

      {(queue.error || error) && <Alert severity="error" sx={{ mb: 2 }}>{queue.error || error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
      {data && (
        <Typography color="text.secondary" fontSize={14} sx={{ mb: 1 }}>
          {data.total} waiting · page {data.page} of {data.pages}
        </Typography>
      )}
      {queue.loading && !data ? <PageSkeleton rows={5} /> : null}
      {items.map((item) => (
        <Card key={`${item.type}-${item.id}`} sx={{ p: 2, mb: 1.5 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 220 }}>
              <Box sx={{ display: "flex", gap: 1, mb: 0.75, flexWrap: "wrap" }}>
                <Chip size="small" label={item.type} color="primary" variant="outlined" />
                <Chip size="small" label={item.status} />
                {item.source ? <Chip size="small" label={item.source.replace(/_/g, " ")} variant="outlined" /> : null}
                {item.rightsStatus ? <Chip size="small" label={`rights: ${item.rightsStatus}`} /> : null}
              </Box>
              <Typography fontWeight={700}>{item.title}</Typography>
              {item.note ? (
                <Typography color="warning.main" fontSize={13} sx={{ mt: 0.5 }}>
                  {item.note}
                </Typography>
              ) : null}
              <Typography color="text.secondary" fontSize={12} sx={{ mt: 0.5 }}>{item.id}</Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                size="small"
                variant="contained"
                disabled={Boolean(busyId)}
                onClick={() => decide(item, "approve")}
              >
                {busyId === `${item.type}:${item.id}:approve` ? "…" : "Approve"}
              </Button>
              <Button
                size="small"
                color="error"
                variant="outlined"
                disabled={Boolean(busyId)}
                onClick={() => decide(item, "reject")}
              >
                {busyId === `${item.type}:${item.id}:reject` ? "…" : "Reject"}
              </Button>
            </Box>
          </Box>
        </Card>
      ))}
      {data && data.pages > 1 && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
          <Pagination
            count={data.pages}
            page={Math.min(page, data.pages)}
            onChange={(_, value) => {
              setPage(value);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Box>
      )}
      {!queue.loading && data && !data.total && (
        <Typography color="text.secondary">Queue empty — nothing waiting for review.</Typography>
      )}
    </Box>
  );
}
