import { z } from "zod";

const xml = (text) => text.replace(/[<>&]/g, (character) => ({
  "<": "&lt;", ">": "&gt;", "&": "&amp;",
})[character]);

function renderChart({ data }) {
  const maximum = Math.max(1, ...data.map(({ value }) => value));
  const bars = data.map(({ label, value }, index) => {
    const y = 30 + index * 32;
    const width = Math.round(260 * value / maximum);
    return `<text x="12" y="${y}">${xml(label)}</text><rect x="155" y="${y - 13}" width="${width}" height="18"/><text x="${165 + width}" y="${y}">${value}</text>`;
  }).join("");
  return {
    kind: "chart",
    mimeType: "image/svg+xml",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 ${data.length * 32 + 20}" font-family="sans-serif" font-size="12" fill="#5746ce">${bars}</svg>`,
  };
}

export const tools = Object.freeze({
  fetch_paywalled_research: {
    description: "Unlock a simulated premium market research brief for $0.05 in mock-USDC.",
    amount: "50000",
    schema: z.object({ query: z.string().trim().min(1).max(400) }).strict(),
    render: ({ query }) => ({
      kind: "research",
      query,
      source: "Quarters simulated market brief",
      findings: [
        "In the demo dataset, occasional users pay for more capacity than they use on a monthly plan.",
        "Research demand in the demo clusters around reporting deadlines and one-off decisions.",
        "A per-use budget lets the user cap spend while buying individual reports.",
      ],
    }),
  },
  generate_pro_chart: {
    description: "Render a labeled bar chart for $0.03 in mock-USDC.",
    amount: "30000",
    schema: z.object({
      data: z.array(z.object({
        label: z.string().trim().min(1).max(20),
        value: z.number().finite().min(0).max(1_000_000_000),
      }).strict()).min(1).max(12),
    }).strict(),
    render: renderChart,
  },
});
