"use client";

import { useState } from "react";
import { Alert, Box, Button, Card, Chip, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Eyebrow, PageSkeleton, useData } from "@/components/Frame";

type ApprovalItem = {
  type: "question" | "topic" | "source" | "pyq";
  id: string;
  title: string;
  status: string;
  rightsStatus?: string;
};

export default function ApprovalsPage() {
  const queue = useData<ApprovalItem[]>("/admin/approvals");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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

  return (
    <Box>
      <Eyebrow>GOVERNANCE</Eyebrow>
      <Typography variant="h1">Approvals</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Review under_review questions (including student AI practice), topics, knowledge sources, and PYQ papers before they enter the published bank.
      </Typography>
      {(queue.error || error) && <Alert severity="error" sx={{ mb: 2 }}>{queue.error || error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
      {queue.loading ? <PageSkeleton rows={5} /> : null}
      {!queue.loading && (queue.data || []).map((item) => (
        <Card key={`${item.type}-${item.id}`} sx={{ p: 2, mb: 1.5 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 220 }}>
              <Box sx={{ display: "flex", gap: 1, mb: 0.75, flexWrap: "wrap" }}>
                <Chip size="small" label={item.type} color="primary" variant="outlined" />
                <Chip size="small" label={item.status} />
                {item.rightsStatus ? <Chip size="small" label={`rights: ${item.rightsStatus}`} /> : null}
              </Box>
              <Typography fontWeight={700}>{item.title}</Typography>
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
      {!queue.loading && queue.data && !queue.data.length && (
        <Typography color="text.secondary">Queue empty — nothing waiting for review.</Typography>
      )}
    </Box>
  );
}
