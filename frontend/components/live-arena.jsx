"use client";

import { useEffect, useRef, useState } from "react";
import { FastAuthClient } from "@fast-auth-near/react-sdk";
import { JavascriptProvider } from "@fast-auth-near/javascript-provider";
import { providers, transactions, utils } from "near-api-js";
import { buildDelegateAction } from "@near-js/transactions";
import { STAKE } from "../../contracts/paperhands_arena/src/rules.js";
import { ArenaScreen } from "./arena";

const contract = process.env.NEXT_PUBLIC_ARENA_CONTRACT;
const clientId = process.env.NEXT_PUBLIC_FASTAUTH_CLIENT_ID;
const relayer = process.env.NEXT_PUBLIC_FASTAUTH_RELAYER;
const rpc = process.env.NEXT_PUBLIC_NEAR_RPC || "https://rpc.testnet.near.org";
const methods = { enter: "enter_arena", hold: "hold_arena", flee: "flee_arena", advance: "advance_arena", withdraw: "withdraw" };
const GAS = 60_000_000_000_000n;

function view(connection, method_name, args = {}) {
  return connection.provider.query({
    request_type: "call_function", finality: "final", account_id: contract, method_name,
    args_base64: btoa(JSON.stringify(args)),
  }).then(result => JSON.parse(new TextDecoder().decode(Uint8Array.from(result.result))));
}

export default function LiveArena() {
  const client = useRef(null);
  const [account, setAccount] = useState("");
  const [arena, setArena] = useState(null);
  const [credit, setCredit] = useState("0");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState("");

  useEffect(() => {
    if (!client.current) {
      const provider = new JavascriptProvider({ network: "testnet", clientId });
      const connection = { networkId: "testnet", provider: new providers.JsonRpcProvider({ url: rpc }) };
      client.current = new FastAuthClient(provider, connection, "testnet", relayer);
    }
  }, []);

  useEffect(() => {
    let current = true;
    const sync = async () => {
      try {
        const [match, balance] = await Promise.all([
          view(client.current.connection, "get_arena"),
          account ? view(client.current.connection, "get_credit", { account_id: account }) : "0",
        ]);
        if (current) {
          setArena(match);
          setCredit(balance);
        }
      } catch (error) {
        if (current) setMessage(error.message);
      }
    };
    sync();
    const poll = setInterval(sync, 5000);
    const clock = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => { current = false; clearInterval(poll); clearInterval(clock); };
  }, [account]);

  async function login() {
    setBusy(true);
    setMessage("");
    try {
      await client.current.login();
      const signer = await client.current.getSigner();
      const publicKey = await signer.getPublicKey();
      const id = Array.from(publicKey.data, byte => byte.toString(16).padStart(2, "0")).join("");
      setAccount(id);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function act(action) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setReceipt("");
    try {
      const { connection } = client.current;
      const signer = await client.current.getSigner();
      const publicKey = await signer.getPublicKey();
      const accessKey = await connection.provider.query({
        request_type: "view_access_key", finality: "final", account_id: account, public_key: publicKey.toString(),
      });
      const args = action === "withdraw" ? {} : action === "enter"
        ? { arena_id: arena.id } : { arena_id: arena.id, round: arena.round };
      const delegateAction = buildDelegateAction({
        actions: [transactions.functionCall(methods[action], args, GAS, action === "enter" ? STAKE : 0n)],
        maxBlockHeight: BigInt(accessKey.block_height + 120),
        nonce: BigInt(accessKey.nonce) + 1n,
        publicKey: utils.PublicKey.fromString(publicKey.toString()),
        receiverId: contract,
        senderId: account,
      });
      const outcome = await signer.signAndSendDelegateAction({ delegateAction, receiverId: account });
      if (!outcome?.transaction?.hash) throw new Error("The relayer did not return a transaction receipt");
      setReceipt(outcome.transaction.hash);
      if ("Failure" in (outcome.status ?? {}) || outcome.receipts_outcome?.some(item => "Failure" in item.outcome.status)) {
        throw new Error("A Testnet receipt failed. Open the receipt for details.");
      }
      setConfirm(false);
      setMessage("Testnet transaction confirmed.");
      const [match, balance] = await Promise.all([
        view(connection, "get_arena"), view(connection, "get_credit", { account_id: account }),
      ]);
      setArena(match);
      setCredit(balance);
    } catch (error) {
      setMessage(/access key|access_key|account.*exist/i.test(error.message)
        ? "Fund this FastAuth account on Testnet first, then retry." : error.message);
    } finally {
      setBusy(false);
    }
  }

  const authControl = account ? <button className="control mono" title={account} onClick={async () => {
    try {
      await navigator.clipboard.writeText(account);
      setMessage("FastAuth account copied.");
    } catch {
      setMessage(account);
    }
  }}>Copy account · {account.slice(0, 8)}</button>
    : <button className="control" disabled={busy} onClick={login}>Continue with email</button>;

  if (!arena) return <div className="title"><h1>Testnet arena</h1><p role="status">{message || "Loading arena…"}</p></div>;

  return <ArenaScreen {...{ arena, account, credit, now, message, confirm, setConfirm, act, busy, receipt, authControl }}
    mode="NEAR Testnet · gas sponsored" />;
}
