import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { api, type Student } from "./api";
import { useKeyboardLift } from "./keyboard";
import type { Route } from "./nav";
import { useTheme } from "./theme";
import { Ionicons } from "@expo/vector-icons";
import { RichText } from "./rich-text";
import { Banner, Button, Card, ColorIcon, Empty, Header, IconButton, Loading, Screen, Segment, type Accent } from "./ui";

const starters: Array<{ label: string; icon: keyof typeof Ionicons.glyphMap; accent: Accent; text: string }> = [
  { label: "Explain", icon: "book", accent: "green", text: "Explain this topic" },
  { label: "Practice", icon: "help-circle", accent: "orange", text: "Give one practice question" },
  { label: "Revise", icon: "refresh", accent: "purple", text: "Revise the last point" },
];

export function TutorScreen({ user, go }: { user: Student; go: (route: Route) => void }) {
  const { palette } = useTheme();
  const [items, setItems] = useState<any[] | null>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("Current exam");
  const [error, setError] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  function load(q = query) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (scope === "Current exam" && user.primaryExamId) params.set("examId", user.primaryExamId);
    const search = params.toString() ? `?${params}` : "";
    api<any[]>(`/tutor/conversations${search}`).then(setItems).catch((err) => setError(err.message));
  }
  useEffect(() => { load(""); }, [scope]);
  return (
    <Screen>
      <Header title="AI Tutor" />
      {error ? <Banner message={error} /> : null}
      <View style={{ backgroundColor: palette.primary, borderRadius: 22, padding: 16, marginBottom: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="sparkles" size={24} color={palette.highlight} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 17, fontWeight: "800" }}>ArivuVazhi AI Tutor</Text>
            <Text style={{ color: palette.mint, marginTop: 4, lineHeight: 18, fontSize: 13 }}>Tamil, English or Tanglish. Grounded in approved notes.</Text>
          </View>
        </View>
        <Button label="Start chat" icon="arrow-forward" onPress={() => go({ name: "chat" })} />
      </View>

      <Text style={{ color: palette.primary, fontWeight: "800", marginBottom: 10 }}>Quick prompts</Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
        {starters.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={item.text}
            onPress={() => go({ name: "chat", starter: item.text })}
            style={{ flex: 1, alignItems: "center", backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 4 }}
          >
            <View style={{ marginBottom: 6 }}>
              <ColorIcon icon={item.icon} accent={item.accent} size={40} />
            </View>
            <Text style={{ color: palette.ink, fontSize: 11, fontWeight: "700", textAlign: "center" }}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <Segment options={["Current exam", "All history"]} value={scope} onChange={setScope} />
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 8, marginTop: 4 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => load()}
          placeholder="Search conversations"
          placeholderTextColor={palette.muted}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          underlineColorAndroid="transparent"
          selectionColor={palette.green}
          style={{ flex: 1, minWidth: 0, borderWidth: 1, borderColor: searchFocused ? palette.green : palette.line, backgroundColor: palette.surface, color: palette.ink, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12 }}
        />
        <IconButton label="Search" icon="search" tone="ghost" onPress={() => load()} />
      </View>
      {!items && !error ? <Loading /> : null}
      {items?.map((item) => (
        <Card key={item.id} onPress={() => go({ name: "chat", conversationId: item.id })}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: palette.greenSoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="chatbubble-outline" size={16} color={palette.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: palette.ink, fontWeight: "700" }} numberOfLines={1}>{item.title}</Text>
              <Text style={{ color: palette.muted }} numberOfLines={2}>{item.preview}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={palette.muted} />
          </View>
        </Card>
      ))}
      {items && !items.length && <Empty title="No conversations yet" body="Start a chat with one doubt." />}
    </Screen>
  );
}

