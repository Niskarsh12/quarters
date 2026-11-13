"use client";

import { useState } from "react";
import { ArrowRight, TrainFront, Zap } from "lucide-react";
import { SWITCHES, TRAIN_HINTS, TRAIN_NAMES } from "../../services/game_master/challenges.js";
import { YOU } from "../lib/simulation.mjs";

const switchNames = mask => SWITCHES.filter((_, index) => mask & (1 << index)).join(", ") || "None";
const formatNames = indices => indices.map(index => SWITCHES[index]).join(", ");

export default function Room({ room, result, players, canAct, resolve, variant }) {
  const [switches, setSwitches] = useState(0);
  const [train, setTrain] = useState(null);
  const isCircuit = Boolean(room);

  return (
    <div className="challenge">
      <h3>{isCircuit ? room.title : "The Empty Train"}</h3>
      <p>{isCircuit ? room.body : "Three trains are leaving. The least crowded occupied train clears the round. If there’s a tie for least crowded, all tied trains clear."}</p>
      {isCircuit ? (
        <>
          <ol className="clue-list" aria-label="Circuit clues">
            {room.clues.map((clue, index) => (
              <li key={index}><span className="mono clue-value">{clue.count}</span> of <strong>{formatNames(clue.switches)}</strong> must be on.</li>
            ))}
          </ol>
          <div className="room-options circuit-options" role="group" aria-label="Circuit switches">
            {SWITCHES.map((name, index) => {
              const on = Boolean(switches & (1 << index));
              return (
                <button className="room-option" key={name} aria-pressed={on} disabled={!canAct}
                  onClick={() => setSwitches(value => value ^ (1 << index))}>
                  <Zap size={16} aria-hidden="true" /><strong className="mono">{name}</strong><small>{on ? "On" : "Off"}</small>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <details className="opponent-reads" open>
            <summary>What you know about the other players</summary>
            <p>{variant % 2 ? "Ghost opens first. Iron opens last." : "Iron opens first. Ghost opens last."}</p>
            <ul>{TRAIN_HINTS.filter(hint => players.some(player => player.account === hint.name))
              .map(hint => <li key={hint.name}><strong>{hint.name}</strong> {hint.note}.</li>)}</ul>
          </details>
          <div className="room-options train-options" role="group" aria-label="Choose a train">
            {TRAIN_NAMES.map((name, index) => (
              <button key={name} className="room-option" aria-pressed={train === index} disabled={!canAct}
                onClick={() => setTrain(index)}>
                <TrainFront size={16} aria-hidden="true" /><strong>{name}</strong>
                <small>{result ? `${result.counts[index]} aboard${result.winners.includes(index) ? " · Clear" : ""}` : "Board"}</small>
              </button>
            ))}
          </div>
        </>
      )}
      {result ? (
        <div className="room-result" role="status">
          <strong>{result.passed ? "Room cleared" : "Room failed"}</strong>
          {isCircuit ? <p>Correct switches on <span className="mono">{switchNames(result.answer)}</span>.
            {result.choice !== null && !result.passed && <> You turned on <span className="mono">{switchNames(result.choice)}</span>.</>}</p>
            : <p>{result.winners.length ? `${result.winners.map(index => TRAIN_NAMES[index]).join(" and ")} cleared. ` : "No trains boarded. "}
              {result.choices.map(({ name, train }) => `${name} → ${TRAIN_NAMES[train]}`).join(" · ")}</p>}
          {!result.passed && players.some(player => player.account === YOU) &&
            <p>{players.some(player => player.held) ? "The arena settles your 50% penalty when you continue."
              : "Nobody cleared. Remaining balances will be returned."}</p>}
        </div>
      ) : canAct && (
        <button className="choice primary room-submit" disabled={!isCircuit && train === null} onClick={() => resolve(isCircuit ? switches : train)}>
          Lock in <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
