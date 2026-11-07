import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { api, type Student } from "./api";
import { useKeyboardLift } from "./keyboard";
import type { Route } from "./nav";
import { useTheme } from "./theme";
import { Ionicons } from "@expo/vector-icons";
import { Banner, Button, Card, Empty, Header, IconButton, Loading, Screen, Segment } from "./ui";

const starters: Array<{ label: string; icon: keyof typeof Ionicons.glyphMap; text: string }> = [
  { label: "Explain", icon: "book-outline", text: "Explain this topic" },
  { label: "Practice", icon: "help-circle-outline", text: "Give one practice question" },
  { label: "Revise", icon: "refresh-outline", text: "Revise the last point" },
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
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
              <Ionicons name={item.icon} size={18} color={palette.primary} />
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
  const scrollRef = useRef<ScrollView>(null);
  const keyboardLift = useKeyboardLift();
  const [messages, setMessages] = useState<Array<{ role: string; content: string; sources?: string[] }>>([]);
  const [thread, setThread] = useState(conversationId || "");
  const [text, setText] = useState(starter || "");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [rated, setRated] = useState<Record<number, string>>({});
  const [attachment, setAttachment] = useState<{ name: string; mimeType: string; base64: string } | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
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
      const data = await api<any>("/tutor/messages", { method: "POST", body: JSON.stringify({ message, conversationId: thread || undefined, examId: user.primaryExamId, attachment: attachment || undefined }) });
      setThread(data.conversationId);
      setMessages((current) => [...current, { role: "assistant", content: data.reply, sources: (data.sources || []).map((source: any) => source.title || source) }]);
      setAttachment(null);
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
            <View key={`${message.role}-${index}`} style={{ alignSelf: message.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%", marginBottom: 10 }}>
              <View style={{ backgroundColor: message.role === "user" ? palette.green : palette.surface, borderRadius: 16, padding: 12, borderWidth: message.role === "user" ? 0 : 1, borderColor: palette.line }}>
                <Text style={{ color: message.role === "user" ? palette.greenInk : palette.ink, lineHeight: 20 }}>{message.content}</Text>
                {message.sources?.length ? <Text style={{ color: palette.muted, marginTop: 6, fontSize: 12 }}>Sources: {message.sources.join(", ")}</Text> : null}
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

        {/* WhatsApp-style: dock lifts with keyboard so input sits flush above it */}
        <View style={{ marginBottom: keyboardLift, backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.line }}>
          {attachment ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Ionicons name="attach" size={16} color={palette.green} />
              <Text style={{ flex: 1, minWidth: 0, color: palette.green, fontWeight: "700" }} numberOfLines={1}>{attachment.name}</Text>
              <IconButton label="Remove attachment" icon="close" tone="ghost" onPress={() => setAttachment(null)} />
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }}>
            <IconButton
              label="Attach image"
              icon="image-outline"
              tone="ghost"
              onPress={async () => {
                const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.35 });
                if (result.canceled) return;
                const asset = result.assets[0];
                if (!asset.base64 || asset.base64.length > 780000) { setError("Choose a smaller image."); return; }
                setAttachment({ name: asset.fileName || "question.jpg", mimeType: asset.mimeType || "image/jpeg", base64: asset.base64 });
              }}
            />
            <IconButton
              label="Attach document"
              icon="document-outline"
              tone="ghost"
              onPress={async () => {
                const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "text/plain"], copyToCacheDirectory: true, base64: true });
                if (result.canceled) return;
                const asset = result.assets[0];
                const base64 = asset.base64 || await new File(asset.uri).base64();
                if (base64.length > 780000) { setError("Choose a PDF or text file smaller than 600 KB."); return; }
                setAttachment({ name: asset.name, mimeType: asset.mimeType || "application/pdf", base64 });
              }}
            />
            <IconButton
              label={recorderState.isRecording ? "Stop voice question" : "Record voice question"}
              icon={recorderState.isRecording ? "stop" : "mic-outline"}
              tone={recorderState.isRecording ? "danger" : "ghost"}
              loading={transcribing}
              onPress={async () => {
                if (!recorderState.isRecording) {
                  const permission = await AudioModule.requestRecordingPermissionsAsync();
                  if (!permission.granted) { setError("Microphone permission was not granted."); return; }
                  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
                  await recorder.prepareToRecordAsync();
                  recorder.record();
                  return;
                }
                await recorder.stop();
                if (!recorder.uri) return;
                const base64 = await new File(recorder.uri).base64();
                if (base64.length > 780000) { setError("Voice question is too long. Record a shorter question."); return; }
                setTranscribing(true);
                try {
                  const result = await api<{ text: string }>("/tutor/transcribe", { method: "POST", body: JSON.stringify({ name: "question.m4a", mimeType: "audio/mp4", base64 }) });
                  setText(result.text);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not transcribe");
                } finally {
                  setTranscribing(false);
                }
              }}
            />
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
