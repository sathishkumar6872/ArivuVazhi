import { useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "./theme";
import { useLocale } from "./locale";

type IconName = keyof typeof Ionicons.glyphMap;

export function Screen({
  children,
  scroll = true,
  footer,
  padded = true,
  avoidKeyboard = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  padded?: boolean;
  avoidKeyboard?: boolean;
}) {
  const { palette } = useTheme();
  const top = Platform.OS === "android" ? RNStatusBar.currentHeight || 0 : 0;
  const padStyle = padded ? styles.pad : styles.noPad;
  const body = scroll
    ? <ScrollView style={styles.fill} contentContainerStyle={padStyle} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    : <View style={[styles.fill, padStyle]}>{children}</View>;
  const shell = (
    <>
      <StatusBar style={palette.mode === "dark" ? "light" : "dark"} />
      <View style={{ height: top, backgroundColor: palette.bg }} />
      {body}
      {footer}
    </>
  );
  if (!avoidKeyboard) {
    return <View style={[styles.fill, { backgroundColor: palette.bg }]}>{shell}</View>;
  }
  return (
    <KeyboardAvoidingView style={[styles.fill, { backgroundColor: palette.bg }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {shell}
    </KeyboardAvoidingView>
  );
}

export function Header({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={palette.ink} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.headerCenter}>
        <Text style={[styles.headerTitle, { color: palette.ink }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.headerSub, { color: palette.muted }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.headerSide, { alignItems: "flex-end" }]}>{right}</View>
    </View>
  );
}

export function Button({ label, onPress, tone = "primary", disabled, icon, loading, iconOnly }: { label: string; onPress: () => void; tone?: "primary" | "ghost" | "danger" | "outline"; disabled?: boolean; icon?: IconName; loading?: boolean; iconOnly?: boolean }) {
  const { palette } = useTheme();
  const busy = !!loading;
  const background = tone === "primary" ? palette.green : tone === "danger" ? palette.dangerSoft : tone === "outline" ? palette.surface : palette.mint;
  const color = tone === "primary" ? palette.greenInk : tone === "danger" ? palette.danger : palette.primary;
  const border = tone === "outline" ? palette.green : "transparent";
  if (iconOnly && icon) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || busy} onPress={onPress} style={[styles.iconButton, { backgroundColor: background, borderColor: border, opacity: disabled || busy ? 0.45 : 1 }]}>
        {busy ? <ActivityIndicator color={color} /> : <Ionicons name={icon} size={18} color={color} />}
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || busy} onPress={onPress} style={[styles.button, { backgroundColor: background, borderColor: border, opacity: disabled || busy ? 0.45 : 1 }]}>
      {busy ? <ActivityIndicator color={color} /> : null}
      {!busy && icon ? <Ionicons name={icon} size={16} color={color} /> : null}
      <Text style={[styles.buttonText, { color }]}>{busy ? (label.endsWith("...") ? label : `${label}...`) : label}</Text>
    </Pressable>
  );
}

export function IconButton({ label, icon, onPress, tone = "ghost", disabled, loading }: { label: string; icon: IconName; onPress: () => void; tone?: "primary" | "ghost" | "danger" | "outline"; disabled?: boolean; loading?: boolean }) {
  return <Button label={label} icon={icon} onPress={onPress} tone={tone} disabled={disabled} loading={loading} iconOnly />;
}

