"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Card, TextField, Typography } from "@mui/material";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@arivuvazhi.in");
  const [password, setPassword] = useState("Admin@12345");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await api<{ user: { role: string }; accessToken: string; refreshToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (data.user.role === "student") throw new Error("Use an admin account for this portal");
      localStorage.setItem("av_admin_access", data.accessToken);
      localStorage.setItem("av_admin_refresh", data.refreshToken);
      router.push("/overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", gridTemplateColumns: { xs: "1fr", md: "0.9fr 1.1fr" } }}>
      <Box sx={{ display: { xs: "none", md: "flex" }, flexDirection: "column", justifyContent: "center", p: 6, color: "white", background: "linear-gradient(165deg,#241B66,#5B4DFF)" }}>
        <Typography sx={{ fontSize: 36, fontWeight: 800 }}>ArivuVazhi</Typography>
        <Typography sx={{ fontSize: 20, mt: 1, maxWidth: 360 }}>Admin Portal for content, learners and the AI Tutor.</Typography>
      </Box>
      <Box sx={{ display: "grid", placeItems: "center", p: 3 }}>
      <Card sx={{ p: 4, width: "100%", maxWidth: 440, boxShadow: "none", border: 0 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 30 }}>Admin Login</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>Sign in to govern the platform.</Typography>
        <Box component="form" onSubmit={submit}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField fullWidth label="Email" margin="normal" value={email} onChange={(event) => setEmail(event.target.value)} />
          <TextField fullWidth label="Password" type="password" margin="normal" value={password} onChange={(event) => setPassword(event.target.value)} />
          <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }}>Sign in</Button>
        </Box>
      </Card>
      </Box>
    </Box>
  );
}
