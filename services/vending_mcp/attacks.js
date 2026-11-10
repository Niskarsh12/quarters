export const ATTACKER_ID = "attacker.testnet";
export const DRAIN_AMOUNT = "10000000";
export const DRAIN_REJECTION = "Per-call cap exceeded";
export const VELOCITY_REJECTION = "Rolling 24-hour cap exceeded";
export const RECIPIENT_REJECTION = "Provider and tool pair is not registered";

export function probeJar(jar, accountId, providerId, toolId, requestId) {
  try {
    jar.dispense(accountId, providerId, DRAIN_AMOUNT, toolId, requestId);
  } catch (error) {
    if (error.message === DRAIN_REJECTION) return error.message;
    throw error;
  }
  throw new Error("The wallet drain was unexpectedly accepted");
}
