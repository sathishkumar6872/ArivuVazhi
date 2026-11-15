"use client";

import { Alert, Box, Card, LinearProgress, Typography } from "@mui/material";
import { Eyebrow, PageSkeleton, useData } from "@/components/Frame";

type Storage = { usedMb: number; dataMb: number; indexMb: number; limitMb: number; percent: number; warning: string };
type Pool = { examId: string; exam: string; auto?: number; approved?: number; under_review?: number; flagged?: number; rejected?: number };
type Ops = { activeStudents: number; practiceSessions: number; completedPractice: number; aiSpendInr: number; aiRequests: number; budgetInr: number; database: string; hostingNote: string; storage?: Storage; questionPool?: Pool[] };
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
      {ops.data?.storage ? (
        <Card sx={{ p: 2, mt: 2 }}>
          <Typography fontWeight={800}>Database storage</Typography>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            {ops.data.storage.usedMb} MB of {ops.data.storage.limitMb} MB ({ops.data.storage.percent}%) · data {ops.data.storage.dataMb} MB · indexes {ops.data.storage.indexMb} MB
          </Typography>
          <LinearProgress variant="determinate" value={Math.min(100, ops.data.storage.percent)} color={ops.data.storage.percent >= 80 ? "error" : "primary"} sx={{ height: 8, borderRadius: 4 }} />
          {ops.data.storage.warning ? <Alert severity="warning" sx={{ mt: 1.5 }}>{ops.data.storage.warning}</Alert> : null}
          <Typography color="text.secondary" fontSize={13} sx={{ mt: 1 }}>Untaken daily mocks, empty abandoned practice sets and unused rejected questions are removed after 7 days.</Typography>
        </Card>
      ) : null}
      {ops.data?.questionPool?.length ? (
        <Card sx={{ p: 2, mt: 2 }}>
          <Typography fontWeight={800} sx={{ mb: 1 }}>Question pool per exam</Typography>
          {ops.data.questionPool.map((pool) => (
            <Typography key={pool.examId} fontSize={14}>
              {pool.exam}: {(pool.auto || 0) + (pool.approved || 0)} published ({pool.auto || 0} AI-checked, {pool.approved || 0} admin) · {pool.under_review || 0} under review · {pool.flagged || 0} flagged
            </Typography>
          ))}
        </Card>
      ) : null}
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