export function Field({ label, value, onChangeText, placeholder, secure, keyboard, icon, passwordToggle }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; secure?: boolean; keyboard?: "default" | "email-address" | "number-pad"; icon?: IconName; passwordToggle?: boolean }) {
  const { palette } = useTheme();
  const [hidden, setHidden] = useState(!!secure);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.label, { color: palette.muted }]}>{label}</Text>
      <View style={[styles.inputRow, { backgroundColor: palette.surface, borderColor: focused ? palette.green : palette.line }]}>
        {icon ? <Ionicons name={icon} size={18} color={focused ? palette.green : palette.muted} style={{ marginRight: 8 }} /> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder || label}
          placeholderTextColor={palette.muted}
          secureTextEntry={passwordToggle ? hidden : secure}
          keyboardType={keyboard}
          autoCapitalize={keyboard === "email-address" ? "none" : "sentences"}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          underlineColorAndroid="transparent"
          selectionColor={palette.green}
          style={[styles.inputFlex, { color: palette.ink }]}
        />
        {passwordToggle ? (
          <Pressable accessibilityRole="button" accessibilityLabel={hidden ? "Show password" : "Hide password"} onPress={() => setHidden((v) => !v)} hitSlop={8}>
            <Ionicons name={hidden ? "eye-outline" : "eye-off-outline"} size={18} color={focused ? palette.green : palette.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: object }) {
  const { palette } = useTheme();
  const box = [styles.card, { backgroundColor: palette.surface, borderColor: palette.line }, style];
  if (!onPress) return <View style={box}>{children}</View>;
  return <Pressable accessibilityRole="button" onPress={onPress} style={box}>{children}</Pressable>;
}

export function Progress({ value }: { value: number }) {
  const { palette } = useTheme();
  const width = `${Math.max(0, Math.min(100, value))}%` as `${number}%`;
  return (
    <View style={[styles.track, { backgroundColor: palette.line }]}>
      <View style={[styles.bar, { width, backgroundColor: palette.green }]} />
    </View>
  );
}

export function Segment({ options, value, onChange }: { options: string[]; value: string; onChange: (value: string) => void }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: palette.greenSoft, borderRadius: 14, padding: 4, marginBottom: 12 }}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable key={option} accessibilityRole="button" accessibilityLabel={option} onPress={() => onChange(option)} style={{ flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: "center", backgroundColor: active ? palette.primary : "transparent" }}>
            <Text style={{ color: active ? palette.greenInk : palette.muted, fontWeight: "700", fontSize: 13 }}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ScoreRing({ value, caption }: { value: number; caption: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ alignItems: "center", marginVertical: 8 }}>
      <View style={{ width: 148, height: 148, borderRadius: 74, borderWidth: 12, borderColor: palette.accent, backgroundColor: palette.surface, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: palette.primary, fontSize: 34, fontWeight: "800" }}>{value}%</Text>
        <Text style={{ color: palette.muted, marginTop: 2 }}>{caption}</Text>
      </View>
    </View>
  );
}

export function IconTile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width: "31%", alignItems: "center", marginBottom: 14 }}>
      <View style={{ width: 54, height: 54, borderRadius: 18, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
        <Ionicons name={icon} size={22} color={palette.primary} />
      </View>
      <Text style={{ color: palette.ink, fontSize: 12, fontWeight: "700", textAlign: "center" }}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ label, tone = "soft" }: { label: string; tone?: "soft" | "good" | "warn" }) {
  const { palette } = useTheme();
  const background = tone === "good" ? palette.greenSoft : tone === "warn" ? palette.dangerSoft : palette.greenSoft;
  const color = tone === "warn" ? palette.danger : palette.green;
  return <Text style={[styles.pill, { backgroundColor: background, color }]}>{label}</Text>;
}

export function Banner({ message, tone = "error" }: { message: string; tone?: "error" | "info" | "success" }) {
  const { palette } = useTheme();
  const background = tone === "success" ? palette.greenSoft : tone === "info" ? palette.greenSoft : palette.dangerSoft;
  const color = tone === "error" ? palette.danger : palette.green;
  return <Text style={[styles.banner, { backgroundColor: background, color }]}>{message}</Text>;
}

export function Bone({
  width = "100%",
  height = 14,
  radius = 8,
  style,
}: {
  width?: number | `${number}%` | "100%";
  height?: number;
  radius?: number;
  style?: object;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: palette.line,
          opacity: 0.85,
        },
        style,
      ]}
    />
  );
}