export function ChatScreen({ user, conversationId, starter, back }: { user: Student; conversationId?: string; starter?: string; back: () => void }) {
  const { palette } = useTheme();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const keyboardLift = useKeyboardLift();
  const [messages, setMessages] = useState<Array<{ role: string; content: string; sources?: string[] }>>([]);
  const [thread, setThread] = useState(conversationId || "");
  const [text, setText] = useState(starter || "");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [rated, setRated] = useState<Record<number, string>>({});
  const [composerFocused, setComposerFocused] = useState(false);
  useEffect(() => {
    if (!conversationId) return;
    api<any>(`/tutor/conversations/${conversationId}`).then((conversation) => {
      setThread(conversation.id);
      setMessages((conversation.messages || []).map((message: any) => ({ role: message.role, content: message.content, sources: message.sources })));
    }).catch((err) => setError(err.message));
  }, [conversationId]);
  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length, sending, keyboardLift]);
  async function send(message = text.trim()) {
    if (!message || sending) return;
    setText("");
    setError("");
    setSending(true);
    setMessages((current) => [...current, { role: "user", content: message }]);
    try {
      const data = await api<any>("/tutor/messages", {
        method: "POST",
        body: JSON.stringify({ message, conversationId: thread || undefined, examId: user.primaryExamId }),
      });
      setThread(data.conversationId);
      setMessages((current) => [...current, { role: "assistant", content: data.reply, sources: (data.sources || []).map((source: any) => source.title || source) }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tutor is unavailable");
    } finally {
      setSending(false);
    }
  }
  return (
    <Screen scroll={false} padded={false} avoidKeyboard={false}>
      <View style={{ flex: 1, minHeight: 0 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Header title="Tutor" onBack={back} />
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
        >
          {messages.map((message, index) => (
            <View key={`${message.role}-${index}`} style={{ alignSelf: message.role === "user" ? "flex-end" : "flex-start", maxWidth: "90%", marginBottom: 10 }}>
              <View
                style={{
                  backgroundColor: message.role === "user" ? palette.green : palette.surface,
                  borderRadius: message.role === "user" ? 16 : 18,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderWidth: message.role === "user" ? 0 : 1,
                  borderColor: palette.line,
                  borderBottomLeftRadius: message.role === "assistant" ? 6 : 16,
                  borderBottomRightRadius: message.role === "user" ? 6 : 16,
                  shadowColor: palette.shadow,
                  shadowOpacity: message.role === "assistant" ? 0.08 : 0,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: message.role === "assistant" ? 1 : 0,
                }}
              >
                {message.role === "assistant" ? (
                  <RichText content={message.content} tone="ink" />
                ) : (
                  <Text style={{ color: palette.greenInk, lineHeight: 22, fontSize: 15 }}>{message.content}</Text>
                )}
                {message.sources?.length ? (
                  <Text style={{ color: palette.muted, marginTop: 8, fontSize: 12, fontWeight: "600" }}>
                    Sources: {message.sources.join(", ")}
                  </Text>
                ) : null}
              </View>
              {message.role === "assistant" && (
                <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                  <IconButton
                    label="Helpful"
                    icon={rated[index] === "Helpful" ? "thumbs-up" : "thumbs-up-outline"}
                    tone={rated[index] === "Helpful" ? "primary" : "ghost"}
                    disabled={Boolean(rated[index])}
                    onPress={() => setRated((current) => ({ ...current, [index]: "Helpful" }))}
                  />
                  <IconButton
                    label="Needs review"
                    icon={rated[index] === "Needs review" ? "flag" : "flag-outline"}
                    tone={rated[index] === "Needs review" ? "danger" : "ghost"}
                    disabled={Boolean(rated[index])}
                    onPress={async () => {
                      setRated((current) => ({ ...current, [index]: "Needs review" }));
                      await api("/support/tickets", { method: "POST", body: JSON.stringify({ subject: "AI Tutor answer review", body: `Conversation ${thread || "new"}: ${message.content.slice(0, 500)}`, category: "ai_feedback" }) });
                    }}
                  />
                </View>
              )}
            </View>
          ))}
          {!messages.length && <Empty title="Ask one doubt" body="Try “Explain Article 14 in Tanglish” or “Give me one practice question on Fundamental Rights”." />}
          {error ? <Banner message={error} /> : null}
        </ScrollView>

        {/* Text-only composer for now (image / document / voice deferred). */}
        <View style={{ marginBottom: keyboardLift, backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.line }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Ask anything"
              placeholderTextColor={palette.muted}
              onFocus={() => {
                setComposerFocused(true);
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
              }}
              onBlur={() => setComposerFocused(false)}
              onSubmitEditing={() => send()}
              returnKeyType="send"
              blurOnSubmit={false}
              underlineColorAndroid="transparent"
              selectionColor={palette.green}
              textAlignVertical="center"
              style={{ flex: 1, minWidth: 0, height: 40, color: palette.ink, backgroundColor: palette.bg, borderRadius: 12, borderWidth: 1, borderColor: composerFocused ? palette.green : palette.line, paddingHorizontal: 12, paddingVertical: 0 }}
            />
            <IconButton label="Send" icon="send" tone="primary" loading={sending} onPress={() => send()} />
          </View>
        </View>
      </View>
    </Screen>
  );
}
