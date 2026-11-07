"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { PageSkeleton } from "@/components/PageSkeleton";

export { PageSkeleton } from "@/components/PageSkeleton";

const links = [
  ["/overview", "Overview"],
  ["/students", "Students"],
  ["/exams", "Examinations"],
  ["/syllabus", "Syllabus history"],
  ["/questions", "Question bank"],
  ["/pyq", "PYQ monitor"],
  ["/ai", "AI providers"],
  ["/support", "Feedback"],
  ["/notifications", "Notifications"],
  ["/operations", "Operations"],
];

export function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem("av_admin_access")) router.replace("/login");
    else setReady(true);
  }, [router]);
  if (!ready) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#f5f7fb", p: { xs: 2, md: 4 } }}>
        <PageSkeleton variant="dashboard" />
      </Box>
    );
  }
  const current = links.find(([href]) => pathname.startsWith(href))?.[1] || "Overview";
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f7fb" }}>
      <Box sx={{ display: { xs: "none", md: "flex" }, flexDirection: "column", position: "fixed", width: 248, inset: "0 auto 0 0", bgcolor: "#0E1740", color: "white", p: 2, overflow: "auto" }}>
        <Typography sx={{ fontWeight: 800, fontSize: 20, px: 1 }}>ArivuVazhi</Typography>
        <Typography sx={{ color: "#9AA6C8", fontSize: 11, px: 1, mb: 2 }}>Admin Portal</Typography>
        {links.map(([href, label]) => {
          const active = pathname.startsWith(href);
          return (
            <Button key={href} component={Link} href={href} fullWidth sx={{ justifyContent: "flex-start", color: active ? "white" : "#C9D2EA", bgcolor: active ? "#5B4DFF" : "transparent", borderRadius: 2.5, mb: 0.4 }}>{label}</Button>
          );
        })}
      </Box>
      <Box sx={{ display: { md: "none" }, bgcolor: "#14213d", overflow: "auto", whiteSpace: "nowrap", px: 1, py: 1 }}>
        {links.map(([href, label]) => (
          <Button key={href} component={Link} href={href} sx={{ color: "white", mr: 0.5 }}>{label}</Button>
        ))}
      </Box>
      <Box sx={{ ml: { md: "252px" } }}>
        <Box sx={{ height: 72, display: "flex", alignItems: "center", justifyContent: "space-between", px: 3 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 20 }}>{current}</Typography>
          <Button onClick={() => { localStorage.removeItem("av_admin_access"); localStorage.removeItem("av_admin_refresh"); router.push("/login"); }}>Logout</Button>
        </Box>
        <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200 }}>{children}</Box>
      </Box>
    </Box>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <Typography sx={{ color: "#3157d5", fontSize: 11, fontWeight: 800, letterSpacing: 1.3 }}>{children}</Typography>;
}

export function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api<T>(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, tick]);
  return { data, error, loading, reload: () => setTick((value) => value + 1) };
}
