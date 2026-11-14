'use client';

import { useEffect, useState } from 'react';
import { formatNear, STAKES, toYocto } from '../lib/near-amounts.mjs';

const STORAGE = 'dungeon-near-receipts';
let selectorPromise;

function savedReceipts() {
  try { return JSON.parse(localStorage.getItem(STORAGE) || '[]'); }
  catch { return []; }
}

export function useNearConfig() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    fetch('/api/near').then(response => response.json()).then(setConfig).catch(() => setConfig({ enabled: false }));
  }, []);
  return config;
}

export function StakeSelect({ config, stake, onChange }) {
  return (
    <label className="stake-select">
      Entry per player
      <select value={stake} onChange={event => onChange(event.target.value)}>
        <option value="0">Free · 0 NEAR</option>
        {STAKES.slice(1).map(amount => <option key={amount} value={amount} disabled={!config?.enabled}>{amount} NEAR · Testnet</option>)}
      </select>
      {config && !config.enabled && <small>Testnet escrow is offline. Free play is available.</small>}
    </label>
  );
}

async function meteor(contract) {
  if (!selectorPromise) selectorPromise = Promise.all([
    import('@near-wallet-selector/core'),
    import('@near-wallet-selector/meteor-wallet'),
  ]).then(([{ setupWalletSelector }, { setupMeteorWallet }]) => setupWalletSelector({
    network: 'testnet',
    modules: [setupMeteorWallet()],
  })).catch(error => { selectorPromise = null; throw error; });
  const selector = await selectorPromise;
  const wallet = await selector.wallet('meteor-wallet');
  const accounts = await wallet.getAccounts();
  if (!accounts.length) {
    const connected = await wallet.signIn({ contractId: contract, methodNames: ['refund', 'withdraw'] });
    if (!connected?.length) throw new Error('Finish connecting Meteor on Testnet, then try again.');
    return { wallet, account: connected[0].accountId };
  }
  return { wallet, account: accounts[0].accountId };
}

async function call(wallet, account, contract, methodName, args = {}, deposit = '0') {
  const outcome = await wallet.signAndSendTransaction({
    signerId: account, receiverId: contract,
    actions: [{ type: 'FunctionCall', params: { methodName, args, gas: '40000000000000', deposit } }],
  });
  if (outcome?.status?.Failure) throw new Error('The Testnet transaction failed. Check the wallet activity.');
  if (outcome?.status?.SuccessValue === 'ZmFsc2U=') throw new Error('The transfer failed. Your escrow balance was restored.');
  return outcome?.transaction?.hash;
}

