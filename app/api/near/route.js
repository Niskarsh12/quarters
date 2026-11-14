import { nearConfig, contractView, verifiedNearConfig } from '../../../lib/near-escrow.mjs';
import { nearAccount } from '../../../lib/near-amounts.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const account = searchParams.get('account');
  const config = nearConfig();
  if (!account) return Response.json(await verifiedNearConfig());
  if (!config.contract || !nearAccount(account)) return Response.json({ error: 'Select a Testnet account.' }, { status: 400 });
  try {
    const match_id = searchParams.get('match');
    const seat_id = searchParams.get('seat');
    if (match_id && ![match_id, seat_id].every(value => value && /^[a-f0-9]{32}$/.test(value))) {
      return Response.json({ error: 'Invalid deposit receipt.' }, { status: 400 });
    }
    const balance = await contractView('get_balance', { account });
    const deposit = match_id ? await contractView('get_deposit', { match_id, seat_id, account }) : null;
    return Response.json({ balance, deposit });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 502 });
  }
}
