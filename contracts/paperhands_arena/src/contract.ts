import { LookupMap, NearBindgen, NearPromise, call, initialize, near, view } from "near-sdk-js";
import { advance, enter, flee, hold, newArena } from "./rules.js";

const CALLBACK_GAS = 10_000_000_000_000n;
const now = () => Number(near.blockTimestamp() / 1_000_000_000n);

@NearBindgen({ requireInit: true })
class PaperHandsArena {
  owner = "";
  arena = newArena(0, 0, 0, 0);
  credits = new LookupMap<string>("credits");
  pending = new LookupMap<string>("pending");

  @initialize({})
  init() {
    if (near.predecessorAccountId() !== near.currentAccountId()) throw new Error("Self initialization required");
    this.owner = near.currentAccountId();
    this.arena = newArena(1, now(), 600, 86400);
  }

  @call({})
  open_arena({ join_seconds = 600, round_seconds = 86400 }: { join_seconds?: number; round_seconds?: number }) {
    if (near.predecessorAccountId() !== this.owner) throw new Error("Operator only");
    if (!["finished", "cancelled"].includes(this.arena.phase)) throw new Error("Current arena is open");
    if (!Number.isSafeInteger(join_seconds) || join_seconds < 30 || join_seconds > 86400
      || !Number.isSafeInteger(round_seconds) || round_seconds < 30 || round_seconds > 86400) {
      throw new Error("Windows must be between 30 and 86400 seconds");
    }
    this.arena = newArena(this.arena.id + 1, now(), join_seconds, round_seconds);
  }

  @call({ payableFunction: true })
  enter_arena({ arena_id }: { arena_id: number }) {
    this.checkArena(arena_id);
    enter(this.arena, near.predecessorAccountId(), near.attachedDeposit(), now());
  }

  @call({})
  hold_arena({ arena_id, round }: { arena_id: number; round: number }) {
    this.checkRound(arena_id, round);
    hold(this.arena, near.predecessorAccountId(), now());
  }

  @call({})
  flee_arena({ arena_id, round }: { arena_id: number; round: number }) {
    this.checkRound(arena_id, round);
    flee(this.arena, near.predecessorAccountId(), now(), (account, amount) => this.credit(account, amount));
  }

  @call({})
  advance_arena({ arena_id, round }: { arena_id: number; round: number }) {
    this.checkRound(arena_id, round);
    advance(this.arena, now(), (account, amount) => this.credit(account, amount));
  }

  @view({})
  get_arena() {
    return this.arena;
  }

  @view({})
  get_credit({ account_id }: { account_id: string }) {
    return this.credits.get(account_id) ?? "0";
  }

  @call({})
  withdraw() {
    const account = near.predecessorAccountId();
    const amount = BigInt(this.credits.get(account) ?? "0");
    if (!amount || this.pending.get(account)) throw new Error("No withdrawable credit or withdrawal pending");
    this.credits.remove(account);
    this.pending.set(account, String(amount));
    return NearPromise.new(account).transfer(amount).then(
      NearPromise.new(near.currentAccountId()).functionCall(
        "finish_withdraw", JSON.stringify({ account }), 0n, CALLBACK_GAS,
      ),
    );
  }

  @call({ privateFunction: true })
  finish_withdraw({ account }: { account: string }) {
    const amount = this.pending.remove(account);
    if (!amount) return;
    try {
      near.promiseResult(0);
    } catch {
      this.credit(account, BigInt(amount));
    }
  }

  private checkArena(id: number) {
    if (id !== this.arena.id) throw new Error("Stale arena");
  }

  private checkRound(id: number, round: number) {
    this.checkArena(id);
    if (round !== this.arena.round) throw new Error("Stale round");
  }

  private credit(account: string, amount: bigint) {
    this.credits.set(account, String(BigInt(this.credits.get(account) ?? "0") + amount));
  }
}
