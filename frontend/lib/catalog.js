import { tools } from "../../services/vending_mcp/tools.js";

export const RESEARCH = "fetch_paywalled_research";
export const CHART = "generate_pro_chart";
export const prompts = [
  { id: RESEARCH, title: "Summarize locked market report", detail: "A premium brief, distilled into takeaways" },
  { id: CHART, title: "Render revenue chart", detail: "Turn four quarters into a visual" },
].map((prompt) => ({ ...prompt, amount: tools[prompt.id].amount }));

export const demoRevenue = [
  { label: "Q1", value: 42 }, { label: "Q2", value: 53 },
  { label: "Q3", value: 48 }, { label: "Q4", value: 68 },
];

export function dollars(units) {
  return `$${(Number(units) / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

export function timeOf(timestamp) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC",
  }).format(timestamp);
}

export const explorerUrl = (hash) => `https://testnet.nearblocks.io/txns/${encodeURIComponent(hash)}`;
