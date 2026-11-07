"use client";

import { Box, Card, Skeleton } from "@mui/material";

export function PageSkeleton({
  variant = "cards",
  rows = 4,
}: {
  variant?: "cards" | "dashboard" | "quiz" | "list";
  rows?: number;
}) {
  if (variant === "dashboard") {
    return (
      <Box aria-busy aria-label="Loading">
        <Skeleton width="36%" height={34} />
        <Skeleton width="55%" sx={{ mb: 2, mt: 1 }} />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.4fr .8fr" }, gap: 2 }}>
          <Card sx={{ p: 3 }}>
            <Skeleton width="40%" height={18} />
            <Skeleton width="30%" height={56} sx={{ my: 1 }} />
            <Skeleton width="70%" />
            <Skeleton width={120} height={36} sx={{ mt: 2 }} />
          </Card>
          <Card sx={{ p: 2.5 }}>
            <Skeleton width="45%" height={22} sx={{ mb: 1 }} />
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} height={18} sx={{ my: 1.1 }} />
            ))}
          </Card>
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 220px" }, gap: 2, mt: 2 }}>
          {Array.from({ length: 3 }, (_, index) => (
            <Card key={index} sx={{ p: 2.5, display: "flex", gap: 1.5, alignItems: "center" }}>
              <Skeleton variant="rounded" width={44} height={44} />
              <Skeleton width="50%" height={22} />
            </Card>
          ))}
        </Box>
      </Box>
    );
  }

  if (variant === "quiz") {
    return (
      <Box aria-busy aria-label="Loading">
        <Skeleton width="40%" height={28} sx={{ mb: 1 }} />
        <Skeleton width="25%" sx={{ mb: 2 }} />
        <Card sx={{ p: 2.5 }}>
          <Skeleton height={64} sx={{ mb: 2 }} />
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} height={42} sx={{ mb: 1 }} />
          ))}
        </Card>
      </Box>
    );
  }

  return (
    <Box aria-busy aria-label="Loading">
      <Skeleton width="28%" height={30} sx={{ mb: 1 }} />
      <Skeleton width="55%" sx={{ mb: 2 }} />
      <Box sx={{ display: "grid", gap: 1.5 }}>
        {Array.from({ length: rows }, (_, index) => (
          <Card key={index} sx={{ p: 2 }}>
            <Skeleton width={`${68 - (index % 3) * 10}%`} height={20} />
            <Skeleton width="48%" sx={{ mt: 1 }} />
          </Card>
        ))}
      </Box>
    </Box>
  );
}
