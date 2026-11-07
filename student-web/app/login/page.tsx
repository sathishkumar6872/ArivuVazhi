"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Checkbox, FormControlLabel, TextField, Typography } from "@mui/material";
import { useAuth } from "@/lib/auth";
import { AuthShowcase } from "@/components/AuthShowcase";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("anitha@arivuvazhi.in");
  const [password, setPassword] = useState("Student@12345");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (remember) localStorage.setItem("av_remember_email", email);
      else localStorage.removeItem("av_remember_email");
      const user = await login(email, password);
      router.push(user.onboardingComplete ? "/dashboard" : "/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShowcase title="Your AI-powered government exam preparation platform" subtitle="Practice, mock tests and a grounded tutor for Tamil Nadu and other competitive exams.">
      <Box sx={{ width: "100%", maxWidth: 440 }}>
        <Typography sx={{ fontSize: 32, fontWeight: 800 }}>Login to ArivuVazhi</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>Continue your preparation.</Typography>
        <Box component="form" onSubmit={submit}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {info && <Alert severity="info" sx={{ mb: 2 }}>{info}</Alert>}
          <TextField label="Email" type="email" fullWidth margin="normal" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <TextField label="Password" type="password" fullWidth margin="normal" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <FormControlLabel control={<Checkbox checked={remember} onChange={(event) => setRemember(event.target.checked)} />} label="Remember me" />
            <Button type="button" onClick={() => setInfo("Email reset is not connected yet. Sign in with your password, or ask an admin for help.")}>Forgot password?</Button>
          </Box>
          <Button type="submit" variant="contained" fullWidth size="large" sx={{ mt: 1, py: 1.3 }} disabled={busy}>{busy ? "Signing in..." : "Login"}</Button>
          <Button fullWidth variant="outlined" sx={{ mt: 1.5 }} onClick={() => setInfo("Google sign-in needs a Google client ID. Email login is ready.")}>Continue with Google</Button>
        </Box>
        <Typography sx={{ mt: 3 }} color="text.secondary">New to ArivuVazhi? <Link href="/register">Create account</Link></Typography>
      </Box>
    </AuthShowcase>
  );
}
