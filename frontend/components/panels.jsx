"use client";

import { ArrowDownLeft, ArrowDownToLine, ArrowRight, ArrowUp, ArrowUpRight, BarChart3, FileText, FlaskConical, LockKeyhole, ReceiptText, ShieldCheck, ShieldAlert } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { CHART, dollars, explorerUrl, prompts, timeOf } from "../lib/catalog";

const ease = [0.23, 1, 0.32, 1];
const enter = { duration: 0.18, ease };
const press = "press transition-transform duration-100 active:scale-[0.98]";

export function CoinMark({ className = "" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className={className}>
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 7.5v8.5h8.5A8.5 8.5 0 0 0 16 7.5Z" fill="currentColor" />
      <path d="M12.5 8.25a8.5 8.5 0 1 0 11.25 11.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function JarCoin() {
  return (
    <svg className="jar-coin" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="54" stroke="currentColor" strokeOpacity=".20" />
      <circle cx="60" cy="60" r="48" fill="#1c1710" stroke="currentColor" strokeOpacity=".55" />
      <circle cx="60" cy="60" r="42" stroke="currentColor" strokeOpacity=".65" strokeDasharray="1 3.5" />
      <circle cx="60" cy="60" r="36" stroke="currentColor" strokeOpacity=".38" />
      <path d="M60 37v23h23A23 23 0 0 0 60 37Z" fill="currentColor" />
      <path d="M50.5 39.1a23 23 0 1 0 30.4 30.4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 2v8m0 100v8M2 60h8m100 0h8" stroke="currentColor" strokeOpacity=".45" />
    </svg>
  );
}

function Answer({ result }) {
  if (result.kind === "chart") {
    return (
      <div className="answer">
        <strong>Quarterly revenue</strong>
        <p>Four quarters of sample revenue, in thousands.</p>
        <img className="result-chart" src={`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(result.svg)}`} alt="Bar chart of sample revenue for Q1 through Q4" />
      </div>
    );
  }
  return (
    <div className="answer">
      <strong>Market report summary</strong>
      <p className="report-topic">{result.query}</p>
      <ul>{result.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul>
      <p className="report-source">Simulated market brief</p>
    </div>
  );
}

export function Assistant({
  messages, pending, ready, text, setText, ask, transcriptRef,
}) {
  const reduced = useReducedMotion();
  return (
    <section className="panel assistant" aria-labelledby="assistant-heading">
      <div className="panel-heading">
        <div className="heading-icon"><CoinMark className="h-5 w-5" /></div>
        <div><h2 id="assistant-heading">The Unbound Consumer Assistant</h2><p>On-demand research and charts</p></div>
      </div>
      <div className="transcript" ref={transcriptRef} role="log" aria-label="Assistant conversation">
        <div className="welcome">
          <h3>What can I get you?</h3>
          <p>Unlock a market brief or make a chart. Each request uses a few cents from your Coin Jar.</p>
        </div>
        {messages.map((message) => (
          <motion.div key={message.id} className={`message ${message.who}`}
            initial={reduced ? false : { opacity: 0, transform: "translateY(5px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }} transition={enter}>
            <span className="speaker">{message.who === "user" ? "You" : "Quarters"}</span>
            {message.result ? <Answer result={message.result} /> : <p>{message.text}</p>}
          </motion.div>
        ))}
        {pending && <p className="working" role="status">Unlocking your result…</p>}
      </div>
      <div className="assistant-actions">
        <div className="tool-list" aria-label="Suggested prompts">
          {prompts.map(({ id, title, detail, amount }) => {
            const Icon = id === CHART ? BarChart3 : FileText;
            return (
              <button key={id} type="button" className={`tool-button ${press}`} onClick={() => ask(title, id)}
                disabled={!ready} aria-label={`${title} (${dollars(amount)})`}>
                <Icon size={17} strokeWidth={1.6} />
                <span className="tool-copy"><strong>{title}</strong><small>{detail}</small></span>
                <span className="number tool-price">{dollars(amount)}</span>
                <ArrowRight size={15} strokeWidth={1.6} />
              </button>
            );
          })}
        </div>
        <form className="composer" onSubmit={(event) => { event.preventDefault(); ask(text); }}>
          <label className="sr-only" htmlFor="prompt">Ask the assistant</label>
          <input id="prompt" value={text} onChange={(event) => setText(event.target.value)}
            placeholder="Ask for research or a chart…" maxLength={400} autoComplete="off" disabled={!ready} />
          <button type="submit" aria-label="Send prompt" className={`send-button ${press}`} disabled={!ready || !text.trim()}>
            <ArrowUp size={17} strokeWidth={2} />
          </button>
        </form>
        <p className="composer-note">Research <span className="number">$0.05</span><span aria-hidden="true"> · </span> Charts <span className="number">$0.03</span></p>
      </div>
    </section>
  );
}

function ReceiptRow({ receipt, reduced }) {
  const url = receipt.transaction ? explorerUrl(receipt.transaction)
    : `/receipts/${receipt.requestId}?${new URLSearchParams({
      tool: receipt.toolId, amount: receipt.amount, at: String(receipt.timestamp),
    })}`;
  return (
    <motion.li className="receipt-row" initial={reduced ? false : { opacity: 0, transform: "translateY(-5px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }} transition={enter}>
      <time className="number" dateTime={new Date(receipt.timestamp).toISOString()}>{timeOf(receipt.timestamp)}</time>
      <span className="receipt-tool" title={receipt.toolId}>{receipt.toolId}</span>
      <span className="number receipt-price">{receipt.state === "unconfirmed" ? "?" : "−"}{dollars(receipt.amount)}</span>
      <a href={url} target="_blank" rel="noreferrer"
        aria-label={receipt.transaction ? "Open NEAR Testnet receipt" : "Open mock NEAR receipt"} title={receipt.state ?? "Settled"}>
        <ArrowUpRight size={15} aria-hidden="true" />
      </a>
    </motion.li>
  );
}

export function Console({ mode, account, receipts, optimistic, pending, attack, fund, simulate }) {
  const reduced = useReducedMotion();
  const optimisticCost = optimistic && ["pending", "submitted", "settled"].includes(optimistic.state);
  const balance = account ? BigInt(account.balance) - (optimisticCost ? BigInt(optimistic.amount) : 0n) : null;
  const fundingDisabled = Boolean(pending) || !account?.faucetAvailable || account?.faucet_claimed;
  const fundingLabel = account?.faucet_claimed ? "Quarter dropped" : pending === "fund" ? "Adding funds…" : "Drop 1 Quarter";
  return (
    <section className="panel vending" aria-labelledby="vending-heading">
      <div className="panel-heading">
        <div className="heading-icon"><ReceiptText size={19} strokeWidth={1.6} /></div>
        <div><h2 id="vending-heading">The Quarters Vending Console</h2><p>Coin Jar, receipts and spend controls</p></div>
      </div>
      <div className="vending-body">
        <section className="jar" aria-labelledby="jar-heading">
          <div className="jar-copy">
            <h3 id="jar-heading">Coin Jar</h3>
            <p className="number balance" aria-live="polite" aria-label="Coin Jar balance">{balance === null ? "—" : dollars(balance < 0n ? 0n : balance)}</p>
            <span className="jar-unit">mock-USDC <span aria-hidden="true">·</span> {optimisticCost ? "Payment pending" : "Available balance"}</span>
          </div>
          <JarCoin />
          <button type="button" className={`faucet ${press}`} disabled={fundingDisabled} onClick={fund}>
            <ArrowDownToLine size={16} strokeWidth={1.8} /><span>{fundingLabel}</span><span className="number">{account?.faucet_claimed ? "" : "+$5.00"}</span>
          </button>
          {mode === "live" && account && !account.faucetAvailable && <p className="faucet-hint">Connect a faucet key to fund this jar from Quarters.</p>}
        </section>
        <section className="guardrails" aria-labelledby="guardrails-heading">
          <h3 id="guardrails-heading"><ShieldCheck size={16} strokeWidth={1.7} />Active Protocol Guardrails</h3>
          <dl>
            <div><dt>Per call</dt><dd className="number">$0.25 max</dd></div>
            <div><dt>Rolling 24h</dt><dd className="number">$2.00 max</dd></div>
            <div><dt>Function-Call Key</dt><dd className={account ? "key-active" : ""}><LockKeyhole size={12} />{account ? "Active" : "Awaiting setup"}</dd></div>
          </dl>
        </section>
        <section className="register" aria-labelledby="register-heading">
          <div className="register-heading">
            <h3 id="register-heading">Live Cash Register</h3>
            <span className="register-tag"><span aria-hidden="true" />{mode === "demo" ? "Demo ledger" : "Testnet ledger"}</span>
          </div>
          <div className="register-columns"><span>Time · UTC</span><span>Tool ID</span><span>Cost</span><span /></div>
          {receipts.length ? (
            <ol className="receipt-list" aria-label="Purchase receipts">
              {receipts.map((receipt) => <ReceiptRow key={receipt.requestId} receipt={receipt} reduced={reduced} />)}
            </ol>
          ) : <p className="empty-register"><ArrowDownLeft size={15} /> Your first purchase will print here.</p>}
        </section>
        <div className="security">
          <button className={`security-button ${press}`} type="button" onClick={simulate} disabled={Boolean(pending) || !account}>
            <FlaskConical size={16} strokeWidth={1.7} />{pending === "attack" ? "Testing guardrails…" : "Simulate Prompt Injection"}<ArrowUpRight size={15} />
          </button>
          {attack && (
            <motion.div key={attack.id} className="attack-result" role="alert"
              initial={{ opacity: reduced ? 1 : 0.35 }} animate={{ opacity: 1 }} transition={enter}>
              <ShieldAlert size={18} strokeWidth={1.7} />
              <div>
                <strong>Exploit Blocked by NEAR Consensus</strong>
                <p>Attempted a <span className="number">$10.00</span> dispense.</p>
                <code>{attack.log}</code>
                {mode === "demo" ? <small>Local policy simulation · no Testnet transaction</small>
                  : <a href={explorerUrl(attack.transaction)} target="_blank" rel="noreferrer">View rejected Testnet transaction <ArrowUpRight size={12} /></a>}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
