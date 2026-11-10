import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createVendingClient } from "./client.js";
import { startPaywall } from "./http.js";
import { createMcpServer } from "./mcp.js";
import { connectTestnet, createNearPayer, createNearVerifier } from "./near.js";
import { createPaywall } from "./paywall.js";

async function main() {
  const {
    QUARTERS_NEAR_RPC_URL: rpcUrl = "https://rpc.testnet.near.org",
    QUARTERS_CONTRACT_ID: contractId,
    QUARTERS_PROVIDER_ID: providerId,
    QUARTERS_PAYER_ID: accountId,
    QUARTERS_AGENT_PRIVATE_KEY: secretKey,
  } = process.env;
  if (!contractId || !providerId || !accountId || !secretKey) {
    throw new Error("Set QUARTERS_CONTRACT_ID, QUARTERS_PROVIDER_ID, QUARTERS_PAYER_ID and QUARTERS_AGENT_PRIVATE_KEY");
  }
  const rpc = await connectTestnet(rpcUrl);
  const pay = createNearPayer({ rpc, accountId, contractId, secretKey });
  const verifyPayment = createNearVerifier({ rpc, contractId });
  const { origin, close } = await startPaywall(createPaywall({ providerId, contractId, verifyPayment }));
  const purchase = createVendingClient({
    baseUrl: origin, providerId, contractId, pay,
    onPayment: (receipt) => process.stderr.write(`${JSON.stringify(receipt)}\n`),
  });
  const mcp = createMcpServer(purchase);
  mcp.server.onclose = () => { void close(); };
  process.stdin.once("end", () => { void mcp.close(); });
  try {
    await mcp.connect(new StdioServerTransport());
  } catch (error) {
    await close();
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(`Quarters: ${error.message}\n`);
  process.exitCode = 1;
});
