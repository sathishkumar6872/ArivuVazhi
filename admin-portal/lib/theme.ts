"use client";

import { createTheme } from "@mui/material/styles";

/** Shared green brand tokens (aligned with student-mobile). */
const theme = createTheme({
  palette: {
    primary: { main: "#0B3D2E", dark: "#06281E", light: "#16A34A", contrastText: "#FFFFFF" },
    secondary: { main: "#22C55E", contrastText: "#0B1F17" },
    background: { default: "#F3F4F6", paper: "#FFFFFF" },
    text: { primary: "#0B1F17", secondary: "#5B6B63" },
    success: { main: "#16A34A" },
    warning: { main: "#F59E0B" },
    error: { main: "#DC2626" },
    divider: "#D7E8DC",
  },
  typography: {
    fontFamily: '"Source Sans 3", "Segoe UI", sans-serif',
    h1: { fontSize: 28, fontWeight: 800, letterSpacing: -0.6, color: "#0B1F17" },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 800, borderRadius: 12 },
        containedPrimary: { background: "linear-gradient(90deg, #0B3D2E, #16A34A)" },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { border: "1px solid #D7E8DC", boxShadow: "0 10px 30px rgba(11, 61, 46, 0.06)", borderRadius: 18 },
      },
    },
  },
});

export default theme;
