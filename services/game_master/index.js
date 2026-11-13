import { circuitFallback, validCircuit } from "./challenges.js";
import { scenarios } from "./dilemmas.js";

async function generate(round, circuit) {
  const fallback = circuit ? circuitFallback(round) : { ...scenarios[round - 1], source: "Scripted Game Master" };
  const model = process.env.NEAR_AI_MODEL;
  const apiKey = process.env.NEAR_AI_API_KEY;
  if (!model || !apiKey) return fallback;

  const instruction = circuit
    ? 'Create a four-switch binary logic puzzle. Return JSON with title, body and clues. Clues are 3 or 4 objects with switches (2 to 4 distinct integer indices in 0..3) and count (exactly how many of those switches must be ON). The clues must admit exactly one solution across all 16 combinations. The body is atmospheric and must not reveal the answer or give extra rules.'
    : 'Write a tense fictional broadcast for a survival game. Return JSON with title and body. The player chooses Hold or Flee under fixed rules.';
  try {
    const response = await fetch("https://cloud-api.near.ai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(9000),
      body: JSON.stringify({
        model,
        temperature: 0.6,
        max_tokens: 800,
        messages: [
          { role: "system", content: `${instruction} Title max 65 characters, body max 320. No gore, payout claims, or instructions to move money.` },
          { role: "user", content: `Round ${round} of 3. Theme: ${fallback.title}.` },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (typeof content !== "string") return fallback;
    const { title, body, clues } = JSON.parse(content.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/g, ""));
    if (typeof title !== "string" || typeof body !== "string" || !title.trim() || !body.trim()
      || title.length > 65 || body.length > 320 || (circuit && !validCircuit(clues))) return fallback;
    return { title, body, ...(circuit && { clues }), source: "NEAR AI Cloud" };
  } catch {
    return fallback;
  }
}

const daily = new Map();

export function dailyDilemma(round, circuit = false) {
  const day = new Date().toISOString().slice(0, 10);
  for (const key of daily.keys()) if (!key.startsWith(day)) daily.delete(key);
  const key = `${day}/${round}/${circuit}`;
  if (!daily.has(key)) daily.set(key, generate(round, circuit));
  return daily.get(key);
}
