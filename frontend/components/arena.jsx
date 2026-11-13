"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowDownRight, ArrowRight, Flame, Radio, RotateCcw } from "lucide-react";
import { activePlayers, fleeTax, ROUND_COUNT, TOKEN } from "../../contracts/paperhands_arena/src/rules.js";
import { evaluateAction, scenarios } from "../../services/game_master/dilemmas.js";
import { play, practice, YOU } from "../lib/simulation";

const LiveArena = dynamic(() => import("./live-arena"), { ssr: false });
const liveAvailable = Boolean(process.env.NEXT_PUBLIC_ARENA_CONTRACT?.endsWith(".testnet")
  && process.env.NEXT_PUBLIC_FASTAUTH_CLIENT_ID && process.env.NEXT_PUBLIC_FASTAUTH_RELAYER);

const epoch = () => Math.floor(Date.now() / 1000);
const display = value => {
  const units = BigInt(value) * 10000n / TOKEN;
  return `${units / 10000n}.${String(units % 10000n).padStart(4, "0")}`;
};
const labels = { entered: "entered", fled: "fled", timed_out: "missed the decision", survived: "survived", refunded: "refunded", held: "held" };

export default function Arena() {
  const [live, setLive] = useState(false);
  const [fast, setFast] = useState(true);
  const [state, setState] = useState(() => practice(0));
  const [now, setNow] = useState(0);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    const start = epoch();
    setState(practice(start));
    setNow(start);
    const timer = setInterval(() => setNow(epoch()), 1000);
    return () => clearInterval(timer);
  }, []);

  function act(action) {
    try {
      setState(play(state, action, epoch(), fast));
      setMessage(["hold", "flee"].includes(action) ? evaluateAction(action, state.arena.round) : "");
      setConfirm(false);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="shell">
      <header className="top">
        <div className="brand"><Flame className="mark" aria-hidden="true" /> The PaperHands Arena</div>
        <div className="controls">
          {liveAvailable && <button className="control" onClick={() => setLive(!live)}>{live ? "Practice mode" : "Play on Testnet"}</button>}
          {!live && <>
            <button className="control switch" role="switch" aria-checked={fast} onClick={() => setFast(!fast)}>Fast-forward</button>
            <button className="control inline-flex items-center gap-2" onClick={() => {
              setState(practice(epoch())); setMessage(""); setConfirm(false);
            }}><RotateCcw size={14} aria-hidden="true" /> Reset</button>
          </>}
        </div>
      </header>
      {live ? <LiveArena /> : <ArenaScreen {...{ now, fast, message, confirm, setConfirm, act }}
        arena={state.arena} account={YOU} credit={state.credits[YOU] ?? "0"} mode="Practice · simulated players" />}
    </main>
  );
}

