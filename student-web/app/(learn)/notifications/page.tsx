"use client";

import { useEffect, useState } from "react";
import { Box, Button, Card, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Eyebrow } from "@/components/Shell";
import { PageSkeleton } from "@/components/PageSkeleton";

type Item = { id: string; title: string; body: string; read: boolean };

export default function NotificationsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  async function load() { setItems(await api<Item[]>("/notifications")); }
  useEffect(() => { load().catch(() => setItems([])); }, []);
  return (
    <Box>
      <Eyebrow>UPDATES</Eyebrow>
      <Typography variant="h1">Notifications</Typography>
      {!items ? <PageSkeleton rows={4} /> : items.map((item) => (
        <Card key={item.id} sx={{ p: 2, mb: 1 }}>
          <Typography fontWeight={800}>{item.title}</Typography>
          <Typography color="text.secondary">{item.body}</Typography>
          {!item.read && <Button size="small" onClick={async () => { await api(`/notifications/${item.id}/read`, { method: "POST" }); await load(); }}>Mark read</Button>}
        </Card>
      ))}
    </Box>
  );
}
