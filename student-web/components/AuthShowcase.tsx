"use client";

import { Box, Typography } from "@mui/material";

export function AuthShowcase({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", gridTemplateColumns: { xs: "1fr", md: "0.92fr 1.08fr" }, bgcolor: "#fff" }}>
      <Box sx={{ display: { xs: "none", md: "flex" }, flexDirection: "column", justifyContent: "space-between", p: 6, color: "white", background: "linear-gradient(165deg, #6D5EF6 0%, #5B4DFF 42%, #3E37C9 100%)" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
          <Box sx={{ width: 42, height: 42, borderRadius: 2, bgcolor: "rgba(255,255,255,.16)", display: "grid", placeItems: "center", fontWeight: 800 }}>அ</Box>
          <Typography sx={{ fontWeight: 800, fontSize: 22 }}>ArivuVazhi</Typography>
        </Box>
        <Box>
          <svg width="280" height="190" viewBox="0 0 280 190" aria-hidden>
            <rect x="28" y="28" width="150" height="110" rx="16" fill="rgba(255,255,255,.16)" />
            <rect x="48" y="50" width="88" height="10" rx="5" fill="white" />
            <rect x="48" y="70" width="64" height="8" rx="4" fill="rgba(255,255,255,.7)" />
            <circle cx="190" cy="118" r="46" fill="#F6C56B" />
            <rect x="164" y="150" width="70" height="28" rx="12" fill="#2E2A72" />
            <rect x="120" y="132" width="54" height="36" rx="10" fill="#7C5CFF" />
          </svg>
          <Typography sx={{ fontSize: 34, fontWeight: 800, lineHeight: 1.15, maxWidth: 420 }}>{title}</Typography>
          <Typography sx={{ mt: 1.5, maxWidth: 420, color: "rgba(255,255,255,.84)" }}>{subtitle}</Typography>
        </Box>
        <Typography sx={{ color: "rgba(255,255,255,.7)", fontSize: 13 }}>Tamil · English · Government exams</Typography>
      </Box>
      <Box sx={{ display: "grid", placeItems: "center", p: { xs: 2, md: 6 } }}>{children}</Box>
    </Box>
  );
}
