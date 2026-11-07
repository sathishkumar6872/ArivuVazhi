"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Card, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Ring } from "@/components/Shell";
import { PageSkeleton } from "@/components/PageSkeleton";

type Analytics = {
  accuracy: number;
  attempted: number;
  streak: number;
  readiness: string;
  caveat: string;
  subjects: Array<{ name: string; accuracy: number; attempted: number }>;
};

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<Analytics>("/analytics").then(setData).catch((err) => setError(err.message)); }, []);
  if (!data && !error) return <PageSkeleton variant="dashboard" />;
  return (
    <Box>
      <Typography sx={{ fontSize: 28, fontWeight: 800 }}>Analytics</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Progress, weak areas, and a readiness estimate. It is not a pass guarantee.</Typography>
      {error && <Typography color="error">{error}</Typography>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "280px 1fr" }, gap: 2 }}>
        <Card sx={{ p: 3, display: "grid", justifyItems: "center" }}>
          <Ring value={data?.accuracy || 0} />
          <Typography fontWeight={800} sx={{ mt: 1 }}>{data?.readiness || "Building"}</Typography>
          <Typography color="text.secondary">{data?.attempted || 0} attempted · {data?.streak || 0} day streak</Typography>
        </Card>
        <Card sx={{ p: 3 }}>
          <Typography fontWeight={800} sx={{ mb: 1 }}>Subject accuracy</Typography>
          {(data?.subjects || []).map((subject) => (
            <Box key={subject.name} sx={{ display: "grid", gridTemplateColumns: "140px 1fr 48px", gap: 1, alignItems: "center", mb: 1.2 }}>
              <Typography fontSize={14}>{subject.name}</Typography>
              <Box sx={{ height: 8, bgcolor: "#EEF1F6", borderRadius: 99 }}><Box sx={{ width: `${subject.accuracy}%`, height: "100%", borderRadius: 99, bgcolor: "#5B4DFF" }} /></Box>
              <b>{subject.accuracy}%</b>
            </Box>
          ))}
        </Card>
      </Box>
      <Alert severity="info" sx={{ mt: 2 }}>{data?.caveat}</Alert>
    </Box>
  );
}
