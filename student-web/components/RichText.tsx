"use client";

import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

type Tone = "ink" | "onPrimary";

function cleanHref(href: string) {
  try {
    const url = new URL(href);
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch {
    return href;
  }
}

function parseInline(input: string, tone: Tone): ReactNode[] {
  const pattern = /(\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(input))) {
    if (match.index > last) nodes.push(input.slice(last, match.index));
    const token = match[0];
    const mdLink = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(token);
    if (mdLink) {
      nodes.push(
        <Box
          key={key++}
          component="a"
          href={cleanHref(mdLink[2])}
          target="_blank"
          rel="noreferrer"
          sx={{ color: tone === "onPrimary" ? "#A7F3D0" : "primary.main", fontWeight: 700, textDecoration: "underline" }}
        >
          {mdLink[1]}
        </Box>,
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <Box key={key++} component="strong" sx={{ fontWeight: 800 }}>
          {token.slice(2, -2)}
        </Box>,
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <Box
          key={key++}
          component="code"
          sx={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "0.9em",
            px: 0.6,
            py: 0.1,
            borderRadius: 1,
            bgcolor: tone === "onPrimary" ? "rgba(255,255,255,0.18)" : "rgba(11,61,46,0.08)",
          }}
        >
          {token.slice(1, -1)}
        </Box>,
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <Box key={key++} component="em" sx={{ fontStyle: "italic" }}>
          {token.slice(1, -1)}
        </Box>,
      );
    } else {
      nodes.push(token);
    }
    last = match.index + token.length;
  }
  if (last < input.length) nodes.push(input.slice(last));
  return nodes;
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
    const trimmed = raw.trim();
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
export function RichText({ content, tone = "ink" }: { content: string; tone?: Tone }) {
  const color = tone === "onPrimary" ? "#fff" : "text.primary";
  const accent = tone === "onPrimary" ? "#A7F3D0" : "primary.main";

  return (
    <Box sx={{ display: "grid", gap: 0.75 }}>
      {parseBlocks(content || "").map((block, index) => {
        if (block.type === "spacer") return <Box key={index} sx={{ height: 4 }} />;
        if (block.type === "heading") {
          const fontSize = block.level === 1 ? 18 : block.level === 2 ? 16 : 15;
          return (
            <Typography key={index} sx={{ color, fontWeight: 800, fontSize, lineHeight: 1.35 }}>
              {parseInline(block.text, tone)}
            </Typography>
          );
        }
        if (block.type === "bullet") {
          return (
            <Box key={index} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
              <Typography sx={{ color: accent, fontWeight: 800, lineHeight: 1.55 }}>•</Typography>
              <Typography sx={{ color, fontSize: 15, lineHeight: 1.55, flex: 1 }}>{parseInline(block.text, tone)}</Typography>
            </Box>
          );
        }
        if (block.type === "number") {
          return (
            <Box key={index} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
              <Typography sx={{ color: accent, fontWeight: 800, lineHeight: 1.55, minWidth: 18 }}>{block.n}.</Typography>
              <Typography sx={{ color, fontSize: 15, lineHeight: 1.55, flex: 1 }}>{parseInline(block.text, tone)}</Typography>
            </Box>
          );
        }
        if (block.type === "quote") {
          return (
            <Box
              key={index}
              sx={{
                borderLeft: "3px solid",
                borderColor: accent,
                pl: 1.25,
                py: 0.5,
                bgcolor: tone === "onPrimary" ? "rgba(255,255,255,0.1)" : "rgba(11,61,46,0.06)",
                borderRadius: 1,
              }}
            >
              <Typography sx={{ color, fontStyle: "italic", fontSize: 15, lineHeight: 1.55 }}>
                {parseInline(block.text, tone)}
              </Typography>
            </Box>
          );
        }
        return (
          <Typography key={index} sx={{ color, fontSize: 15, lineHeight: 1.55 }}>
            {parseInline(block.text, tone)}
          </Typography>
        );
      })}
    </Box>
  );
}
