"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, TextField, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Eyebrow } from "@/components/Shell";
import { PageSkeleton } from "@/components/PageSkeleton";
import { useAuth } from "@/lib/auth";

type Message = { role: "user" | "assistant"; content: string; sources?: string[] };
type Conversation = { id: string; title: string; preview: string };

export default function TutorPage() {
  const { user } = useAuth();
  const [language, setLanguage] = useState<"en" | "ta" | "tanglish">(user?.language === "ta" ? "ta" : "en");
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "Vanakkam! Ask in Tamil, English or Tanglish. I will answer from approved learning notes." }]);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadList(q = "") {
    const items = await api<Conversation[]>(`/tutor/conversations${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    setConversations(items);
  }

  useEffect(() => { loadList().catch((err) => { setError(err.message); setConversations([]); }); }, []);

  async function openConversation(id: string) {
    const item = await api<{ id: string; messages: Message[] }>(`/tutor/conversations/${id}`);
    setConversationId(item.id);
    setMessages(item.messages);
  }

  async function send() {
    if (!text.trim()) return;
    const message = text.trim();
    setText("");
    setMessages((current) => [...current, { role: "user", content: message }]);
    setBusy(true);
    setError("");
    try {
      const data = await api<{ conversationId: string; reply: string; sources: Array<{ title: string }> }>("/tutor/messages", {
        method: "POST",
        body: JSON.stringify({ message, conversationId: conversationId || undefined, language, examId: user?.primaryExamId }),
      });
      setConversationId(data.conversationId);
      setMessages((current) => [...current, { role: "assistant", content: data.reply, sources: data.sources.map((source) => source.title) }]);
      await loadList(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tutor is unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box>
      <Eyebrow>LEARN WITH GUIDANCE</Eyebrow>
      <Typography variant="h1">AI Tutor</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Answers stay inside approved notes. Official dates and answer keys are not invented.</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "280px 1fr" }, gap: 2 }}>
        <Card sx={{ p: 2 }}>
          <TextField size="small" fullWidth placeholder="Search history" value={query} onChange={(event) => { setQuery(event.target.value); loadList(event.target.value).catch(() => undefined); }} />
          <Button sx={{ mt: 1 }} onClick={() => { setConversationId(""); setMessages([{ role: "assistant", content: "New conversation. What shall we learn?" }]); }}>New chat</Button>
          {!conversations ? <PageSkeleton rows={3} /> : conversations.map((item) => (
            <Button key={item.id} fullWidth sx={{ justifyContent: "flex-start", mt: 1 }} onClick={() => openConversation(item.id)}>{item.title}</Button>
          ))}
        </Card>
        <Card sx={{ p: 2 }}>
          <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
            {(["ta", "en", "tanglish"] as const).map((item) => (
              <Button key={item} size="small" variant={language === item ? "contained" : "outlined"} onClick={() => setLanguage(item)}>{item}</Button>
            ))}
          </Box>
          <Box sx={{ display: "grid", gap: 1, minHeight: 280 }}>
            {messages.map((message, index) => (
              <Box key={index} sx={{ justifySelf: message.role === "user" ? "end" : "start", maxWidth: "78%", bgcolor: message.role === "user" ? "#5B4DFF" : "white", color: message.role === "user" ? "white" : "text.primary", border: message.role === "user" ? 0 : "1px solid #EEF1F6", p: 1.6, borderRadius: message.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px" }}>
                <Typography sx={{ whiteSpace: "pre-wrap" }}>{message.content}</Typography>
                {!!message.sources?.length && <Typography fontSize={12} sx={{ mt: 1 }}>Sources: {message.sources.join(", ")}</Typography>}
              </Box>
            ))}
          </Box>
          <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
            <TextField fullWidth placeholder="Type your question..." value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") send(); }} />
            <Button variant="contained" disabled={busy} onClick={send}>Send</Button>
          </Box>
        </Card>
      </Box>
    </Box>
  );
}
