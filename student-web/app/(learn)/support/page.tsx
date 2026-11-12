"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, TextField, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Eyebrow } from "@/components/Shell";
import { PageSkeleton } from "@/components/PageSkeleton";

type Ticket = { id: string; subject: string; body: string; status: string; replies: Array<{ body: string; authorRole: string }> };

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function load() {
    setTickets(await api<Ticket[]>("/support/tickets"));
  }
  useEffect(() => {
    load().catch((err) => { setError(err instanceof Error ? err.message : "Could not load tickets"); setTickets([]); });
  }, []);

  async function run(action: () => Promise<void>) {
    setError("");
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); }
  }

  return (
    <Box>
      <Eyebrow>HELP</Eyebrow>
      <Typography variant="h1">Support</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Card sx={{ p: 2, mb: 2 }}>
        <TextField fullWidth label="Subject" margin="normal" value={subject} onChange={(event) => setSubject(event.target.value)} />
        <TextField fullWidth label="How can we help?" multiline margin="normal" value={body} onChange={(event) => setBody(event.target.value)} />
        <Button variant="contained" onClick={() => run(async () => { await api("/support/tickets", { method: "POST", body: JSON.stringify({ subject, body }) }); setSubject(""); setBody(""); await load(); })}>Create ticket</Button>
      </Card>
      {tickets && !tickets.length && !error && <Typography color="text.secondary">No tickets yet</Typography>}
      {!tickets ? <PageSkeleton rows={3} /> : tickets.map((ticket) => (
        <Card key={ticket.id} sx={{ p: 2, mb: 2 }}>
          <Typography fontWeight={800}>{ticket.subject} · {ticket.status}</Typography>
          <Typography>{ticket.body}</Typography>
          {ticket.replies.map((item, index) => <Typography key={index} color="text.secondary">{item.authorRole}: {item.body}</Typography>)}
          <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
            <TextField size="small" fullWidth value={replies[ticket.id] || ""} onChange={(event) => setReplies((current) => ({ ...current, [ticket.id]: event.target.value }))} placeholder="Reply" inputProps={{ "aria-label": `Reply to ${ticket.subject}` }} />
            <Button disabled={!replies[ticket.id]?.trim()} onClick={() => run(async () => { await api(`/support/tickets/${ticket.id}/reply`, { method: "POST", body: JSON.stringify({ body: replies[ticket.id] }) }); setReplies((current) => ({ ...current, [ticket.id]: "" })); await load(); })}>Send</Button>
          </Box>
        </Card>
      ))}
    </Box>
  );
}
