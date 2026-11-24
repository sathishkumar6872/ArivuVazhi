import { AiUsage, AppConfig } from "./models.js";
import { HttpError } from "./http.js";

/** Hard-stop AI features when estimated monthly spend on paid providers (OpenAI API, Gemini)
 * reaches the configured budget. ChatGPT-account calls are free under the Plus plan. */
export async function assertAiBudgetAvailable(feature = "ai") {
  const settings = await AppConfig.findOne({ id: "app" }).lean();
  const budget = settings?.monthlyBudgetInr ?? 500;
  if (budget <= 0) return { budget, spent: 0, remaining: 0 };

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const rows = await AiUsage.aggregate([
    // The ChatGPT account (Plus subscription) has no per-use bill, so it never counts.
    { $match: { createdAt: { $gte: start }, provider: { $ne: "chatgpt" } } },
    { $group: { _id: null, inr: { $sum: "$estimatedInr" }, requests: { $sum: 1 } } },
  ]);
  const spent = Number(rows[0]?.inr || 0);
  if (spent >= budget) {
    throw new HttpError(
      429,
      `Monthly AI budget reached (₹${spent.toFixed(0)} / ₹${budget}). ${feature} is paused until next month or budget increase.`,
      "AI_BUDGET",
    );
  }
  return { budget, spent, remaining: Math.max(0, budget - spent) };
}

/** Rough INR estimate when providers do not return billed cost. */
export function estimateAiInr(tokens: number, provider: string) {
  // ChatGPT account sign-in runs on the Plus subscription: no per-use cost.
  if (provider === "chatgpt") return 0;
  if (!tokens) return 0.05;
  const perThousand =
    provider === "gemini" ? 0.15 : provider === "chatgpt" || provider === "openai" ? 0.35 : 0.02;
  return Math.max(0.05, (tokens / 1000) * perThousand);
}