export function ArenaScreen({ arena, account, credit = "0", now, fast = false, act, message, confirm, setConfirm, mode, busy, receipt, authControl }) {
  const [broadcast, setBroadcast] = useState(null);
  const round = arena.round;
  useEffect(() => {
    if (!round) return;
    const controller = new AbortController();
    fetch(`/api/dilemma?round=${round}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (data && !controller.signal.aborted) setBroadcast({ round, data }); })
      .catch(() => {});
    return () => controller.abort();
  }, [round]);

  const active = activePlayers(arena);
  const player = arena.players.find(candidate => candidate.account === account);
  const time = Math.max(0, arena.ends - now);
  const closed = ["finished", "cancelled"].includes(arena.phase);
  const canAct = player?.status === "active" && !player.held && time > 0 && !busy;
  const dilemma = broadcast?.round === round ? broadcast.data : { ...scenarios[Math.max(0, round - 1)], source: "Scripted Game Master" };
  const tax = player ? fleeTax(player.amount) : 0n;
  const canAdvance = arena.phase === "lobby" ? fast || !time || arena.players.length === 12
    : !closed && (fast || !time || active.every(member => member.held));
  const timer = time >= 3600
    ? `${Math.floor(time / 3600)}h ${String(Math.floor(time % 3600 / 60)).padStart(2, "0")}m`
    : `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`;

  return (
    <>
      <div className="title flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker mono">{mode}</div>
          <h1>{arena.phase === "lobby" ? "Enter the arena" : closed ? "The gates are shut" : "Hold your nerve."}</h1>
        </div>
        {authControl}
      </div>
      <div className="metrics">
        <Metric label="Round" value={round ? `${round} / ${ROUND_COUNT}` : "Lobby"} />
        <Metric label={closed ? "Survived" : "Still inside"} value={closed ? arena.players.filter(member => member.status === "survived").length : active.length} />
        <Metric label="Prize pool earned" value={display(arena.redistributed)} unit="NEAR" />
        <Metric label="Gate closes in" value={closed ? "Closed" : timer} />
      </div>
      <div className="arena-grid">
        <section className="stage">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="scene" src="/arena.png" alt="An orange furnace ring deep inside a concrete arena" />
          <div className="broadcast">
            <div className="section-heading">
              <h2 className="inline-flex items-center gap-2"><Radio size={17} aria-hidden="true" /> Game Master</h2>
              <span className="muted">{round ? dilemma.source : "Waiting for entrants"}</span>
            </div>
            {arena.phase === "lobby" ? <>
              <h3>The gate is open.</h3><p>Stake 0.1000 NEAR to enter. Lock in Hold each round or take the exit and give up a share of your stake.</p>
            </> : closed ? <>
              <h3>{arena.phase === "cancelled" ? "Arena cancelled." : player?.status === "survived" ? "You made it out." : "Settlement complete."}</h3>
              <p>PaperHands Tax distributed to survivors <strong className="mono">{display(arena.redistributed)} NEAR</strong>.</p>
            </> : <><h3>{dilemma.title}</h3><p>{dilemma.body}</p></>}
            <div className="choices">
              {arena.phase === "lobby" && account && !player && time > 0 &&
                <button disabled={busy} className="choice primary inline-flex items-center gap-2" onClick={() => act("enter")}>Enter · 0.1000 NEAR <ArrowRight size={17} aria-hidden="true" /></button>}
              {arena.phase === "running" && player?.status === "active" && <>
                <button className="choice primary" disabled={!canAct} onClick={() => act("hold")}>{player.held ? "Hold locked" : "Hold position"}</button>
                <button className="choice secondary danger inline-flex items-center gap-2" disabled={!canAct} onClick={() => setConfirm(true)}><ArrowDownRight size={17} aria-hidden="true" /> Flee</button>
              </>}
              {canAdvance && account && <button className="choice secondary" disabled={busy} onClick={() => act("advance")}>
                {arena.phase === "lobby" ? "Start round" : round === ROUND_COUNT ? "Settle arena" : "Advance round"}
              </button>}
              {BigInt(credit) > 0n && (account === YOU
                ? <span className="mono muted">Credited · {display(credit)} NEAR</span>
                : <button className="choice secondary" disabled={busy} onClick={() => act("withdraw")}>Withdraw · {display(credit)} NEAR</button>)}
            </div>
            {confirm && canAct && <div className="alert">
              <p>Exit with <strong className="mono">{display(BigInt(player.amount) - tax)} NEAR</strong>. Survivors split the <strong className="mono">{display(tax)} NEAR</strong> tax.</p>
              <div className="choices"><button className="choice primary" disabled={busy} onClick={() => act("flee")}>Confirm flee</button><button className="choice secondary" onClick={() => setConfirm(false)}>Keep playing</button></div>
            </div>}
            {(message || busy || receipt) && <div className="status" aria-live="polite">{busy ? "Waiting for confirmation…" : message}
              {receipt && <a className="receipt" href={`https://testnet.nearblocks.io/txns/${receipt}`} target="_blank" rel="noreferrer">View transaction</a>}
            </div>}
          </div>
        </section>
        <aside className="rail">
          <section className="panel"><h2>Arena floor</h2>
            {arena.players.length === 0 && <p className="rules">The arena is empty.</p>}
            {arena.players.map(member => (
              <div className={`player ${member.status !== "active" ? "is-out" : ""}`} key={member.account}>
                <span><strong>{member.account === account ? "You" : member.account}</strong><small>{member.status === "active" ? member.held ? "Holding" : "Inside" : labels[member.status]}</small></span>
                <span className="mono">{display(member.amount)} <span className="unit">NEAR</span></span>
              </div>
            ))}
          </section>
          <section className="panel"><h2>Floor log</h2>
            {[...arena.events].reverse().filter(event => event.type !== "entered").slice(0, 4).map((event, index) =>
              <div className="event" key={index}><span>{event.type === "round" ? `Round ${event.round} opened` : `${event.account === account ? "You" : event.account} ${labels[event.type]}`}</span>
                {["fled", "timed_out"].includes(event.type) && <span className="mono danger">+{display(event.amount)}</span>}</div>
            )}
            {!arena.events.some(event => event.type !== "entered") && <p className="rules">The first broadcast is still pending.</p>}
          </section>
          <section className="panel"><h2>Rules of the floor</h2><p className="rules">Flee and lose 25% of your current stake. Miss the deadline and lose 50% to players who locked Hold. If nobody locks Hold, remaining stakes are returned. The last player or round-three survivors take their full balances.</p></section>
        </aside>
      </div>
    </>
  );
}

function Metric({ label, value, unit }) {
  return <div className="metric"><div className="label">{label}</div><div className="value mono">{value} {unit && <span className="unit">{unit}</span>}</div></div>;
}