export function SkeletonCards({ rows = 4, variant = "list" }: { rows?: number; variant?: "list" | "home" | "quiz" }) {
  const { palette } = useTheme();
  if (variant === "home") {
    return (
      <View accessibilityLabel="Loading" style={{ gap: 12, marginTop: 8 }}>
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.line }]}>
          <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
            <Bone width={92} height={92} radius={46} />
            <View style={{ flex: 1, gap: 8 }}>
              <Bone width="40%" height={12} />
              <Bone width="80%" height={18} />
              <Bone width="60%" height={12} />
            </View>
          </View>
        </View>
        <Bone width="100%" height={64} radius={16} />
        {Array.from({ length: 3 }, (_, index) => (
          <View key={index} style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.line }]}>
            <Bone width="70%" height={16} />
            <Bone width="45%" height={12} style={{ marginTop: 10 }} />
          </View>
        ))}
      </View>
    );
  }
  if (variant === "quiz") {
    return (
      <View accessibilityLabel="Loading" style={{ gap: 12, marginTop: 8 }}>
        <Bone width="35%" height={12} />
        <Bone width="100%" height={8} radius={99} />
        <Bone width="100%" height={72} radius={14} style={{ marginVertical: 8 }} />
        {Array.from({ length: 4 }, (_, index) => (
          <Bone key={index} width="100%" height={52} radius={14} />
        ))}
      </View>
    );
  }
  return (
    <View accessibilityLabel="Loading" style={{ gap: 10, marginTop: 4 }}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.line }]}>
          <Bone width={`${70 - (index % 3) * 8}%` as `${number}%`} height={16} />
          <Bone width="50%" height={12} style={{ marginTop: 10 }} />
          <Bone width="100%" height={8} radius={99} style={{ marginTop: 12 }} />
        </View>
      ))}
    </View>
  );
}

export function Loading({
  label,
  variant = "list",
  rows = 4,
}: {
  label?: string;
  variant?: "list" | "home" | "quiz" | "spinner";
  rows?: number;
}) {
  const { palette } = useTheme();
  if (variant === "spinner") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={palette.green} />
        {label ? <Text style={{ color: palette.muted, marginTop: 8 }}>{label}</Text> : null}
      </View>
    );
  }
  return (
    <View>
      {label ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <ActivityIndicator color={palette.green} />
          <Text style={{ color: palette.muted, flex: 1 }}>{label}</Text>
        </View>
      ) : null}
      <SkeletonCards rows={rows} variant={variant === "list" ? "list" : variant} />
    </View>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.empty}>
      <Ionicons name="leaf-outline" size={28} color={palette.green} />
      <Text style={[styles.emptyTitle, { color: palette.ink }]}>{title}</Text>
      <Text style={{ color: palette.muted, textAlign: "center", lineHeight: 20 }}>{body}</Text>
    </View>
  );
}

