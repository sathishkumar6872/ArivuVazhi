"use client";

import { Box, Card, Skeleton } from "@mui/material";

export function PageSkeleton({
  variant = "cards",
  rows = 4,
}: {
  variant?: "cards" | "table" | "dashboard" | "detail";
  rows?: number;
}) {
  if (variant === "dashboard") {
    return (
      <Box aria-busy aria-label="Loading">
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2, mb: 2 }}>
          {Array.from({ length: 4 }, (_, index) => (
            <Card key={index} sx={{ p: 2.5 }}>
              <Skeleton variant="circular" width={10} height={10} sx={{ mb: 1 }} />
              <Skeleton width="55%" height={16} />
              <Skeleton width="40%" height={36} sx={{ mt: 1 }} />
            </Card>
          ))}
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.3fr .7fr" }, gap: 2 }}>
          <Card sx={{ p: 2.5 }}>
            <Skeleton width="30%" height={22} sx={{ mb: 2 }} />
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} height={14} sx={{ mb: 1.5 }} />
            ))}
          </Card>
          <Card sx={{ p: 2.5 }}>
            <Skeleton width="40%" height={22} />
            <Skeleton width="50%" height={40} sx={{ my: 1 }} />
            <Skeleton width="80%" />
          </Card>
        </Box>
      </Box>
    );
  }

  if (variant === "table") {
    return (
      <Card aria-busy aria-label="Loading" sx={{ p: 2 }}>
        <Skeleton width="28%" height={28} sx={{ mb: 2 }} />
        {Array.from({ length: rows }, (_, index) => (
          <Box key={index} sx={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 80px", gap: 1.5, mb: 1.5, alignItems: "center" }}>
            <Skeleton height={18} />
            <Skeleton height={18} />
            <Skeleton height={18} />
            <Skeleton height={28} />
          </Box>
        ))}
      </Card>
    );
  }

  if (variant === "detail") {
    return (
      <Box aria-busy aria-label="Loading">
        <Skeleton width="40%" height={28} sx={{ mb: 1 }} />
        <Skeleton width="70%" sx={{ mb: 2 }} />
        <Card sx={{ p: 2.5 }}>
          {Array.from({ length: rows }, (_, index) => (
            <Skeleton key={index} height={18} sx={{ mb: 1.4 }} />
          ))}
        </Card>
      </Box>
    );
  }

  return (
    <Box aria-busy aria-label="Loading" sx={{ display: "grid", gap: 1.5 }}>
      {Array.from({ length: rows }, (_, index) => (
        <Card key={index} sx={{ p: 2 }}>
          <Skeleton width={`${62 - (index % 3) * 8}%`} height={20} />
          <Skeleton width="45%" sx={{ mt: 1 }} />
          <Skeleton height={10} sx={{ mt: 1.5 }} />
        </Card>
      ))}
    </Box>
  );
}
