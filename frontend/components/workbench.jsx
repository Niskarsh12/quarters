"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, Radio, Zap } from "lucide-react";
import { Assistant, CoinMark, Console } from "./panels";
import { CHART, RESEARCH, demoRevenue } from "../lib/catalog";
import { createDemoWorkspace } from "../lib/demo";
import { requestLive } from "../lib/live-client";

const blank = (account = null) => ({ account, receipts: [], messages: [], attack: null });
const append = (list, entry, size) => [...list, entry].slice(-size);

export function Workbench() {
  const [demo] = useState(createDemoWorkspace);
  const [mode, setMode] = useState("demo");
  const [views, setViews] = useState(() => ({ demo: blank(demo.snapshot()), live: blank() }));
  const [token, setToken] = useState("");
  const [text, setText] = useState("");
  const [pending, setPending] = useState(null);
  const [optimistic, setOptimistic] = useState(null);
  const [notice, setNotice] = useState("");
  const transcriptRef = useRef(null);
  const busy = useRef(false);
  const view = views[mode];

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (view.messages.length && transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [view.messages, pending]);

  function update(transform) {
    setViews((current) => ({ ...current, [mode]: { ...current[mode], ...transform(current[mode]) } }));
  }

  async function run(action, task) {
    if (busy.current) return;
    busy.current = true;
    setPending(action);
    setNotice("");
    try {
      await task();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setOptimistic(null);
      setPending(null);
      busy.current = false;
    }
  }

  function ask(prompt, toolId) {
    const message = prompt.trim();
    if (!message || !view.account) return;
    const tool = toolId ?? (/\b(chart|plot|graph|revenue)\b/i.test(message) ? CHART : RESEARCH);
    const input = tool === CHART ? { data: demoRevenue } : { query: message };
    return run("purchase", async () => {
      const id = crypto.randomUUID();
      setText("");
      update((current) => ({
        messages: append(current.messages, { id, who: "user", text: message }, 20),
      }));
      let latestReceipt;
      let unlocked;
      try {
        unlocked = mode === "demo" ? demo.purchase(tool, input)
          : await requestLive(token, { action: "purchase", toolId: tool, input }, (receipt) => {
            latestReceipt = receipt;
            setOptimistic(receipt);
          });
      } catch (error) {
        if (latestReceipt?.transaction && latestReceipt.state !== "failed") {
          update((current) => ({
            receipts: append(current.receipts, {
              ...latestReceipt, state: "unconfirmed", timestamp: Date.now(),
            }, 20),
          }));
        }
        throw error;
      }
      update((current) => ({
        account: unlocked.account ?? {
          ...current.account,
          balance: (BigInt(current.account.balance) - BigInt(unlocked.receipt.amount)).toString(),
        },
        receipts: append(current.receipts, unlocked.receipt, 20),
        messages: append(current.messages, { id: `${id}-reply`, who: "assistant", result: unlocked.result }, 20),
      }));
    });
  }

  function fund() {
    return run("fund", async () => {
      const account = mode === "demo" ? demo.faucet() : (await requestLive(token, { action: "fund" })).account;
      update(() => ({ account }));
    });
  }

  function simulate() {
    return run("attack", async () => {
      update(() => ({ attack: null }));
      const result = mode === "demo" ? demo.attack() : await requestLive(token, { action: "attack" });
      update(() => ({ attack: { ...result, id: crypto.randomUUID() } }));
    });
  }

  return (
    <>
      <header className="top-bar">
        <div className="frame masthead">
          <a className="brand" href="/" aria-label="Quarters home"><CoinMark className="brand-mark" /><span>Quarters</span></a>
          <span className="brand-caption">AI vending machine</span>
          <button className="mode-switch press transition-transform duration-100 active:scale-[0.98]"
            type="button" role="switch" aria-label="Live Testnet / Instant Demo Mode"
            aria-checked={mode === "live"} disabled={Boolean(pending)} onClick={() => {
              setNotice("");
              setMode(mode === "demo" ? "live" : "demo");
            }}>
            <span className={mode === "live" ? "mode-current" : ""}><Radio size={14} /> Live Testnet</span>
            <span className={mode === "demo" ? "mode-current" : ""}><Zap size={14} /> Instant Demo Mode</span>
          </button>
        </div>
      </header>
      <main className="frame workbench">
        <div className="title-row">
          <div>
            <h1>Pay per prompt.</h1>
            <p>Research and charts on demand, a few cents at a time.</p>
          </div>
          <div className="workspace-status"><span aria-hidden="true" />{mode === "demo" ? "Sandbox workspace" : view.account ? view.account.accountId : "Testnet workspace"}</div>
        </div>
        {mode === "live" && !view.account && (
          <form className="connect" onSubmit={(event) => {
            event.preventDefault();
            void run("connect", async () => {
              const { account } = await requestLive(token, { action: "status" });
              update(() => ({ account }));
            });
          }}>
            <label htmlFor="live-token">Connect to the configured Testnet Coin Jar</label>
            <input id="live-token" type="password" placeholder="Testnet access token" value={token}
              onChange={(event) => setToken(event.target.value)} autoComplete="off" required />
            <button className="press transition-transform duration-100 active:scale-[0.98]" disabled={Boolean(pending)}>
              {pending === "connect" ? "Connecting…" : "Connect"}
            </button>
          </form>
        )}
        {notice && <p className="notice" role="alert"><CircleAlert size={16} /><span>{notice}</span></p>}
        <div className="workbench-grid">
          <Assistant messages={view.messages} pending={pending === "purchase"} ready={Boolean(view.account) && !pending}
            text={text} setText={setText} ask={ask} transcriptRef={transcriptRef} />
          <Console mode={mode} account={view.account} receipts={[...view.receipts].reverse()} optimistic={optimistic}
            pending={pending} attack={view.attack} fund={fund} simulate={simulate} />
        </div>
        <footer className="workspace-footer">
          <span><CoinMark className="h-4 w-4" /> Quarters</span>
          <span>{mode === "demo" ? "Demo transactions stay in this browser." : "Live payments settle on NEAR Testnet."}</span>
        </footer>
      </main>
    </>
  );
}
