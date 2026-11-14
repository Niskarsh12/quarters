import { NearBindgen, NearPromise, call, initialize, near, view, LookupMap, assert } from 'near-sdk-js';

type Entry = { seat_id: string; account: string };
type Deposit = { amount: string; refund_at_ms: number; state: 'locked' | 'settled' | 'refunded' };
type Match = { payouts: Record<string, string>; pool: string };
const GAS = 10_000_000_000_000n;
const amounts = ['10000000000000000000000', '50000000000000000000000', '100000000000000000000000'];
const id = /^[a-f0-9]{32}$/;
const now = () => Number(near.blockTimestamp() / 1_000_000n);
const key = (match: string, seat: string, account: string) => match + ':' + seat + ':' + account;

@NearBindgen({ requireInit: true })
class ArcadeEscrow {
  referee = '';
  deposits = new LookupMap<Deposit>('d');
  matches = new LookupMap<Match>('m');
  balances = new LookupMap<string>('b');

  @initialize({})
  init({ referee }: { referee: string }) {
    assert(near.predecessorAccountId() === near.currentAccountId(), 'Initialize with the contract account');
    assert(referee.endsWith('.testnet') && near.currentAccountId().endsWith('.testnet'), 'Testnet only');
    this.referee = referee;
  }

  @call({ payableFunction: true })
  deposit({ match_id, seat_id }: { match_id: string; seat_id: string }) {
    assert(id.test(match_id) && id.test(seat_id), 'Invalid room or seat');
    assert(!this.matches.get(match_id), 'Match already settled');
    const amount = near.attachedDeposit().toString();
    assert(amounts.includes(amount), 'Unsupported amount');
    const storageKey = key(match_id, seat_id, near.predecessorAccountId());
    assert(!this.deposits.get(storageKey), 'Seat deposit already exists');
    this.deposits.set(storageKey, { amount, refund_at_ms: now() + 25 * 60_000, state: 'locked' });
  }

  @view({})
  get_config() {
    return { version: 'dungeon-arcade-v1', referee: this.referee };
  }

  @view({})
  get_deposit({ match_id, seat_id, account }: Entry & { match_id: string }) {
    return this.deposits.get(key(match_id, seat_id, account));
  }

  @view({})
  get_match({ match_id }: { match_id: string }) {
    return this.matches.get(match_id);
  }

  @view({})
  get_balance({ account }: { account: string }) {
    return this.balances.get(account) || '0';
  }

  @call({})
  settle({ match_id, entries, winners, amount }: { match_id: string; entries: Entry[]; winners: string[]; amount: string }) {
    assert(near.predecessorAccountId() === this.referee, 'Only the referee can settle');
    assert(id.test(match_id) && amounts.includes(amount), 'Invalid room or stake');
    assert(!this.matches.get(match_id), 'Match already settled');
    assert(entries.length >= 1 && entries.length <= 10, 'Invalid seat count');
    const accounts = new Set(entries.map(entry => entry.account));
    assert(accounts.size === entries.length && new Set(entries.map(entry => entry.seat_id)).size === entries.length, 'Duplicate entry');
    assert(new Set(winners).size === winners.length && winners.every(account => accounts.has(account)), 'Invalid winners');
    for (const entry of entries) {
      const storageKey = key(match_id, entry.seat_id, entry.account);
      const deposit = this.deposits.get(storageKey);
      assert(deposit && deposit.state === 'locked' && deposit.amount === amount && deposit.refund_at_ms > now(), 'Entry is not locked');
      this.deposits.set(storageKey, { ...deposit!, state: 'settled' });
    }
    const pool = BigInt(amount) * BigInt(entries.length);
    const recipients = winners.length ? winners : entries.map(entry => entry.account);
    const share = pool / BigInt(recipients.length);
    let remainder = pool % BigInt(recipients.length);
    const payouts: Record<string, string> = Object.create(null);
    for (const account of recipients) {
      const payout = share + (remainder > 0n ? 1n : 0n);
      if (remainder > 0n) remainder--;
      this.credit(account, payout);
      payouts[account] = payout.toString();
    }
    this.matches.set(match_id, { payouts, pool: pool.toString() });
  }

  @call({})
  refund({ match_id, seat_id }: { match_id: string; seat_id: string }) {
    const account = near.predecessorAccountId();
    const storageKey = key(match_id, seat_id, account);
    const deposit = this.deposits.get(storageKey);
    assert(deposit && deposit.state === 'locked' && now() >= deposit.refund_at_ms, 'Deposit is not refundable yet');
    this.deposits.set(storageKey, { ...deposit!, state: 'refunded' });
    this.credit(account, BigInt(deposit!.amount));
  }

  @call({})
  withdraw() {
    const account = near.predecessorAccountId();
    const amount = BigInt(this.balances.get(account) || '0');
    assert(amount > 0n, 'No payout to withdraw');
    this.balances.set(account, '0');
    return NearPromise.new(account).transfer(amount).then(
      NearPromise.new(near.currentAccountId()).functionCall('on_withdraw', JSON.stringify({ account, amount: String(amount) }), 0n, GAS),
    );
  }

  @call({ privateFunction: true })
  on_withdraw({ account, amount }: { account: string; amount: string }) {
    try { near.promiseResult(0n); }
    catch { this.credit(account, BigInt(amount)); return false; }
    return true;
  }

  private credit(account: string, amount: bigint) {
    this.balances.set(account, String(BigInt(this.balances.get(account) || '0') + amount));
  }
}
