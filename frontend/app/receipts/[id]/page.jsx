import Link from "next/link";
import { notFound } from "next/navigation";
import { dollars, prompts, timeOf } from "../../../lib/catalog";

export const metadata = { title: "Mock NEAR Receipt · Quarters" };

export default function Receipt({ params, searchParams }) {
  const { id } = params;
  const { tool, amount, at } = searchParams;
  const timestamp = Number(at);
  if (!/^[0-9a-f-]{36}$/.test(id) || !prompts.some((prompt) => prompt.id === tool && prompt.amount === amount)
    || !Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp > 8.64e15) notFound();
  return (
    <main className="frame receipt-page">
      <Link href="/">← Back to Quarters</Link>
      <h1>Mock NEAR receipt</h1>
      <p>Instant Demo Mode recorded this purchase locally.</p>
      <dl className="panel receipt-detail">
        <div><dt>Request</dt><dd className="number">{id}</dd></div>
        <div><dt>Tool ID</dt><dd className="number">{tool}</dd></div>
        <div><dt>Amount</dt><dd className="number">{dollars(amount)} mock-USDC</dd></div>
        <div><dt>Time</dt><dd className="number">{timeOf(timestamp)} UTC</dd></div>
        <div><dt>Status</dt><dd>Settled in demo ledger</dd></div>
      </dl>
    </main>
  );
}
