import bs58 from "bs58";

export const NETWORK = "near:testnet";
export const SCHEME = "quarters-jar";
export const ASSET = "mock-USDC";
export const QUOTE_SECONDS = 120;
export const ACCOUNT_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const CHALLENGE_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const TX_HASH = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isAccount(value) {
  return typeof value === "string" && value.length >= 2 && value.length <= 64
    && ACCOUNT_ID.test(value) && !/\s/.test(value);
}

export function isChallengeId(value) {
  return typeof value === "string" && value.length === 36 && CHALLENGE_ID.test(value);
}

export function isProof(value) {
  return isAccount(value?.payer) && typeof value.transaction === "string"
    && TX_HASH.test(value.transaction) && !/\s/.test(value.transaction)
    && bs58.decode(value.transaction).length === 32;
}

export function termsFor({ toolId, amount, providerId, contractId, challengeId }) {
  return {
    scheme: SCHEME,
    network: NETWORK,
    amount,
    asset: ASSET,
    payTo: providerId,
    maxTimeoutSeconds: QUOTE_SECONDS,
    extra: { contractId, toolId, challengeId },
  };
}

export function authenticateHeader(terms) {
  const cents = String(Number(terms.amount) / 10_000).padStart(2, "0");
  return `x402-v2 token=${ASSET}, recipient=${terms.payTo}, price=0.${cents}, challenge_id=${terms.extra.challengeId}`;
}

export function encodeHeader(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

export function decodeHeader(value) {
  if (!value || value.length > 8192 || !/^[a-z0-9+/]+=*$/i.test(value)) {
    throw new Error("Missing or invalid x402 header");
  }
  return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
}
