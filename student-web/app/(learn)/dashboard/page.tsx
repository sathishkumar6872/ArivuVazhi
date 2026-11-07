"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Box, Button, Card, Typography } from "@mui/material";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import TimerRoundedIcon from "@mui/icons-material/TimerRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import { api } from "@/lib/api";
import { Ring } from "@/components/Shell";
import { PageSkeleton } from "@/components/PageSkeleton";
import { useAuth } from "@/lib/auth";

type Dashboard = {
  greetingName: string;
  exam: { id: string; name: string; authority: string } | null;
  streak: number;
  accuracy: number;
  tasks: Array<{ id: string; title: string; minutes: number; status: string }>;
  unreadNotifications: number;
};

type Analytics = { syllabusCompletion: number; studiedTopics: number; topicCount: number; subjects: Array<{ name: string; accuracy: number }> };

const actions = [
  { href: "/practice", label: "Practice", icon: <EditNoteRoundedIcon /> },
  { href: "/mocks", label: "Mock Tests", icon: <TimerRoundedIcon /> },
  { href: "/tutor", label: "AI Tutor", icon: <AutoAwesomeRoundedIcon /> },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([api<Dashboard>("/dashboard"), api<Analytics>("/analytics")])
      .then(([dash, stats]) => { setData(dash); setAnalytics(stats); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const progress = analytics?.syllabusCompletion || 0;

  if (loading) return <PageSkeleton variant="dashboard" />;

  return (
    <Box>
      <Typography sx={{ fontSize: 28, fontWeight: 800 }}>Hi {data?.greetingName || user?.firstName}!</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Let's continue your preparation{data?.exam ? ` · ${data.exam.name}` : ""}.</Typography>
      {error && <Typography color="error">{error}</Typography>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.4fr .8fr" }, gap: 2 }}>
        <Card sx={{ p: 0, overflow: "hidden", background: "linear-gradient(120deg, #3D6BFF 0%, #5B4DFF 55%, #7A4DFF 100%)", color: "white", border: 0 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 3, gap: 2 }}>
            <Box>
              <Typography sx={{ opacity: 0.85, fontWeight: 700 }}>Preparation progress</Typography>
              <Typography sx={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1 }}>{progress}%</Typography>
              <Typography sx={{ opacity: 0.9 }}>{analytics?.studiedTopics || 0} of {analytics?.topicCount || 0} topics touched · {data?.streak || 0} day streak</Typography>
              <Button component={Link} href="/practice" variant="contained" sx={{ mt: 2, bgcolor: "white", color: "#4C3AE0", background: "white" }}>Continue</Button>
            </Box>
            <Box sx={{ width: 140, height: 120, borderRadius: 4, bgcolor: "rgba(255,255,255,.16)", display: { xs: "none", sm: "grid" }, placeItems: "center", fontSize: 54 }}>🎯</Box>
          </Box>
        </Card>
        <Card sx={{ p: 2.5 }}>
          <Typography fontWeight={800} sx={{ mb: 1 }}>Today's plan</Typography>
          {(data?.tasks || []).map((task) => (
            <Box key={task.id} sx={{ display: "flex", justifyContent: "space-between", py: 1.1, borderBottom: "1px solid #F2F4F7" }}>
              <Typography>{task.status === "completed" ? "☑" : "☐"} {task.title}</Typography>
              <Typography color="text.secondary" fontSize={13}>{task.minutes} min</Typography>
            </Box>
          ))}
          {!data?.tasks?.length && <Typography color="text.secondary">No tasks yet.</Typography>}
          <Button component={Link} href="/planner" sx={{ mt: 1 }}>Open planner</Button>
        </Card>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 220px" }, gap: 2, mt: 2 }}>
        {actions.map((action) => (
          <Card key={action.href} component={Link} href={action.href} sx={{ p: 2.5, textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box sx={{ width: 44, height: 44, borderRadius: 2.5, bgcolor: "#F1EEFF", color: "#5B4DFF", display: "grid", placeItems: "center" }}>{action.icon}</Box>
            <Typography fontWeight={800}>{action.label}</Typography>
          </Card>
        ))}
        <Card sx={{ p: 2, display: "grid", placeItems: "center" }}>
          <Ring value={data?.accuracy || 0} />
          <Typography color="text.secondary" fontSize={13}>Practice accuracy</Typography>
        </Card>
      </Box>
      <Card sx={{ p: 2.5, mt: 2 }}>
        <Typography fontWeight={800} sx={{ mb: 1 }}>Focus areas</Typography>
        {(analytics?.subjects || []).map((subject) => (
          <Box key={subject.name} sx={{ display: "grid", gridTemplateColumns: "120px 1fr 48px", gap: 1, alignItems: "center", mb: 1 }}>
            <Typography fontSize={14}>{subject.name}</Typography>
            <Box sx={{ height: 8, bgcolor: "#EEF1F6", borderRadius: 99 }}><Box sx={{ width: `${subject.accuracy}%`, height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#5B4DFF,#7C5CFF)" }} /></Box>
            <Typography fontWeight={800} fontSize={13}>{subject.accuracy}%</Typography>
          </Box>
        ))}
        {!analytics?.subjects?.length && <Typography color="text.secondary">Practice a few questions to see subject accuracy.</Typography>}
      </Card>
    </Box>
  );
}
