export async function requestLive(token, body, onReceipt) {
  const response = await fetch("/api/live", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok || body.action !== "purchase") {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    return payload;
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) throw new Error("The Testnet connection closed before returning the result. Check the receipt before retrying.");
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        const event = JSON.parse(line);
        if (event.type === "receipt") onReceipt(event.receipt);
        if (event.type === "result") return event.payload;
        if (event.type === "error") throw new Error(event.error);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
