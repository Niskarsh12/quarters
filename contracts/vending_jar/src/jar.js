export const PER_CALL_CAP = 250_000n;
export const DAILY_CAP = 2_000_000n;
export const DAY_NS = 86_400_000_000_000n;
const FAUCET_AMOUNT = 5_000_000n;
const YOCTO_PER_DEMO_MICRO = 10n ** 18n;

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function validateAccount(accountId) {
  requireThat(
    typeof accountId === "string" && accountId.length >= 2 && accountId.length <= 64
      && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(accountId) && !/\s/.test(accountId),
    "Invalid NEAR account ID",
  );
}

function validateIdentifier(value, name) {
  requireThat(
    typeof value === "string" && value.length >= 1 && value.length <= 64
      && !/[^a-zA-Z0-9_-]/.test(value),
    `Invalid ${name}`,
  );
}

function spendAmount(value) {
  const validNumber = typeof value === "number" && Number.isSafeInteger(value);
  const validString = typeof value === "string" && value.length <= 18 && /^[1-9]\d*$/.test(value)
    && !/\s/.test(value);
  requireThat(validNumber || validString, "Amount must be an integer in micro-units");
  const amount = BigInt(value);
  requireThat(amount > 0n, "Amount must be positive");
  requireThat(amount <= PER_CALL_CAP, "Per-call cap exceeded");
  return amount;
}

export class Jar {
  static initialize(caller, contractId, ownerId) {
    requireThat(caller === contractId, "Only the contract account can initialize the jar");
    validateAccount(ownerId);
    return ownerId;
  }

  constructor(ownerId, host) {
    requireThat(ownerId, "Jar is not initialized");
    this.ownerId = ownerId;
    this.host = host;
  }

  read(key, fallback) {
    const value = this.host.read(key);
    return value == null ? fallback : JSON.parse(value);
  }

  write(key, value) {
    this.host.write(key, JSON.stringify(value));
  }

  user(accountId) {
    return this.read(`user:${accountId}`, {
      balance: "0",
      lifetime_spent: "0",
      call_count: 0,
      faucet_claimed: false,
    });
  }

  faucet(caller) {
    const account = this.user(caller);
    if (!account.faucet_claimed) {
      account.faucet_claimed = true;
      account.balance = (BigInt(account.balance) + FAUCET_AMOUNT).toString();
      this.write(`user:${caller}`, account);
    }
    return this.userAccount(caller);
  }

  deposit(caller, attachedYocto) {
    requireThat(attachedYocto > 0n && attachedYocto % YOCTO_PER_DEMO_MICRO === 0n,
      "Attach a positive multiple of 0.000001 testnet NEAR");
    const account = this.user(caller);
    account.balance = (BigInt(account.balance) + attachedYocto / YOCTO_PER_DEMO_MICRO).toString();
    this.write(`user:${caller}`, account);
    return this.userAccount(caller);
  }

  registerProvider(caller, providerId, toolId, priceCeiling) {
    requireThat(caller === this.ownerId, "Only the owner can register providers");
    validateAccount(providerId);
    validateIdentifier(toolId, "tool ID");
    this.write(`tool:${providerId}:${toolId}`, spendAmount(priceCeiling).toString());
  }

  dailySpend(accountId, account, timestamp) {
    const cutoff = timestamp - DAY_NS;
    let first = 0;
    let end = account.call_count;
    // Find the first checkpoint inside the window. Lookup cost grows logarithmically.
    while (first < end) {
      const middle = first + Math.floor((end - first) / 2);
      const checkpoint = this.read(`spend:${accountId}:${middle}`, null);
      if (BigInt(checkpoint.timestamp_ns) <= cutoff) first = middle + 1;
      else end = middle;
    }
    const expired = first === 0 ? 0n
      : BigInt(this.read(`spend:${accountId}:${first - 1}`, null).lifetime_spent);
    return BigInt(account.lifetime_spent) - expired;
  }

  dispense(caller, providerId, value, toolId, requestId) {
    const amount = spendAmount(value);
    validateAccount(providerId);
    validateIdentifier(toolId, "tool ID");
    validateIdentifier(requestId, "request ID");

    const receiptKey = `receipt:${caller}:${requestId}`;
    const previous = this.read(receiptKey, null);
    if (previous) {
      requireThat(
        previous.provider_id === providerId && previous.tool_id === toolId
          && previous.amount === amount.toString(),
        "Request ID already used for a different purchase",
      );
      return previous;
    }

    const ceiling = this.read(`tool:${providerId}:${toolId}`, null);
    requireThat(ceiling !== null, "Provider and tool pair is not registered");
    requireThat(amount <= BigInt(ceiling), "Tool price ceiling exceeded");
    const account = this.user(caller);
    const timestamp = this.host.timestamp();
    requireThat(this.dailySpend(caller, account, timestamp) + amount <= DAILY_CAP,
      "Rolling 24-hour cap exceeded");
    requireThat(BigInt(account.balance) >= amount, "Insufficient jar balance");

    const receipt = {
      account_id: caller,
      provider_id: providerId,
      tool_id: toolId,
      request_id: requestId,
      amount: amount.toString(),
      timestamp_ns: timestamp.toString(),
    };
    account.balance = (BigInt(account.balance) - amount).toString();
    account.lifetime_spent = (BigInt(account.lifetime_spent) + amount).toString();
    this.write(`spend:${caller}:${account.call_count}`, {
      timestamp_ns: receipt.timestamp_ns,
      lifetime_spent: account.lifetime_spent,
    });
    account.call_count += 1;
    this.write(`user:${caller}`, account);
    this.write(`provider:${providerId}`, (BigInt(this.providerBalance(providerId)) + amount).toString());
    this.write(receiptKey, receipt);
    this.host.log(`EVENT_JSON:${JSON.stringify({
      standard: "quarters",
      version: "1.0.0",
      event: "dispense",
      data: [receipt],
    })}`);
    return receipt;
  }

  userAccount(accountId) {
    validateAccount(accountId);
    const account = this.user(accountId);
    return {
      balance: account.balance,
      daily_spent: this.dailySpend(accountId, account, this.host.timestamp()).toString(),
      call_count: account.call_count,
      faucet_claimed: account.faucet_claimed,
    };
  }

  providerBalance(providerId) {
    validateAccount(providerId);
    return this.read(`provider:${providerId}`, "0");
  }
}