export function NearStake({ stake, action, finished = false }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState(null);
  const settlement = stake.settlement;
  const payout = settlement?.payouts?.[stake.account] || '0';

  async function run(task) {
    setBusy(true);
    setMessage('');
    try { await task(); }
    catch (error) { setMessage(error.message || 'Could not reach Meteor on Testnet.'); }
    finally { setBusy(false); }
  }

  function deposit() {
    return run(async () => {
      const { wallet, account } = await meteor(stake.contract);
      const receipt = { contract: stake.contract, match: stake.id, seat: stake.seat, account };
      const entries = savedReceipts().filter(item => !(item.match === receipt.match && item.seat === receipt.seat && item.account === account));
      localStorage.setItem(STORAGE, JSON.stringify([...entries, receipt]));
      const check = await fetch('/api/near?' + new URLSearchParams(receipt)).then(response => response.json());
      if (check.error) throw new Error(check.error);
      if (!check.deposit) {
        const transaction = await call(wallet, account, stake.contract, 'deposit', { match_id: stake.id, seat_id: stake.seat }, toYocto(stake.amount));
        setHash(transaction);
      }
      if (await action('deposit', { account })) setMessage('Testnet stake confirmed.');
    });
  }

  function withdraw() {
    return run(async () => {
      const { wallet, account } = await meteor(stake.contract);
      if (account !== stake.account) throw new Error('Use the wallet that funded this seat.');
      setHash(await call(wallet, account, stake.contract, 'withdraw'));
      setMessage('Withdrawal submitted. Check your Testnet wallet balance.');
    });
  }

  return (
    <div className="near-stake">
      <strong>NEAR Testnet · {stake.amount} NEAR per human player</strong>
      <p>{formatNear(stake.pool)} NEAR confirmed in escrow. Bots have no stake.</p>
      {!finished && !stake.account && <button className="primary" onClick={deposit} disabled={busy || Date.now() >= stake.expiresAt}>{busy ? 'Checking Testnet…' : 'Deposit or confirm with Meteor'}</button>}
      {!finished && stake.account && <p>Funded by <span className="near-address">{stake.account}</span></p>}
      {!finished && Date.now() >= stake.expiresAt && <p>Lobby expired. Use Testnet payouts and refunds on the cabinet screen to recover any unsettled stake.</p>}
      {finished && settlement?.state === 'settled' && <p>Your payout: {formatNear(payout)} NEAR.</p>}
      {finished && settlement?.state === 'settled' && payout !== '0' && <button disabled={busy} onClick={withdraw}>Withdraw escrow balance</button>}
      {finished && (!settlement || settlement.state === 'pending') && <p role="status">Settling the match on Testnet…</p>}
      {finished && settlement?.state === 'retry' && <button disabled={busy} onClick={() => action('settle')}>Retry settlement</button>}
      {message && <p role="status">{message}</p>}
      <NearTx hash={hash} label="Wallet transaction" /> <NearTx hash={settlement?.transaction} label="Settlement transaction" />
    </div>
  );
}

function NearTx({ hash, label }) {
  return hash ? <a href={'https://testnet.nearblocks.io/txns/' + encodeURIComponent(hash)} target="_blank" rel="noreferrer">{label} ↗</a> : null;
}

export function NearRecovery({ config }) {
  const [receipts, setReceipts] = useState([]);
  const [funds, setFunds] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { setReceipts(savedReceipts()); }, []);
  if (!config?.contract) return null;

  async function run(operation, receipt) {
    setBusy(true);
    setMessage('');
    try {
      const { wallet, account } = await meteor(config.contract);
      if (receipt && account !== receipt.account) throw new Error('Use the wallet that funded this receipt.');
      if (operation === 'refund') {
        await call(wallet, account, config.contract, 'refund', { match_id: receipt.match, seat_id: receipt.seat });
        setMessage('Refund credited to your escrow balance. Select Withdraw to return it to your wallet.');
      }
      if (operation === 'withdraw') {
        await call(wallet, account, config.contract, 'withdraw');
        setMessage('Withdrawal submitted. Check your Testnet wallet balance.');
      }
      const load = async values => {
        const response = await fetch('/api/near?' + new URLSearchParams({ account, ...values }));
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
      };
      const { balance } = await load({});
      const entries = await Promise.all(receipts.filter(item => item.account === account && item.contract === config.contract)
        .map(async item => ({ ...item, deposit: (await load({ match: item.match, seat: item.seat })).deposit })));
      setFunds({ balance, entries });
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  return (
    <details className="near-stake">
      <summary>Testnet payouts and refunds</summary>
      <p>Unsettled stakes can be refunded 25 minutes after deposit. This browser remembers your deposit receipts.</p>
      <button disabled={busy} onClick={() => run('check')}>Check wallet</button>
      {funds && <p>Escrow balance: {formatNear(funds.balance)} NEAR {funds.balance !== '0' && <button disabled={busy} onClick={() => run('withdraw')}>Withdraw</button>}</p>}
      {funds?.entries.filter(item => item.deposit?.state === 'locked').map(item => <div key={item.match + item.seat}>
        <span>{formatNear(item.deposit.amount)} NEAR · refundable at {new Date(item.deposit.refund_at_ms).toLocaleTimeString()}</span>{' '}
        <button disabled={busy || Date.now() < item.deposit.refund_at_ms} onClick={() => run('refund', item)}>Refund</button>
      </div>)}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
