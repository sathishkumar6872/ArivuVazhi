"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  FormControlLabel,
  LinearProgress,
  Link,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "@/lib/api";
import { PageSkeleton, useData } from "@/components/Frame";

type UsageWindow = {
  label: string;
  usedPercent: number | null;
  resetAt: number | null;
  resetAfterSeconds: number | null;
  windowSeconds: number | null;
};

type PlanUsage = {
  available: boolean;
  source: "openai" | "none";
  planType: string | null;
  allowed: boolean | null;
  limitReached: boolean | null;
  windows: UsageWindow[];
  message: string;
  usageUrl: string;
};

type Settings = {
  provider: string;
  chatgptEnabled?: boolean;
  geminiEnabled?: boolean;
  openaiModel?: string;
  chatgpt?: {
    connected: boolean;
    signedIn: boolean;
    planEnabled: boolean;
    account: string;
    status: string;
    lastError: string;
    models: string[];
    lastCheckedAt?: string | null;
  };
  gemini?: {
    configured: boolean;
    keyHint: string;
    model: string;
    auto?: boolean;
    lastUsedModel?: string;
    models: string[];
    lastError: string;
    lastCheckedAt?: string | null;
  };
  planUsage?: PlanUsage | null;
  localUsage?: {
    todayRequests: number;
    todayTokens: number;
    totalRequests: number;
    totalTokens: number;
    dailyStudentLimit: number;
  };
};

type CheckResult = {
  message: string;
  model?: string;
  lastUsedModel?: string;
  models?: string[];
  auto?: boolean;
  planUsage?: PlanUsage;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
};

const USAGE_URL = "https://chatgpt.com/settings/usage";
const GEMINI_KEY_URL = "https://aistudio.google.com/apikey";

function formatReset(window: UsageWindow) {
  if (window.resetAt) {
    return `Reset aagum: ${new Date(window.resetAt * 1000).toLocaleString()}`;
  }
  if (window.resetAfterSeconds != null) {
    const hours = Math.max(0, Math.round(window.resetAfterSeconds / 3600));
    if (hours < 1) return "Oru hour-ku ulla reset aagum";
    if (hours < 48) return `Approx ${hours}h-la reset`;
    return `Approx ${Math.round(hours / 24)} day-la reset`;
  }
  return "";
}

