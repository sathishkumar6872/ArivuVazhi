"use client";

import { useState } from "react";
import { Alert, Box, Button, Card, Chip, MenuItem, TextField, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Eyebrow, PageSkeleton, useData } from "@/components/Frame";

type Ticket = {
  id: string;
  subject: string;
  body: string;
  status: string;
  studentName: string;
  category?: string;
  replies: Array<{ body: string; authorRole: string }>;
};

type Feedback = {
  id: string;
  category: string;
  message: string;
  rating?: number | null;
  status: string;
  studentName: string;
  appVersion?: string;
  createdAt?: string;
};

export default function SupportPage() {
  const tickets = useData<Ticket[]>("/admin/support/tickets");
  const feedback = useData<Feedback[]>("/admin/feedback");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");

  return (
    <Box>
      <Eyebrow>PRODUCT SIGNAL</Eyebrow>
      <Typography variant="h1">Feedback</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        App update / new feature / bug feedback student mobile-la irundhu varum. Support tickets keezha.
      </Typography>
      {(tickets.error || feedback.error || error) && (
        <Alert severity="error" sx={{ mb: 2 }}>{tickets.error || feedback.error || error}</Alert>
      )}
      {(tickets.loading || feedback.loading) ? <PageSkeleton rows={5} /> : null}

      {!feedback.loading && <Typography fontWeight={800} sx={{ mb: 1 }}>App feedback</Typography>}
      {!feedback.loading && (feedback.data || []).map((item) => (
        <Card key={item.id} sx={{ p: 2, mb: 1 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mb: 0.5 }}>
            <Typography fontWeight={800}>
              {item.category}{item.rating ? ` · ${item.rating}/5` : ""} · {item.studentName}
            </Typography>
            <TextField
              select
              size="small"
              value={item.status}
              onChange={async (event) => {
                try {
                  await api(`/admin/feedback/${item.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: event.target.value }),
                  });
                  feedback.reload();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Update fail");
                }
              }}
            >
              {["new", "reviewed", "planned", "done"].map((status) => (
                <MenuItem key={status} value={status}>{status}</MenuItem>
              ))}
            </TextField>
          </Box>
          <Typography>{item.message}</Typography>
          {item.appVersion ? <Typography color="text.secondary" fontSize={12}>v{item.appVersion}</Typography> : null}
        </Card>
      ))}
      {!feedback.loading && feedback.data && !feedback.data.length && (
        <Typography color="text.secondary" sx={{ mb: 2 }}>Feedback illa.</Typography>
      )}

      {!tickets.loading && <Typography fontWeight={800} sx={{ mt: 3, mb: 1 }}>Support tickets</Typography>}
      {!tickets.loading && (tickets.data || []).map((ticket) => (
        <Card key={ticket.id} sx={{ p: 2, mb: 1 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 0.5 }}>
            <Typography fontWeight={800}>{ticket.subject}</Typography>
            <Chip size="small" label={ticket.status} />
            {ticket.category ? <Chip size="small" label={ticket.category} /> : null}
          </Box>
          <Typography color="text.secondary">{ticket.studentName}</Typography>
          <Typography>{ticket.body}</Typography>
          {ticket.replies.map((item, index) => (
            <Typography key={index} fontSize={13}>{item.authorRole}: {item.body}</Typography>
          ))}
          <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
            <TextField size="small" fullWidth value={reply} onChange={(event) => setReply(event.target.value)} />
            <Button
              onClick={async () => {
                try {
                  await api(`/admin/support/tickets/${ticket.id}/reply`, {
                    method: "POST",
                    body: JSON.stringify({ body: reply, status: "resolved" }),
                  });
                  setReply("");
                  tickets.reload();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Reply fail");
                }
              }}
            >
              Reply
            </Button>
          </Box>
        </Card>
      ))}
    </Box>
  );
}
