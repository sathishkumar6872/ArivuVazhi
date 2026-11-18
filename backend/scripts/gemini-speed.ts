/**
 * Gemini speed check for the AI Tutor: sends the same tutor-style question with
 * "thinking" ON (old behaviour) and OFF (new fast mode) and prints the time taken.
 *
 * Talks to the Gemini API only. It does not touch MongoDB or any app settings.
 *
 * Usage (from backend/):
 *   export GEMINI_API_KEY="your-key"
 *   npx tsx scripts/gemini-speed.ts            # picks a flash model automatically
 *   npx tsx scripts/gemini-speed.ts <model>    # or test one model, e.g. gemini-flash-latest
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";
// Same preference order the backend uses in Auto mode.
const PREFERRED = ["gemini-3.5-flash-lite", "gemini-flash-latest", "gemini-3.8-flash", "gemini-2.5-flash-lite"];

const SYSTEM =
  "You are ArivuVazhi, a calm government-exam tutor for TNPSC students. " +
  "Teach one idea at a time with a short example. Reply in clear English.";
const QUESTION = "Explain Article 14 of the Indian Constitution in simple words with one example.";

const key = (process.env.GEMINI_API_KEY || "").trim();
if (!key) {
  console.error('Set GEMINI_API_KEY first, e.g. export GEMINI_API_KEY="your-key"');
  process.exit(1);
}

async function pickModel(): Promise<string> {
  const requested = process.argv[2];
  if (requested) return requested;
  const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
  if (!res.ok) throw new Error(`Could not list models (HTTP ${res.status}). Check the API key.`);
  const data = (await res.json()) as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> };
  const names = (data.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
  return PREFERRED.find((name) => names.includes(name)) || names.find((name) => name.includes("flash")) || names[0];
}

async function ask(model: string, thinkingOff: boolean) {
  const started = Date.now();
  const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: QUESTION }] }],
      generationConfig: { temperature: 0.2, ...(thinkingOff ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
    }),
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const payload = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (!res.ok) return { seconds, ok: false, text: payload.error?.message || `HTTP ${res.status}` };
  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  return { seconds, ok: true, text };
}

const model = await pickModel();
console.log(`Model: ${model}\nQuestion: ${QUESTION}\n`);

for (const [label, off] of [
  ["Thinking ON  (old)", false],
  ["Thinking OFF (new)", true],
] as const) {
  const result = await ask(model, off);
  if (result.ok) {
    console.log(`${label}: ${result.seconds}s  (${result.text.length} chars)`);
    console.log(`  ${result.text.replace(/\s+/g, " ").slice(0, 160)}…\n`);
  } else {
    console.log(`${label}: failed after ${result.seconds}s → ${result.text}\n`);
  }
}
console.log("Run it 2–3 times: the first call can be slower. If OFF is clearly faster, the fix helps.");
console.log("If OFF fails with a 'thinking' error, this model only works with thinking; the backend then retries with it.");
