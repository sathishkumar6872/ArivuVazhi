"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Box, Button, Typography } from "@mui/material";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import TimerRoundedIcon from "@mui/icons-material/TimerRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import HistoryEduRoundedIcon from "@mui/icons-material/HistoryEduRounded";
import SupportAgentRoundedIcon from "@mui/icons-material/SupportAgentRounded";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { useState } from "react";
import { useAuth } from "@/lib/auth";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: <DashboardRoundedIcon fontSize="small" /> },
  { href: "/exams", label: "Exams", icon: <MenuBookRoundedIcon fontSize="small" /> },
  { href: "/practice", label: "Practice", icon: <EditNoteRoundedIcon fontSize="small" /> },
  { href: "/mocks", label: "Mock Tests", icon: <TimerRoundedIcon fontSize="small" /> },
  { href: "/tutor", label: "AI Tutor", icon: <AutoAwesomeRoundedIcon fontSize="small" /> },
  { href: "/planner", label: "Study Planner", icon: <CalendarMonthRoundedIcon fontSize="small" /> },
  { href: "/analytics", label: "Analytics", icon: <InsightsRoundedIcon fontSize="small" /> },
  { href: "/pyq", label: "PYQ", icon: <HistoryEduRoundedIcon fontSize="small" /> },
  { href: "/profile", label: "Profile", icon: <PersonRoundedIcon fontSize="small" /> },
  { href: "/support", label: "Support", icon: <SupportAgentRoundedIcon fontSize="small" /> },
];

const mobile = ["/dashboard", "/practice", "/mocks", "/planner", "/profile"];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [query, setQuery] = useState("");
  const current = links.find((link) => pathname.startsWith(link.href))?.label || "ArivuVazhi";

  function search(event: React.FormEvent) {
    event.preventDefault();
    const hit = links.find((link) => link.label.toLowerCase().includes(query.trim().toLowerCase()));
    if (hit) router.push(hit.href);
    else if (query.trim()) router.push(`/tutor?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#F4F6FB" }}>
      <Box sx={{ display: { xs: "none", md: "flex" }, position: "fixed", inset: "0 auto 0 0", width: 248, bgcolor: "#fff", borderRight: "1px solid #EEF1F6", flexDirection: "column", p: 2, overflow: "auto" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, px: 1, mb: 2 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: 2, background: "linear-gradient(135deg,#5B4DFF,#7C5CFF)", color: "white", display: "grid", placeItems: "center", fontWeight: 800 }}>அ</Box>
          <Box>
            <Typography sx={{ fontWeight: 800, lineHeight: 1.1 }}>ArivuVazhi</Typography>
            <Typography sx={{ fontSize: 11, color: "#98A2B3" }}>Exam preparation</Typography>
          </Box>
        </Box>
        {links.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Button key={link.href} component={Link} href={link.href} startIcon={link.icon} sx={{ justifyContent: "flex-start", color: active ? "#4C3AE0" : "#475467", bgcolor: active ? "#F1EEFF" : "transparent", borderRadius: 2.5, mb: 0.4, px: 1.5, fontWeight: 700 }}>
              {link.label}
            </Button>
          );
        })}
      </Box>
      <Box sx={{ ml: { xs: 0, md: "248px" } }}>
        <Box component="form" onSubmit={search} sx={{ height: 72, bgcolor: "rgba(244,246,251,.9)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "space-between", px: 3, position: "sticky", top: 0, zIndex: 5, gap: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, bgcolor: "white", border: "1px solid #EEF1F6", borderRadius: 99, px: 1.5, height: 42, flex: 1, maxWidth: 420 }}>
            <SearchRoundedIcon sx={{ color: "#98A2B3", fontSize: 20 }} />
            <Box component="input" value={query} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder={`Search ${current.toLowerCase()}...`} sx={{ border: 0, outline: 0, width: "100%", font: "inherit", bgcolor: "transparent" }} />
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Button component={Link} href="/notifications" sx={{ minWidth: 42, width: 42, height: 42, borderRadius: "50%", bgcolor: "white", border: "1px solid #EEF1F6" }}>
              <NotificationsNoneRoundedIcon sx={{ color: "#344054" }} />
            </Button>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, bgcolor: "white", border: "1px solid #EEF1F6", borderRadius: 99, pl: 0.6, pr: 1.4, py: 0.4 }}>
              <Box sx={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#5B4DFF,#8B6CFF)", color: "white", display: "grid", placeItems: "center", fontWeight: 800 }}>{user?.firstName?.[0] || "A"}</Box>
              <Typography fontWeight={800} fontSize={13}>{user?.firstName}</Typography>
            </Box>
            <Button size="small" onClick={async () => { await logout(); router.push("/login"); }}>Logout</Button>
          </Box>
        </Box>
        <Box sx={{ maxWidth: 1180, mx: "auto", p: { xs: 2, md: 3 }, pb: { xs: 12, md: 5 } }}>{children}</Box>
      </Box>
      <Box sx={{ display: { xs: "flex", md: "none" }, position: "fixed", bottom: 0, left: 0, right: 0, bgcolor: "white", borderTop: "1px solid #EEF1F6", justifyContent: "space-around", py: 1, zIndex: 10 }}>
        {links.filter((link) => mobile.includes(link.href)).map((link) => (
          <Button key={link.href} component={Link} href={link.href} sx={{ minWidth: 0, fontSize: 10, color: pathname.startsWith(link.href) ? "#5B4DFF" : "#98A2B3" }}>{link.label.split(" ")[0]}</Button>
        ))}
      </Box>
    </Box>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <Typography sx={{ color: "#5B4DFF", fontSize: 12, fontWeight: 800, letterSpacing: 0.4 }}>{children}</Typography>;
}

export function Ring({ value }: { value: number }) {
  const radius = 42;
  const length = 2 * Math.PI * radius;
  const offset = length - (Math.max(0, Math.min(100, value)) / 100) * length;
  return (
    <Box sx={{ position: "relative", width: 112, height: 112 }}>
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r={radius} fill="none" stroke="#E7E9F6" strokeWidth="10" />
        <circle cx="56" cy="56" r={radius} fill="none" stroke="#12B76A" strokeWidth="10" strokeLinecap="round" strokeDasharray={length} strokeDashoffset={offset} transform="rotate(-90 56 56)" />
      </svg>
      <Typography sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 22 }}>{value}%</Typography>
    </Box>
  );
}
