"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Eyebrow } from "@/components/Shell";
import { PageSkeleton } from "@/components/PageSkeleton";

type Item = { id: string; title: string; body: string; read: boolean };

export default function NotificationsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  async function load() { setItems(await api<Item[]>("/notifications")); }
  useEffect(() => {
    load().catch((err) => { setError(err instanceof Error ? err.message : "Could not load notifications"); setItems([]); });
  }, []);
  async function markRead(id: string) {
    setError("");
    try {
      await api(`/notifications/${id}/read`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    }
  }
  return (
    <Box>
      <Eyebrow>UPDATES</Eyebrow>
      <Typography variant="h1">Notifications</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {items && !items.length && !error && <Typography color="text.secondary">No notifications yet</Typography>}
      {!items ? <PageSkeleton rows={4} /> : items.map((item) => (
        <Card key={item.id} sx={{ p: 2, mb: 1 }}>
          <Typography fontWeight={800}>{item.title}</Typography>
          <Typography color="text.secondary">{item.body}</Typography>
          {!item.read && <Button size="small" onClick={() => markRead(item.id)}>Mark read</Button>}
        </Card>
      ))}
    </Box>
  );
}
