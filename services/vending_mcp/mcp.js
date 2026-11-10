import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { tools } from "./tools.js";

export function createMcpServer(purchase) {
  const server = new McpServer({ name: "quarters-vending", version: "0.2.0" });
  for (const [id, tool] of Object.entries(tools)) {
    server.registerTool(id, {
      description: tool.description,
      inputSchema: tool.schema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    }, async (input) => {
      const purchaseResult = await purchase(id, input);
      return {
        content: [{ type: "text", text: JSON.stringify(purchaseResult) }],
        structuredContent: purchaseResult,
      };
    });
  }
  return server;
}
