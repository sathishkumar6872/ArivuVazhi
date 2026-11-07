import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { storageGet, storageSet } from "./api";

export type Palette = {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  primary: string;
  green: string;
  accent: string;
  highlight: string;
  greenInk: string;
  greenSoft: string;
  mint: string;
  amber: string;
  danger: string;
  dangerSoft: string;
  good: string;
  info: string;
  shadow: string;
  mode: "light" | "dark";
};

/** Brand tokens from assets/brand-use/tokens.json (Green Theme). */
const light: Palette = {
  bg: "#F3F4F6",
  surface: "#FFFFFF",
  ink: "#0B1F17",
  muted: "#5B6B63",
  line: "#D7E8DC",
  primary: "#0B3D2E",
  green: "#16A34A",
  accent: "#22C55E",
  highlight: "#A3E635",
  greenInk: "#FFFFFF",
  greenSoft: "#E8F8EE",
  mint: "#A7F3D0",
  amber: "#F59E0B",
  danger: "#EF4444",
  dangerSoft: "#FEE2E2",
  good: "#10B981",
  info: "#3B82F6",
  shadow: "rgba(11,61,46,0.08)",
  mode: "light",
};

const dark: Palette = {
  bg: "#071510",
  surface: "#0F241C",
  ink: "#F0FDF4",
  muted: "#9CB5A8",
  line: "#1F3A2E",
  primary: "#A7F3D0",
  green: "#22C55E",
  accent: "#4ADE80",
  highlight: "#A3E635",
  greenInk: "#052E1C",
  greenSoft: "#143528",
  mint: "#14532D",
  amber: "#FBBF24",
  danger: "#F87171",
  dangerSoft: "#3F1D1D",
  good: "#34D399",
  info: "#60A5FA",
  shadow: "rgba(0,0,0,0.35)",
  mode: "dark",
};

const ThemeContext = createContext<{ palette: Palette; toggle: () => void }>({ palette: light, toggle: () => undefined });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<"light" | "dark">("light");
  useEffect(() => {
    storageGet("av_m_theme").then((value) => { if (value === "dark" || value === "light") setMode(value); });
  }, []);
  const value = useMemo(() => ({
    palette: mode === "dark" ? dark : light,
    toggle: () => setMode((current) => {
      const next = current === "dark" ? "light" : "dark";
      storageSet("av_m_theme", next);
      return next;
    }),
  }), [mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
