"use client";

import { useState } from "react";
import { Box, Button, Card, TextField, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Eyebrow, PageSkeleton, useData } from "@/components/Frame";

type Item = { id: string; title: string; body: string; status: string; channel: string };

export default function NotificationsPage() {
  const { data, error, loading, reload } = useData<Item[]>("/admin/notifications");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <Box>
      <Eyebrow>COMMUNICATION</Eyebrow>
      <Typography variant="h1">Notifications</Typography>
      {error && <Typography color="error">{error}</Typography>}
      <Card sx={{ p: 2, mb: 2 }}>
        <TextField fullWidth label="Title" margin="normal" value={title} onChange={(event) => setTitle(event.target.value)} />
        <TextField fullWidth label="Message" margin="normal" value={body} onChange={(event) => setBody(event.target.value)} />
        <Button variant="contained" onClick={async () => { await api("/admin/notifications", { method: "POST", body: JSON.stringify({ title, body, channel: "in_app", status: "delivered" }) }); setTitle(""); setBody(""); reload(); }}>Send in-app notice</Button>
      </Card>
      {loading ? <PageSkeleton rows={4} /> : (data || []).map((item) => <Card key={item.id} sx={{ p: 2, mb: 1 }}><Typography fontWeight={800}>{item.title} · {item.status}</Typography><Typography>{item.body}</Typography></Card>)}
    </Box>
  );
}
