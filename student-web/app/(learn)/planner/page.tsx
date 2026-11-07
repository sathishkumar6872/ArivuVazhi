"use client";

import { useEffect, useState } from "react";
import { Box, Button, Card, Chip, TextField, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Eyebrow } from "@/components/Shell";
import { PageSkeleton } from "@/components/PageSkeleton";

type Task = { id: string; title: string; status: string; minutes: number };

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default function PlannerPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setTasks(await api<Task[]>(`/planner?date=${today()}`));
  }

  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  async function add() {
    await api("/planner", { method: "POST", body: JSON.stringify({ title, dueDate: today(), minutes: 30 }) });
    setTitle("");
    await load();
  }

  async function toggle(task: Task) {
    await api(`/planner/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: task.status === "completed" ? "pending" : "completed" }) });
    await load();
  }

  return (
    <Box>
      <Eyebrow>BUILD A CONSISTENT ROUTINE</Eyebrow>
      <Typography variant="h1">Study Planner</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Your plan belongs to you. Incomplete tasks carry forward when that preference is on.</Typography>
      {error && <Typography color="error">{error}</Typography>}
      {!tasks && !error ? <PageSkeleton rows={4} /> : (
      <Card sx={{ p: 2 }}>
        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
          <TextField fullWidth placeholder="Add a task" value={title} onChange={(event) => setTitle(event.target.value)} />
          <Button variant="contained" disabled={title.trim().length < 2} onClick={() => add().catch((err) => setError(err.message))}>Add task</Button>
        </Box>
        {(tasks || []).map((task) => (
          <Box key={task.id} sx={{ display: "flex", justifyContent: "space-between", py: 1.2, borderBottom: "1px solid #e6eaf0" }}>
            <Typography>{task.status === "completed" ? "☑" : "○"} {task.title}</Typography>
            <Box>
              <Chip size="small" label={task.status} color={task.status === "completed" ? "success" : "default"} />
              <Button size="small" onClick={() => toggle(task)}>Toggle</Button>
            </Box>
          </Box>
        ))}
      </Card>
      )}
    </Box>
  );
}
