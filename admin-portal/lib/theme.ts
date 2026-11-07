"use client";

import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: { main: "#5B4DFF" },
    background: { default: "#f5f7fb" },
    text: { primary: "#172033", secondary: "#667085" },
  },
  typography: { fontFamily: 'Inter, "Segoe UI", sans-serif', h1: { fontSize: 28, fontWeight: 800 } },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: { styleOverrides: { root: { textTransform: "none", fontWeight: 800, borderRadius: 12 } } },
    MuiCard: { styleOverrides: { root: { border: "1px solid #EEF1F6", boxShadow: "0 10px 30px rgba(23,32,51,.05)", borderRadius: 18 } } },
  },
});

export default theme;
