import { Linking, Text, View, type TextStyle, type StyleProp } from "react-native";
import { useTheme } from "./theme";

type Tone = "ink" | "onGreen";

type InlinePart =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; label: string; href: string };

function cleanHref(href: string) {
  try {
    const url = new URL(href);
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch {
    return href;
  }
}

function parseInline(input: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const pattern = /(\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input))) {
    if (match.index > last) parts.push({ type: "text", value: input.slice(last, match.index) });
    const token = match[0];
    const mdLink = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(token);
    if (mdLink) {
      parts.push({ type: "link", label: mdLink[1], href: cleanHref(mdLink[2]) });
    } else if (token.startsWith("**") && token.endsWith("**")) {
      parts.push({ type: "bold", value: token.slice(2, -2) });
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push({ type: "code", value: token.slice(1, -1) });
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push({ type: "italic", value: token.slice(1, -1) });
    } else {
      parts.push({ type: "text", value: token });
    }
    last = match.index + token.length;
  }
  if (last < input.length) parts.push({ type: "text", value: input.slice(last) });
  return parts.length ? parts : [{ type: "text", value: input }];
}

function InlineText({
  text,
  tone,
  baseStyle,
}: {
  text: string;
  tone: Tone;
  baseStyle?: StyleProp<TextStyle>;
}) {
  const { palette } = useTheme();
  const color = tone === "onGreen" ? palette.greenInk : palette.ink;
  const linkColor = tone === "onGreen" ? palette.mint : palette.green;
  const mutedBg = tone === "onGreen" ? "rgba(255,255,255,0.18)" : palette.greenSoft;
  return (
    <Text style={[{ color, fontSize: 15, lineHeight: 22 }, baseStyle]}>
      {parseInline(text).map((part, index) => {
        if (part.type === "bold") {
          return (
            <Text key={index} style={{ fontWeight: "800", color }}>
              {part.value}
            </Text>
          );
        }
        if (part.type === "italic") {
          return (
            <Text key={index} style={{ fontStyle: "italic", color }}>
              {part.value}
            </Text>
          );
        }
        if (part.type === "code") {
          return (
            <Text
              key={index}
              style={{
                fontFamily: "monospace",
                backgroundColor: mutedBg,
                color,
                borderRadius: 4,
                paddingHorizontal: 4,
                fontSize: 13,
              }}
            >
              {part.value}
            </Text>
          );
        }
        if (part.type === "link") {
          return (
            <Text
              key={index}
              style={{ color: linkColor, fontWeight: "700", textDecorationLine: "underline" }}
              onPress={() => Linking.openURL(part.href).catch(() => undefined)}
            >
              {part.label}
            </Text>
          );
        }
        return <Text key={index}>{part.value}</Text>;
      })}
    </Text>
  );
}

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "bullet"; text: string }
  | { type: "number"; n: string; text: string }
  | { type: "quote"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "spacer" };

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      blocks.push({ type: "spacer" });
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, text: heading[2] });
      continue;
    }
    const bullet = /^[-*•]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      blocks.push({ type: "bullet", text: bullet[1] });
      continue;
    }
    const numbered = /^(\d+)[.)]\s+(.+)$/.exec(trimmed);
    if (numbered) {
      blocks.push({ type: "number", n: numbered[1], text: numbered[2] });
      continue;
    }
    const quote = /^>\s?(.+)$/.exec(trimmed);
    if (quote) {
      blocks.push({ type: "quote", text: quote[1] });
      continue;
    }
    blocks.push({ type: "paragraph", text: trimmed });
  }
  return blocks;
}

/** Renders tutor markdown: **bold**, *italic*, `code`, lists, headings. */
export function RichText({
  content,
  tone = "ink",
}: {
  content: string;
  tone?: Tone;
}) {
  const { palette } = useTheme();
  const accent = tone === "onGreen" ? palette.mint : palette.green;
  const blocks = parseBlocks(content || "");

  return (
    <View style={{ gap: 6 }}>
      {blocks.map((block, index) => {
        if (block.type === "spacer") return <View key={index} style={{ height: 4 }} />;
        if (block.type === "heading") {
          const size = block.level === 1 ? 18 : block.level === 2 ? 16 : 15;
          return (
            <InlineText
              key={index}
              text={block.text}
              tone={tone}
              baseStyle={{ fontWeight: "800", fontSize: size, lineHeight: size + 6, marginTop: index ? 4 : 0 }}
            />
          );
        }
        if (block.type === "bullet") {
          return (
            <View key={index} style={{ flexDirection: "row", gap: 8, paddingLeft: 2 }}>
              <Text style={{ color: accent, fontWeight: "800", lineHeight: 22 }}>•</Text>
              <View style={{ flex: 1 }}>
                <InlineText text={block.text} tone={tone} />
              </View>
            </View>
          );
        }
        if (block.type === "number") {
          return (
            <View key={index} style={{ flexDirection: "row", gap: 8, paddingLeft: 2 }}>
              <Text style={{ color: accent, fontWeight: "800", lineHeight: 22, minWidth: 18 }}>{block.n}.</Text>
              <View style={{ flex: 1 }}>
                <InlineText text={block.text} tone={tone} />
              </View>
            </View>
          );
        }
        if (block.type === "quote") {
          return (
            <View
              key={index}
              style={{
                borderLeftWidth: 3,
                borderLeftColor: accent,
                paddingLeft: 10,
                paddingVertical: 2,
                backgroundColor: tone === "onGreen" ? "rgba(255,255,255,0.08)" : palette.greenSoft,
                borderRadius: 6,
              }}
            >
              <InlineText text={block.text} tone={tone} baseStyle={{ fontStyle: "italic" }} />
            </View>
          );
        }
        return <InlineText key={index} text={block.text} tone={tone} />;
      })}
    </View>
  );
}
