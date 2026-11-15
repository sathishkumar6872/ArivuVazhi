"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, Chip, MenuItem, TextField, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Eyebrow, PageSkeleton } from "@/components/Frame";

type Status = {
  provider: "none" | "google_drive";
  status: "disconnected" | "connected" | "authorization_expired" | "configuration_error";
  clientIdMasked: string;
  hasClientSecret: boolean;
  accountEmail: string;
  folderName: string;
  folderId: string;
  lastError: string;
  connectedAt: string | null;
  lastCheckedAt: string | null;
  redirectUri: string;
  files: number;
};

const STATUS_LABEL: Record<Status["status"], { label: string; color: "success" | "default" | "warning" | "error" }> = {
  connected: { label: "Connected", color: "success" },
  disconnected: { label: "Disconnected", color: "default" },
  authorization_expired: { label: "Authorization expired", color: "warning" },
  configuration_error: { label: "Configuration error", color: "error" },
};

export default function StoragePage() {
  const [data, setData] = useState<Status | null>(null);
  const [provider, setProvider] = useState<"none" | "google_drive">("google_drive");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [folderName, setFolderName] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function load() {
    const next = await api<Status>("/admin/storage");
    setData(next);
    setFolderName(next.folderName || "ArivuVazhi");
    if (next.provider !== "none") setProvider(next.provider);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
    // Result of the Google sign-in redirect.
    const params = new URLSearchParams(window.location.search);
    if (params.get("drive") === "connected") setInfo(`Google Drive connected${params.get("account") ? ` (${params.get("account")})` : ""}.`);
    if (params.get("drive") === "error") setError(params.get("message") || "Google Drive connection failed.");
    if (params.get("drive")) window.history.replaceState(null, "", "/storage");
  }, []);

  async function run(name: string, task: () => Promise<unknown>, done?: string) {
    setBusy(name);
    setError("");
    setInfo("");
    try {
      await task();
      if (done) setInfo(done);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy("");
    }
  }

  const saveCredentials = () =>
    run(
      "save",
      async () => {
        await api("/admin/storage/credentials", { method: "PUT", body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }) });
        setClientId("");
        setClientSecret("");
      },
      "Credentials saved (encrypted). Now connect the Google account.",
    );

  async function connect() {
    setBusy("connect");
    setError("");
    try {
      const { authUrl } = await api<{ authUrl: string }>("/admin/storage/google/connect", { method: "POST" });
      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Google sign-in");
      setBusy("");
    }
  }

  if (!data && !error) return <PageSkeleton rows={4} />;
  const state = data ? STATUS_LABEL[data.status] : STATUS_LABEL.disconnected;
  const configured = Boolean(data?.clientIdMasked && data?.hasClientSecret);

  return (
    <Box>
      <Eyebrow>SETTINGS</Eyebrow>
      <Typography variant="h1">Storage configuration</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Files such as PYQ PDFs are kept in Google Drive; only their references are stored in the database. Credentials are encrypted and never shown again after saving.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {info && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo("")}>{info}</Alert>}

      <Card sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <Box>
            <Typography fontWeight={800}>Connection</Typography>
            <Typography color="text.secondary">
              {data?.accountEmail ? `Account: ${data.accountEmail}` : "No Google account connected"}
              {data?.lastCheckedAt ? ` · last checked ${new Date(data.lastCheckedAt).toLocaleString()}` : ""}
              {data ? ` · ${data.files} files stored` : ""}
            </Typography>
          </Box>
          <Chip label={state.label} color={state.color} sx={{ fontWeight: 800 }} />
        </Box>
        {data?.lastError ? <Alert severity="warning" sx={{ mt: 1.5 }}>{data.lastError}</Alert> : null}
        <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
          <Button variant="contained" disabled={!configured || Boolean(busy)} onClick={connect}>
            {data?.status === "connected" ? "Reconnect Google account" : "Connect Google account"}
          </Button>
          <Button variant="outlined" disabled={data?.status !== "connected" || Boolean(busy)} onClick={() => run("test", () => api("/admin/storage/test", { method: "POST" }), "Connection works.")}>
            {busy === "test" ? "Testing…" : "Test connection"}
          </Button>
          <Button color="error" disabled={!data?.accountEmail || Boolean(busy)} onClick={() => run("disconnect", () => api("/admin/storage/disconnect", { method: "POST" }), "Google Drive disconnected.")}>
            Disconnect
          </Button>
        </Box>
      </Card>

      <Card sx={{ p: 2, mb: 2 }}>
        <Typography fontWeight={800} sx={{ mb: 1.5 }}>Google OAuth credentials</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 }}>
          <TextField select size="small" label="Storage provider" value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}>
            <MenuItem value="google_drive">Google Drive</MenuItem>
            <MenuItem value="none" disabled>Cloudflare R2 (later)</MenuItem>
          </TextField>
          <Box />
          <TextField size="small" label={data?.clientIdMasked ? `Client ID (saved: ${data.clientIdMasked})` : "Client ID"} value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="1234-abc.apps.googleusercontent.com" autoComplete="off" />
          <TextField size="small" type="password" label={data?.hasClientSecret ? "Client Secret (saved — enter to replace)" : "Client Secret"} value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} autoComplete="new-password" />
        </Box>
        <Typography color="text.secondary" fontSize={13} sx={{ mt: 1 }}>
          Add this exact Authorized redirect URI to the OAuth client in Google Cloud Console:
        </Typography>
        <Typography fontFamily="monospace" fontSize={13} sx={{ p: 1, mt: 0.5, bgcolor: "#F3F4F6", borderRadius: 1, wordBreak: "break-all" }}>{data?.redirectUri}</Typography>
        <Typography color="text.secondary" fontSize={13} sx={{ mt: 1 }}>Saving new credentials disconnects the current account; connect again afterwards.</Typography>
        <Button sx={{ mt: 1.5 }} variant="contained" disabled={!clientId.trim() || !clientSecret.trim() || Boolean(busy)} onClick={saveCredentials}>
          {busy === "save" ? "Saving…" : configured ? "Update credentials" : "Save credentials"}
        </Button>
      </Card>

      <Card sx={{ p: 2 }}>
        <Typography fontWeight={800} sx={{ mb: 1.5 }}>Storage folder</Typography>
        <Typography color="text.secondary" fontSize={13} sx={{ mb: 1 }}>
          Files go into this folder in the connected Drive{data?.folderId ? ` (folder id ${data.folderId})` : ""}. Changing it creates a new folder; existing files stay where they are.
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <TextField size="small" label="Folder name" value={folderName} onChange={(event) => setFolderName(event.target.value)} />
          <Button variant="outlined" disabled={data?.status !== "connected" || folderName.trim().length < 2 || Boolean(busy)} onClick={() => run("folder", () => api("/admin/storage/folder", { method: "PUT", body: JSON.stringify({ folderName: folderName.trim() }) }), "Folder ready.")}>
            Save folder
          </Button>
        </Box>
      </Card>
    </Box>
  );
}
