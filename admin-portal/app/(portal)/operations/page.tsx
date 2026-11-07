"use client";

import { Box, Card, Typography } from "@mui/material";
import { Eyebrow, PageSkeleton, useData } from "@/components/Frame";

type Ops = { activeStudents: number; practiceSessions: number; completedPractice: number; aiSpendInr: number; aiRequests: number; budgetInr: number; database: string; hostingNote: string };
type Audit = { id: string; action: string; entity: string; createdAt: string };

export default function OperationsPage() {
  const ops = useData<Ops>("/admin/operations");
  const audit = useData<Audit[]>("/admin/audit");
  const loading = ops.loading || audit.loading;
  return (
    <Box>
      <Eyebrow>PLATFORM OPERATIONS</Eyebrow>
      <Typography variant="h1">Operations & Costs</Typography>
      {loading ? <PageSkeleton variant="dashboard" /> : (
      <>
      <Box sx={{ display: "grid", gridTemplateColumns: { md: "repeat(4, 1fr)" }, gap: 2 }}>
        <Card sx={{ p: 2 }}>Active students<Typography sx={{ fontSize: 28, fontWeight: 800 }}>{ops.data?.activeStudents ?? "—"}</Typography></Card>
        <Card sx={{ p: 2 }}>Practice sessions<Typography sx={{ fontSize: 28, fontWeight: 800 }}>{ops.data?.practiceSessions ?? "—"}</Typography></Card>
        <Card sx={{ p: 2 }}>AI requests<Typography sx={{ fontSize: 28, fontWeight: 800 }}>{ops.data?.aiRequests ?? 0}</Typography></Card>
        <Card sx={{ p: 2 }}>AI spend<Typography sx={{ fontSize: 28, fontWeight: 800 }}>₹{ops.data?.aiSpendInr ?? 0}</Typography><Typography color="text.secondary">Budget ₹{ops.data?.budgetInr}</Typography></Card>
      </Box>
      <Card sx={{ p: 2, mt: 2 }}><Typography>{ops.data?.database}. {ops.data?.hostingNote}</Typography></Card>
      <Card sx={{ p: 2, mt: 2 }}>
        <Typography fontWeight={800}>Audit trail</Typography>
        {(audit.data || []).map((item) => <Typography key={item.id}>{item.action} · {item.entity}</Typography>)}
      </Card>
      </>
      )}
    </Box>
  );
}