export function Choice({ letter, text, state, onPress, disabled }: { letter: string; text: string; state: "idle" | "selected" | "correct" | "wrong"; onPress: () => void; disabled?: boolean }) {
  const { palette } = useTheme();
  const border = state === "correct" ? palette.good : state === "wrong" ? palette.danger : state === "selected" ? palette.green : palette.line;
  const background = state === "correct" ? palette.greenSoft : state === "wrong" ? palette.dangerSoft : palette.surface;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${letter}. ${text}`} disabled={disabled} onPress={onPress} style={[styles.choice, { borderColor: border, backgroundColor: background }]}>
      <View style={[styles.letter, { backgroundColor: state === "idle" ? palette.bg : palette.green }]}>
        <Text style={{ fontWeight: "700", color: state === "idle" ? palette.ink : palette.greenInk }}>{letter}</Text>
      </View>
      <Text style={{ flex: 1, color: palette.ink, lineHeight: 20 }}>{text}</Text>
    </Pressable>
  );
}

export function Dialog({ visible, title, body, confirm, cancel, danger, onConfirm, onCancel }: { visible: boolean; title: string; body: string; confirm: string; cancel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const { palette } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.modalBg, { justifyContent: "center" }]}>
        <View style={[styles.dialog, { backgroundColor: palette.surface }]}>
          <Text style={[styles.emptyTitle, { color: palette.ink }]}>{title}</Text>
          <Text style={{ color: palette.muted, lineHeight: 20, marginBottom: 16 }}>{body}</Text>
          <Button label={confirm} tone={danger ? "danger" : "primary"} onPress={onConfirm} />
          {cancel ? <Button label={cancel} tone="ghost" onPress={onCancel} /> : null}
        </View>
      </View>
    </Modal>
  );
}

export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBg} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: palette.surface }]} onPress={() => undefined}>
          <View style={styles.sheetHandle} />
          <Text style={[styles.emptyTitle, { color: palette.ink, marginBottom: 12 }]}>{title}</Text>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function TabBar({ tab, onChange }: { tab: string; onChange: (tab: "home" | "exams" | "practice" | "tutor" | "profile") => void }) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const items: Array<{ id: "home" | "exams" | "practice" | "tutor" | "profile"; icon: IconName; label: string }> = [
    { id: "home", icon: "home", label: "Home" },
    { id: "exams", icon: "library", label: "Exams" },
    { id: "practice", icon: "create", label: "Practice" },
    { id: "tutor", icon: "chatbubble-ellipses", label: "AI Tutor" },
    { id: "profile", icon: "person", label: "Profile" },
  ];
  return (
    <View style={[styles.tabs, { backgroundColor: palette.surface, borderTopColor: palette.line }]}>
      {items.map((item) => {
        const active = tab === item.id;
        return (
          <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => onChange(item.id)} style={styles.tab}>
            <Ionicons name={active ? item.icon : `${item.icon}-outline` as IconName} size={21} color={active ? palette.primary : palette.muted} />
            <Text style={{ fontSize: 10, fontWeight: "700", color: active ? palette.primary : palette.muted }}>{t(item.label)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Wordmark({ light = false, centered = false }: { light?: boolean; centered?: boolean }) {
  const { palette } = useTheme();
  if (centered) {
    return (
      <View style={{ alignItems: "center", gap: 8 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: light ? "rgba(255,255,255,0.16)" : palette.greenSoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="book" size={28} color={light ? "#FFFFFF" : palette.green} />
        </View>
        <Text style={{ fontSize: 22, fontWeight: "800", color: light ? "#FFFFFF" : palette.primary }}>
          Arivu<Text style={{ color: light ? palette.highlight : palette.green }}>Vazhi</Text>
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.wordmark}>
      <View style={[styles.mark, { backgroundColor: light ? "rgba(255,255,255,0.18)" : palette.green }]}>
        <Ionicons name="book" size={16} color={light ? "#FFFFFF" : palette.greenInk} />
      </View>
      <Text style={[styles.word, { color: light ? "#FFFFFF" : palette.primary }]}>
        Arivu<Text style={{ color: light ? palette.highlight : palette.green }}>Vazhi</Text>
      </Text>
    </View>
  );
}

export function Dots({ count, index }: { count: number; index: number }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 6, justifyContent: "center", marginBottom: 14 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: i === index ? 18 : 7, height: 7, borderRadius: 99, backgroundColor: i === index ? palette.accent : palette.line }} />
      ))}
    </View>
  );
}

export function useToggle(initial = false) {
  const [open, setOpen] = useState(initial);
  return { open, show: () => setOpen(true), hide: () => setOpen(false) };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: 16, paddingBottom: 28 },
  noPad: { flex: 1, padding: 0 },
  header: { flexDirection: "row", alignItems: "center", minHeight: 52, marginBottom: 8 },
  headerSide: { width: 36 },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  headerSub: { fontSize: 12, marginTop: 2 },
  button: { minHeight: 50, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 8, paddingHorizontal: 16 },
  iconButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  buttonText: { fontWeight: "700", fontSize: 15 },
  fieldWrap: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  inputRow: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 2, minHeight: 50, flexDirection: "row", alignItems: "center" },
  inputFlex: { flex: 1, paddingVertical: 12, fontSize: 16, ...(Platform.OS === "web" ? { outlineWidth: 0 } : {}) },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
  track: { height: 6, borderRadius: 99, overflow: "hidden", marginTop: 8 },
  bar: { height: 6, borderRadius: 99 },
  pill: { overflow: "hidden", alignSelf: "flex-start", fontSize: 12, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 },
  banner: { borderRadius: 12, padding: 12, marginBottom: 10, lineHeight: 20 },
  center: { paddingVertical: 32, alignItems: "center" },
  empty: { alignItems: "center", paddingVertical: 28, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  choice: { flexDirection: "row", gap: 10, alignItems: "center", borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8 },
  letter: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  modalBg: { flex: 1, backgroundColor: "rgba(18,22,20,0.45)", justifyContent: "flex-end" },
  dialog: { margin: 20, marginBottom: "auto", marginTop: "auto", borderRadius: 18, padding: 18 },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28, maxHeight: "80%" },
  sheetHandle: { width: 40, height: 4, borderRadius: 99, backgroundColor: "#D5D0C8", alignSelf: "center", marginBottom: 12 },
  tabs: { flexDirection: "row", borderTopWidth: 1, paddingTop: 6, paddingBottom: 10 },
  tab: { flex: 1, alignItems: "center", gap: 2 },
  wordmark: { flexDirection: "row", alignItems: "center", gap: 8 },
  mark: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  word: { fontSize: 18, fontWeight: "700" },
});
