"use client";

import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: { main: "#5B4DFF", dark: "#4338CA", contrastText: "#fff" },
    background: { default: "#F4F6FB", paper: "#ffffff" },
    text: { primary: "#172033", secondary: "#667085" },
    success: { main: "#12B76A" },
    warning: { main: "#F79009" },
    error: { main: "#F04438" },
  },
  typography: {
    fontFamily: 'Inter, "Segoe UI", sans-serif',
    h1: { fontSize: 30, fontWeight: 800, letterSpacing: -0.8, color: "#172033" },
  },
  shape: { borderRadius: 16 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 800, borderRadius: 12, boxShadow: "none" },
        contained: { background: "linear-gradient(90deg, #5B4DFF, #7C5CFF)" },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { border: "1px solid #EEF1F6", boxShadow: "0 10px 30px rgba(23, 32, 51, 0.05)", borderRadius: 18 },
      },
    },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12, background: "#fff" } } },
  },
});

export default theme;
