import { Jar } from "../../contracts/vending_jar/src/jar.js";
import { probeJar } from "../../services/vending_mcp/attacks.js";
import { tools } from "../../services/vending_mcp/tools.js";

const owner = "jar.testnet";
const buyer = "demo.testnet";
const provider = "provider.testnet";
const researchTool = "fetch_paywalled_research";

export function createDemoWorkspace() {
  const store = new Map();
  const jar = new Jar(owner, {
    read: (key) => store.get(key),
    write: (key, value) => store.set(key, value),
    timestamp: () => BigInt(Date.now()) * 1_000_000n,
    log: () => {},
  });
  jar.deposit(buyer, 5n * 10n ** 24n);
  for (const [id, tool] of Object.entries(tools)) jar.registerProvider(owner, provider, id, tool.amount);

  const snapshot = () => ({ ...jar.userAccount(buyer), faucetAvailable: true, accountId: buyer });
  return {
    snapshot,
    faucet() {
      jar.faucet(buyer);
      return snapshot();
    },
    purchase(toolId, input) {
      const tool = tools[toolId];
      const args = tool.schema.parse(input);
      const requestId = crypto.randomUUID();
      const event = jar.dispense(buyer, provider, tool.amount, toolId, requestId);
      return {
        result: tool.render(args), account: snapshot(),
        receipt: { requestId, toolId, amount: event.amount, timestamp: Number(BigInt(event.timestamp_ns) / 1_000_000n) },
      };
    },
    attack() {
      return { log: probeJar(jar, buyer, provider, researchTool, crypto.randomUUID()) };
    },
  };
}
