# The PaperHands Arena

A three-round survival game about deciding when to walk away. Players stake 0.1 Testnet NEAR. A Game Master sets the scene while the NEAR contract applies the same rules to every player.

Tracks are Games With Real Economies (`games`), Memecoins With Mechanics (`memecoins`), and Open Innovation (`open`). The PaperHands Tax is a redistribution mechanic using native Testnet NEAR.

## Try the browser demo

1. With Node.js 22, run `npm ci --omit=dev` and `npm run dev`. Open the printed URL. The practice lobby comes with five simulated entrants and Fast-forward enabled.
2. Click **Enter** to join. Click **Hold position** and then **Advance round**. Moth flees and the remaining balances rise. The floor log shows the exact event and the interface rounds displayed balances down to four decimal places.
3. Keep holding and advancing to settle. Try Reset and then **Flee** to preview and confirm the tax.
4. Run `npm run test:arena` for the economic checks and `npm run build` for the production frontend.

Practice mode uses the same integer accounting as the contract and runs independently in each browser. Simulated transactions use play balances. Fast-forward applies only to practice.

## Game rules

- Each lobby seats at most twelve. It starts with two or more entrants and refunds a solo player. Any account can advance when the time window ends, or when the lobby is full.
- Hold locks your decision for the current round. Flee immediately credits 75% of your current balance to you and divides the 25% tax among remaining players. Integer remainders go to survivors in entry order.
- Missing a deadline costs 50% if at least one player held. The confirmed holders split that tax. If everybody misses, the contract returns remaining balances. If every active player holds, anyone can advance the round immediately.
- The last survivor or the survivors at the end of round three can withdraw their full credited balances. Withdrawals use an on-chain transfer with a failure callback that restores the credit.

## Build and run on NEAR Testnet

On Linux, run `npm ci`, `npm run build:contract`, then deploy `build/paperhands_arena.wasm` to a fresh Testnet account and call `init({})` with the contract account. On Windows, use the **Build PaperHands Arena** GitHub Actions workflow and download the WASM artifact. The initial lobby stays open for ten minutes. After an arena finishes or is cancelled, the contract account can call `open_arena` with `join_seconds` and `round_seconds` between 30 and 86400.

Copy `frontend/.env.example` to `frontend/.env.local` and set the deployed contract ID, FastAuth Testnet client ID, and FastAuth-compatible Testnet relayer base URL. Configure Auth0 to allow your app origin and email login. Restart or rebuild the frontend. **Play on Testnet** enables email login and derives the player's Testnet account. Copy the account ID and fund it with Testnet NEAR to cover the stake. Each game action uses a signed NEP-366 delegate action. The configured relayer pays transaction gas.

For generated dilemmas, set `NEAR_AI_API_KEY` and `NEAR_AI_MODEL` to a route marked Private TEE in the NEAR AI model catalog. The server sends round context to NEAR AI Cloud and caches each response per UTC day and round for the running instance. It uses scripted dilemmas when the provider is unavailable. The model writes the fiction. The contract evaluates decisions and controls balances. This integration does not verify a per-response attestation in the browser.

## Code provenance

The repository was previously used for Quarters at [commit 1c0d972](https://github.com/Niskarsh12/quarters/commit/1c0d972). The arena replaces the Quarters product. The Next.js/Tailwind setup, dependency scaffolding, and WASM workflow pattern were reused. The arena key art was generated with OpenAI ImageGen.
