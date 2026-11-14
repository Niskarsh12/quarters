export const STAKES = ['0', '0.01', '0.05', '0.1'];
export const TICKET_MS = 15 * 60_000;
export const YOCTO = 10n ** 24n;

export function toYocto(amount) {
  const [whole, fraction = ''] = amount.split('.');
  return String(BigInt(whole) * YOCTO + BigInt(fraction.padEnd(24, '0')));
}

export function formatNear(amount) {
  const units = BigInt(amount || 0);
  const fraction = String(units % YOCTO).padStart(24, '0').replace(/0+$/, '');
  return String(units / YOCTO) + (fraction ? '.' + fraction : '');
}

export const nearAccount = value => typeof value === 'string' && (
  /^[a-f0-9]{64}$/.test(value) || /^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*)\.testnet$/.test(value)
) && value.length <= 64;
