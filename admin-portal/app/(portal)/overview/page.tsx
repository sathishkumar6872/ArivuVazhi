"use client";

import { Box, Card, Typography } from "@mui/material";
import { PageSkeleton, useData } from "@/components/Frame";

type Overview = { students: number; publishedQuestions: number; awaitingApproval: number; openTickets: number; ai: { requests?: number; inr?: number } };

export default function OverviewPage() {
  const { data, error, loading } = useData<Overview>("/admin/overview");
  const cards = [
    ["Students", data?.students, "#5B4DFF"],
    ["Published questions", data?.publishedQuestions, "#12B76A"],
    ["Awaiting approval", data?.awaitingApproval, "#F79009"],
    ["Open tickets", data?.openTickets, "#F04438"],
  ];
  const max = Math.max(1, ...(cards.map((card) => Number(card[1]) || 0)));
  return (
    <Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Platform overview from live data.</Typography>
      {error && <Typography color="error">{error}</Typography>}
      {loading ? <PageSkeleton variant="dashboard" /> : (
      <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
        {cards.map(([label, value, color]) => (
          <Card key={String(label)} sx={{ p: 2.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: String(color), mb: 1 }} />
            <Typography color="text.secondary" fontSize={13}>{label}</Typography>
            <Typography sx={{ fontSize: 32, fontWeight: 800 }}>{value ?? "—"}</Typography>
          </Card>
        ))}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.3fr .7fr" }, gap: 2, mt: 2 }}>
        <Card sx={{ p: 2.5 }}>
          <Typography fontWeight={800} sx={{ mb: 2 }}>Live counts</Typography>
          {cards.map(([label, value, color]) => (
            <Box key={String(label)} sx={{ display: "grid", gridTemplateColumns: "160px 1fr 40px", gap: 1, alignItems: "center", mb: 1.4 }}>
              <Typography fontSize={13}>{label}</Typography>
              <Box sx={{ height: 10, bgcolor: "#EEF1F6", borderRadius: 99 }}><Box sx={{ width: `${((Number(value) || 0) / max) * 100}%`, height: "100%", bgcolor: String(color), borderRadius: 99 }} /></Box>
              <Typography fontWeight={800} fontSize={13}>{value ?? 0}</Typography>
            </Box>
          ))}
        </Card>
        <Card sx={{ p: 2.5 }}>
          <Typography fontWeight={800}>AI usage</Typography>
          <Typography sx={{ fontSize: 36, fontWeight: 800, color: "#5B4DFF" }}>{data?.ai?.requests || 0}</Typography>
          <Typography color="text.secondary">requests · ₹{data?.ai?.inr || 0} estimated</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>Grounded local answers stay at ₹0 until an OpenAI key is configured.</Typography>
        </Card>
      </Box>
      </>
      )}
    </Box>
  );
}