export default function AiPage() {
  const { data, error, loading, reload } = useData<Settings>("/admin/ai");
  const [model, setModel] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [localError, setLocalError] = useState("");
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null);

  const chatgpt = data?.chatgpt;
  const gemini = data?.gemini;
  const connected = Boolean(chatgpt?.connected);
  const geminiConfigured = Boolean(gemini?.configured);
  const planModels = chatgpt?.models ?? [];
  const savedModel = data?.openaiModel || "";
  const usage = planUsage || data?.planUsage || null;
  const chatgptEnabled = Boolean(data?.chatgptEnabled);
  const geminiEnabled = Boolean(data?.geminiEnabled);
  const activeProvider = data?.provider || "local";

  useEffect(() => {
    if (data?.planUsage) setPlanUsage(data.planUsage);
  }, [data?.planUsage]);

  useEffect(() => {
    if (!data) return;
    if (planModels.length && savedModel && planModels.includes(savedModel)) setModel(savedModel);
    else if (planModels.length) setModel(planModels[0]);
    else setModel(savedModel);
  }, [data, savedModel, planModels.join("|")]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("chatgpt");
    if (!result) return;
    if (result === "connected") {
      setMessage("ChatGPT connect aayiduchu. Enable switch On panni tutor-ku use pannunga.");
    } else if (result === "plan_not_allowed") {
      setLocalError("Login aayiduchu, but plan use allow pannala. Marupadiyum Continue with ChatGPT panni consent-la allow pannunga.");
    } else setLocalError(params.get("message") || "ChatGPT sign-in fail aayiduchu.");
    window.history.replaceState({}, "", "/ai");
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read callback query once on mount
  }, []);

  async function continueWithChatGpt() {
    setLocalError("");
    setMessage("");
    setBusy("authorize");
    try {
      const result = await api<{ url: string }>("/admin/ai/chatgpt/authorize", { method: "POST", body: "{}" });
      window.location.assign(result.url);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "ChatGPT sign-in start aagala");
      setBusy("");
    }
  }

  async function checkConnection() {
    setLocalError("");
    setMessage("");
    setBusy("test");
    try {
      const result = await api<CheckResult>("/admin/ai/chatgpt/test", { method: "POST", body: "{}" });
      if (result.planUsage) setPlanUsage(result.planUsage);
      setMessage(result.message);
      reload();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Connection check fail aayiduchu");
    } finally {
      setBusy("");
    }
  }

  async function signOutChatGpt() {
    setBusy("signout");
    setLocalError("");
    setMessage("");
    setPlanUsage(null);
    try {
      await api("/admin/ai/chatgpt", { method: "DELETE" });
      await api("/admin/ai", { method: "PATCH", body: JSON.stringify({ chatgptEnabled: false }) });
      setMessage("ChatGPT-la irundhu sign out aayiduchu.");
      setModel("");
      reload();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Sign out aagala");
    } finally {
      setBusy("");
    }
  }

  async function saveModel(next: string) {
    setModel(next);
    setBusy("model");
    setLocalError("");
    try {
      await api("/admin/ai", { method: "PATCH", body: JSON.stringify({ openaiModel: next }) });
      setMessage(`Preferred ChatGPT model: ${next}`);
      reload();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Model save aagala");
    } finally {
      setBusy("");
    }
  }

  async function setProviderEnabled(provider: "chatgpt" | "gemini", enabled: boolean) {
    setBusy(`${provider}-enable`);
    setLocalError("");
    try {
      if (provider === "chatgpt" && enabled && !connected) {
        setLocalError("Munadi ChatGPT connect pannunga.");
        return;
      }
      if (provider === "gemini" && enabled && !geminiConfigured) {
        setLocalError("Munadi Gemini API key save pannunga.");
        return;
      }
      await api("/admin/ai", {
        method: "PATCH",
        body: JSON.stringify(provider === "chatgpt" ? { chatgptEnabled: enabled } : { geminiEnabled: enabled }),
      });
      if (enabled) setMessage(`${provider === "chatgpt" ? "ChatGPT" : "Gemini"} enable aayiduchu. Active aakka “Use for tutor” press pannunga.`);
      else setMessage(`${provider === "chatgpt" ? "ChatGPT" : "Gemini"} disable aayiduchu.`);
      reload();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Provider toggle aagala");
    } finally {
      setBusy("");
    }
  }

  async function useForTutor(provider: "chatgpt" | "gemini") {
    setBusy(`${provider}-use`);
    setLocalError("");
    try {
      await api("/admin/ai", {
        method: "PATCH",
        body: JSON.stringify({
          aiProvider: provider,
          ...(provider === "chatgpt" ? { chatgptEnabled: true } : { geminiEnabled: true }),
        }),
      });
      setMessage(`Active tutor: ${provider === "chatgpt" ? "ChatGPT" : "Gemini"}`);
      reload();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Active provider set aagala");
    } finally {
      setBusy("");
    }
  }

  async function saveGeminiKey() {
    const key = geminiKey.trim();
    if (!key) {
      setLocalError("Gemini API key paste pannunga.");
      return;
    }
    setBusy("gemini-save");
    setLocalError("");
    setMessage("");
    try {
      await api("/admin/ai", {
        method: "PATCH",
        body: JSON.stringify({ geminiApiKey: key, geminiEnabled: true }),
      });
      const result = await api<CheckResult>("/admin/ai/gemini/test", {
        method: "POST",
        body: JSON.stringify({ geminiApiKey: key, geminiModel: "auto" }),
      });
      setGeminiKey("");
      setMessage(result.message);
      reload();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Gemini save/test fail aayiduchu");
    } finally {
      setBusy("");
    }
  }

  async function checkGemini() {
    setBusy("gemini-test");
    setLocalError("");
    setMessage("");
    try {
      const result = await api<CheckResult>("/admin/ai/gemini/test", {
        method: "POST",
        body: JSON.stringify({ geminiModel: "auto" }),
      });
      setMessage(result.message);
      reload();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Gemini check fail aayiduchu");
    } finally {
      setBusy("");
    }
  }

  async function clearGemini() {
    setBusy("gemini-clear");
    setLocalError("");
    setMessage("");
    try {
      await api("/admin/ai", {
        method: "PATCH",
        body: JSON.stringify({ clearGeminiKey: true, geminiEnabled: false }),
      });
      setGeminiKey("");
      setMessage("Gemini API key clear aayiduchu.");
      reload();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Gemini clear aagala");
    } finally {
      setBusy("");
    }
  }

  const activeLabel =
    activeProvider === "chatgpt" && chatgptEnabled
      ? "ChatGPT"
      : activeProvider === "gemini" && geminiEnabled
        ? "Gemini"
        : "Local (AI off)";

  if (loading && !data) {
    return (
      <Box sx={{ maxWidth: 640 }}>
        <PageSkeleton variant="detail" rows={8} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Typography color="text.secondary" sx={{ mb: 1 }}>
        Ithu tutor mattum illa — practice/mock Q gen, syllabus refresh, PYQ gen ellam active AI provider use pannum.
        ChatGPT + Gemini rendu-um enable panna mudiyum; active provider-a “Use for tutor” / enable flow-la set pannunga.
      </Typography>
      <Chip
        size="small"
        label={`Active AI: ${activeLabel}`}
        sx={{ mb: 2, fontWeight: 800, bgcolor: "#EEF2FF", color: "#3538CD" }}
      />
      {(error || localError) && <Alert severity="error" sx={{ mb: 2 }}>{error || localError}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
      {chatgpt?.lastError && !localError && <Alert severity="warning" sx={{ mb: 2 }}>{chatgpt.lastError}</Alert>}
      {gemini?.lastError && !localError && <Alert severity="warning" sx={{ mb: 2 }}>{gemini.lastError}</Alert>}

      <Card sx={{ p: 2.5, mb: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography fontWeight={800}>ChatGPT</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              label={connected ? "Connected" : chatgpt?.signedIn ? "Plan allow illa" : "Connect aagala"}
              sx={{ bgcolor: connected ? "#ECFDF3" : "#F2F4F7", color: connected ? "#027A48" : "#475467", fontWeight: 800 }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={chatgptEnabled}
                  disabled={Boolean(busy) || !connected}
                  onChange={(event) => setProviderEnabled("chatgpt", event.target.checked)}
                />
              }
              label={chatgptEnabled ? "Enabled" : "Disabled"}
            />
          </Stack>
        </Stack>

        {!connected && (
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            OpenAI page-la login pannunga. Consent screen-la <Box component="span" fontWeight={800}>use your ChatGPT plan</Box> allow pannunga.
          </Typography>
        )}

        {chatgpt?.account ? (
          <Typography sx={{ mb: 1 }}>
            Account: <Box component="span" fontWeight={800}>{chatgpt.account}</Box>
            {usage?.planType ? <> · Plan: <Box component="span" fontWeight={800}>{usage.planType}</Box></> : null}
          </Typography>
        ) : null}

        {connected && (
          <TextField
            select
            fullWidth
            margin="dense"
            label="Preferred model"
            value={model && planModels.includes(model) ? model : planModels[0] || ""}
            disabled={!planModels.length || busy === "model"}
            helperText={planModels.length ? `${planModels.length} models` : "Models load aaguthu…"}
            onChange={(event) => saveModel(event.target.value)}
          >
            {planModels.map((item) => (
              <MenuItem key={item} value={item}>{item}</MenuItem>
            ))}
          </TextField>
        )}

        {connected && chatgptEnabled && (
          <Box sx={{ mt: 2, p: 1.5, bgcolor: "#F8FAFC", borderRadius: 2 }}>
            <Typography fontWeight={700} sx={{ mb: 1 }}>Plan limit</Typography>
            {usage?.available && usage.windows.length ? (
              <Stack spacing={1.5}>
                {usage.limitReached ? <Alert severity="warning">Ippa plan limit full aayiduchu.</Alert> : null}
                {usage.windows.map((window) => {
                  const percent = Math.max(0, Math.min(100, window.usedPercent ?? 0));
                  return (
                    <Box key={window.label}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Typography fontWeight={700} fontSize={14}>{window.label}</Typography>
                        <Typography fontSize={14} fontWeight={800}>
                          {window.usedPercent == null ? "—" : `${Math.round(percent)}% use aayiduchu`}
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={window.usedPercent == null ? 0 : percent}
                        sx={{
                          height: 8,
                          borderRadius: 999,
                          bgcolor: "#E4E7EC",
                          "& .MuiLinearProgress-bar": { bgcolor: percent >= 90 ? "#B42318" : "#0B3D2E" },
                        }}
                      />
                      {formatReset(window) ? (
                        <Typography color="text.secondary" fontSize={12} sx={{ mt: 0.5 }}>
                          {formatReset(window)}
                        </Typography>
                      ) : null}
                    </Box>
                  );
                })}
              </Stack>
            ) : (
              <Typography color="text.secondary" fontSize={14}>
                {usage?.message || "Plan % load panna Check connection press pannunga."}{" "}
                Exact remaining:{" "}
                <Link href={USAGE_URL} target="_blank" rel="noreferrer">
                  chatgpt.com/settings/usage
                </Link>
              </Typography>
            )}
            {data?.localUsage ? (
              <Typography sx={{ mt: 1.5 }} fontSize={13} color="text.secondary">
                Tutor (ChatGPT): innikku {data.localUsage.todayRequests} requests / {data.localUsage.todayTokens} tokens
                · Student daily AI limit: {data.localUsage.dailyStudentLimit}.
              </Typography>
            ) : null}
          </Box>
        )}

        <Stack direction="row" spacing={1} sx={{ mt: 2 }} useFlexGap flexWrap="wrap">
          {!connected && (
            <Button
              variant="contained"
              disabled={Boolean(busy)}
              onClick={continueWithChatGpt}
              startIcon={busy === "authorize" ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {busy === "authorize" ? "ChatGPT open aaguthu..." : "Continue with ChatGPT"}
            </Button>
          )}
          {connected && (
            <Button
              variant="outlined"
              disabled={Boolean(busy)}
              onClick={checkConnection}
              startIcon={busy === "test" ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {busy === "test" ? "Check pannuthu..." : "Check connection"}
            </Button>
          )}
          {connected && chatgptEnabled && activeProvider !== "chatgpt" && (
            <Button variant="contained" disabled={Boolean(busy)} onClick={() => useForTutor("chatgpt")}>
              {busy === "chatgpt-use" ? "Switch..." : "Use for tutor"}
            </Button>
          )}
          {(connected || chatgpt?.signedIn) && (
            <Button color="error" variant="text" disabled={Boolean(busy)} onClick={signOutChatGpt}>
              {busy === "signout" ? "Sign out aaguthu..." : "Sign out"}
            </Button>
          )}
        </Stack>
      </Card>

      <Card sx={{ p: 2.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography fontWeight={800}>Google Gemini</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              label={geminiConfigured ? "Key saved" : "Key illa"}
              sx={{
                bgcolor: geminiConfigured ? "#ECFDF3" : "#F2F4F7",
                color: geminiConfigured ? "#027A48" : "#475467",
                fontWeight: 800,
              }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={geminiEnabled}
                  disabled={Boolean(busy) || !geminiConfigured}
                  onChange={(event) => setProviderEnabled("gemini", event.target.checked)}
                />
              }
              label={geminiEnabled ? "Enabled" : "Disabled"}
            />
          </Stack>
        </Stack>

        <Typography color="text.secondary" sx={{ mb: 2 }}>
          AI Studio-la API key create panni paste pannunga.{" "}
          <Link href={GEMINI_KEY_URL} target="_blank" rel="noreferrer">
            aistudio.google.com/apikey
          </Link>
        </Typography>

        {geminiConfigured ? (
          <Typography sx={{ mb: 1 }}>
            Saved key: <Box component="span" fontWeight={800}>{gemini?.keyHint}</Box>
            {" · "}Model: <Box component="span" fontWeight={800}>Auto</Box>
            {gemini?.lastUsedModel ? (
              <> (last used: <Box component="span" fontWeight={800}>{gemini.lastUsedModel}</Box>)</>
            ) : null}
          </Typography>
        ) : null}

        <Typography color="text.secondary" fontSize={13} sx={{ mb: 1 }}>
          Model manually choose panna vendaam. Content length/type base-la auto pick + high demand na next model-ku fallback.
          Quality prompt + approved context follow pannum — model change aanalum answer rule same.
        </Typography>

        <TextField
          fullWidth
          margin="dense"
          type="password"
          label={geminiConfigured ? "Replace Gemini API key" : "Gemini API key"}
          value={geminiKey}
          onChange={(event) => setGeminiKey(event.target.value)}
          placeholder="AIza…"
          autoComplete="off"
        />

        {data?.localUsage && geminiEnabled ? (
          <Typography sx={{ mt: 1.5 }} fontSize={13} color="text.secondary">
            Tutor (Gemini): innikku {data.localUsage.todayRequests} requests / {data.localUsage.todayTokens} tokens
            · Student daily AI limit: {data.localUsage.dailyStudentLimit}.
          </Typography>
        ) : null}

        <Stack direction="row" spacing={1} sx={{ mt: 2 }} useFlexGap flexWrap="wrap">
          <Button
            variant="contained"
            disabled={Boolean(busy) || !geminiKey.trim()}
            onClick={saveGeminiKey}
            startIcon={busy === "gemini-save" ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {busy === "gemini-save" ? "Save + test..." : geminiConfigured ? "Replace key" : "Save & connect"}
          </Button>
          {geminiConfigured && (
            <Button
              variant="outlined"
              disabled={Boolean(busy)}
              onClick={checkGemini}
              startIcon={busy === "gemini-test" ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {busy === "gemini-test" ? "Check pannuthu..." : "Check connection"}
            </Button>
          )}
          {geminiConfigured && geminiEnabled && activeProvider !== "gemini" && (
            <Button variant="contained" disabled={Boolean(busy)} onClick={() => useForTutor("gemini")}>
              {busy === "gemini-use" ? "Switch..." : "Use for tutor"}
            </Button>
          )}
          {geminiConfigured && (
            <Button color="error" variant="text" disabled={Boolean(busy)} onClick={clearGemini}>
              {busy === "gemini-clear" ? "Clear aaguthu..." : "Clear key"}
            </Button>
          )}
        </Stack>
      </Card>
    </Box>
  );
}
