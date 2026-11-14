import { randomBytes } from 'node:crypto';
import { STAKES, TICKET_MS, nearAccount, toYocto } from './near-amounts.mjs';

const rpcUrl = () => process.env.NEAR_TESTNET_RPC || 'https://rpc.testnet.near.org';
const contractId = () => process.env.NEAR_ESCROW_CONTRACT;
const refereeId = () => process.env.NEAR_REFEREE_ACCOUNT;
let verifiedUntil = 0;

export function nearConfig() {
  const contract = contractId();
  return {
    enabled: nearAccount(contract) && nearAccount(refereeId()) && Boolean(process.env.NEAR_REFEREE_KEY),
    contract: nearAccount(contract) ? contract : null,
    network: 'testnet',
  };
}

export async function verifiedNearConfig() {
  const config = nearConfig();
  if (!config.enabled || Date.now() < verifiedUntil) return config;
  try {
    const { KeyPair } = await import('near-api-js');
    const public_key = KeyPair.fromString(process.env.NEAR_REFEREE_KEY).getPublicKey().toString();
    const [deployed, access] = await Promise.all([
      contractView('get_config', {}),
      nearQuery({ request_type: 'view_access_key', account_id: refereeId(), public_key }),
    ]);
    const permission = access.permission?.FunctionCall;
    if (deployed?.version !== 'dungeon-arcade-v1' || deployed.referee !== refereeId() ||
        permission?.receiver_id !== config.contract || permission.method_names?.length !== 1 ||
        permission.method_names[0] !== 'settle') return { ...config, enabled: false };
    verifiedUntil = Date.now() + 60_000;
    return config;
  } catch {
    return { ...config, enabled: false };
  }
}

export function stakeFor(value = '0') {
  if (!STAKES.includes(value)) throw new Error('Select a listed NEAR stake.');
  if (value === '0') return null;
  if (!nearConfig().enabled) throw new Error('Testnet escrow is unavailable. Choose a free room.');
  return { id: randomBytes(16).toString('hex'), amount: value, expiresAt: Date.now() + TICKET_MS, settlement: null };
}

export function publicStake(room, player) {
  const { stake } = room;
  if (!stake) return null;
  const people = (room.players || room.seats).filter(seat => !seat.bot);
  return {
    id: stake.id, amount: stake.amount, contract: contractId(), expiresAt: stake.expiresAt,
    seat: player.stakeSeat, account: player.nearAccount || null,
    refundAt: player.refundAt || null,
    pool: String(BigInt(toYocto(stake.amount)) * BigInt(people.filter(seat => seat.nearAccount).length)),
    settlement: stake.settlement,
  };
}

export function initStakeSeat(room, player) {
  if (room.stake) player.stakeSeat = randomBytes(16).toString('hex');
}

export function requireStakeReady(room, player) {
  if (room.stake && !player.bot) {
    if (Date.now() >= room.stake.expiresAt) throw new Error('This paid lobby expired. Create a new room.');
    if (!player.nearAccount) throw new Error('Confirm your Testnet deposit before readying up.');
  }
}

async function nearQuery(params) {
  const response = await fetch(rpcUrl(), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { ...params, finality: 'final' } }),
    signal: AbortSignal.timeout(9000),
  });
  const data = await response.json();
  if (!response.ok || data.error || !data.result) throw new Error('Could not read the Testnet escrow. Try again.');
  return data.result;
}

export async function contractView(method_name, args) {
  const result = await nearQuery({
    request_type: 'call_function', account_id: contractId(), method_name,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  });
  return JSON.parse(Buffer.from(result.result).toString());
}

export async function confirmDeposit(room, player, account) {
  if (!room.stake || !player.stakeSeat || !nearAccount(account)) throw new Error('Enter a valid Testnet wallet account.');
  if (player.nearAccount === account) return;
  if (player.nearAccount) throw new Error('This seat already has a confirmed wallet.');
  const before = Date.now();
  if (before >= room.stake.expiresAt) throw new Error('The Testnet lobby has expired.');
  const deposit = await contractView('get_deposit', { match_id: room.stake.id, seat_id: player.stakeSeat, account });
  if (!deposit || deposit.amount !== toYocto(room.stake.amount) || deposit.state !== 'locked' ||
      Number(deposit.refund_at_ms) < room.stake.expiresAt + 6 * 60_000) {
    throw new Error('Deposit is missing, finalized at a different amount, or expired.');
  }
  const people = room.players || room.seats;
  if (!people.includes(player) || Date.now() >= room.stake.expiresAt) throw new Error('This seat is no longer open.');
  if (player.nearAccount && player.nearAccount !== account) throw new Error('This seat already has a confirmed wallet.');
  if (people.some(other => other !== player && other.nearAccount === account)) throw new Error('Use a different wallet for each player.');
  player.nearAccount = account;
  player.refundAt = deposit.refund_at_ms;
}

let sendQueue = Promise.resolve();

async function sendSettlement(args) {
  const { Account, Connection, KeyPair, keyStores, InMemorySigner, providers } = await import('near-api-js');
  const store = new keyStores.InMemoryKeyStore();
  await store.setKey('testnet', refereeId(), KeyPair.fromString(process.env.NEAR_REFEREE_KEY));
  const connection = new Connection('testnet', new providers.JsonRpcProvider({ url: rpcUrl() }), new InMemorySigner(store), '');
  const referee = new Account(connection, refereeId());
  return referee.functionCall({ contractId: contractId(), methodName: 'settle', args, gas: 100_000_000_000_000n, attachedDeposit: 0n });
}

export function settleStake(room, winningSeats) {
  if (!room.stake || ['pending', 'settled'].includes(room.stake.settlement?.state)) return;
  const seats = (room.players || room.seats).filter(seat => seat.nearAccount);
  if (!seats.length) return;
  const eligible = seats.filter(seat => winningSeats.includes(seat));
  const entries = seats.map(seat => ({ seat_id: seat.stakeSeat, account: seat.nearAccount }));
  const winners = eligible.map(seat => seat.nearAccount);
  const { stake } = room;
  stake.settlement = { state: 'pending' };
  sendQueue = sendQueue.then(async () => {
    try {
      const existing = await contractView('get_match', { match_id: stake.id });
      if (existing) {
        stake.settlement = { ...existing, state: 'settled' };
        return;
      }
      const result = await sendSettlement({ match_id: stake.id, entries, winners, amount: toYocto(stake.amount) });
      const settlement = await contractView('get_match', { match_id: stake.id });
      if (!settlement) throw new Error('Settlement is not final yet.');
      stake.settlement = { ...settlement, state: 'settled', transaction: result.transaction.hash };
    } catch {
      stake.settlement = { state: 'retry' };
    }
  });
}
