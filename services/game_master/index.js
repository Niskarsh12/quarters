import { scenarios } from "./dilemmas.js";

export async function generateDilemma(round) {
  const fallback = { ...scenarios[round - 1], source: "Scripted Game Master" };
  const model = process.env.NEAR_AI_MODEL;
  const apiKey = process.env.NEAR_AI_API_KEY;
  if (!model || !apiKey) return fallback;

  try {
    const response = await fetch("https://cloud-api.near.ai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(9000),
      body: JSON.stringify({
        model,
        temperature: 0.8,
        max_tokens: 300,
        messages: [
          { role: "system", content: 'Write tense fictional broadcasts for a survival game. Return JSON only with string fields "title" (max 65 characters) and "body" (max 320). No gore, payout claims, numbers about stakes, instructions to move money, or new rules. The player always chooses Hold or Flee under fixed rules.' },
          { role: "user", content: `Write the broadcast for round ${round} of 3. Theme: ${fallback.title}.` },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (typeof content !== "string") return fallback;
    const { title, body } = JSON.parse(content.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/g, ""));
    if (typeof title !== "string" || typeof body !== "string" || !title.trim() || !body.trim()
      || title.length > 65 || body.length > 320) return fallback;
    return { title, body, source: "NEAR AI Cloud" };
  } catch {
    return fallback;
  }
}

const daily = new Map();

export function dailyDilemma(round) {
  const day = new Date().toISOString().slice(0, 10);
  for (const key of daily.keys()) if (!key.startsWith(day)) daily.delete(key);
  const key = `${day}/${round}`;
  if (!daily.has(key)) daily.set(key, generateDilemma(round));
  return daily.get(key);
}
