# Dungeon Stake · Arcade

Dungeon Stake is a top-down 5v5 browser arena. Five heroes play against five monsters in Football and Ice Hockey.

**Dungeon Fighters** is a separate 1v1 cabinet with six fighters. Open `/fighters`, pick a fighter, and select **Fight CPU** or create a room for a friend. Both players ready up before the first round and agree to an online rematch. The first to win two rounds takes the match. Each round runs for up to 60 seconds. Ties can extend the match to five rounds.

Use the arrow keys to move, jump, and block. Press Z for a light attack, X for a heavy attack, and C for a special when the meter has at least 35 points. WASD and touch controls also work. The cabinet uses original pixel sprites with six poses per fighter.

## Play locally

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Pick Football, Ice Hockey, or Dungeon Fighters. Select **Free · 0 NEAR** to create a room without a wallet, then share the room code. Solo practice is free in every cabinet.

In Football and Ice Hockey, invite between one and nine friends. When everyone has joined, the host selects **Balance teams and fill with bots**. With four humans, the arena assigns two humans and three bots per side. Everyone still readies up individually. If a human leaves before kickoff, bots are cleared so a replacement can join.

Move with WASD, arrow keys, or the touch direction pad. Space or the touch action button does the following in each mode.

- Football: kick the ball toward the opposing gate.
- Ice Hockey: skate across the rink, bank the puck off the boards, and shoot.

The first team to reach the mode target wins: 10 football goals or 7 hockey goals. If time runs out first, the higher score after three minutes wins. A tie goes to 30 seconds of sudden death. The next score wins, or the match ends in a draw if nobody scores.

## NEAR Testnet demo

1. Build the escrow on Linux with `cd contracts/arcade_escrow && npm ci && npm run build`, or run **Build arcade escrow** in GitHub Actions and extract `arcade_escrow.wasm` from its artifact.
2. Deploy the WASM to a **fresh named Testnet contract account** using `npx near-cli-rs` → **contract** → **deploy** → **use-file**. Initialize it with `init`, JSON arguments `{"referee":"YOUR_REFEREE.testnet"}`, 100 Tgas, and 0 NEAR. The contract account signs the deployment. Keep the unrelated Vending Jar account separate.
3. Create a dedicated signing key for the named referee Testnet account. Register its public key on that account with NEAR CLI under **account → add-key → grant-function-call-access**, restricting its receiver to the escrow contract and its methods to `settle`. Use a Testnet gas allowance adequate for the demo. Put the private part of this restricted key in `NEAR_REFEREE_KEY` in `.env.local`. Copy the remaining variables from `.env.example` and set the contract and referee account IDs. Restart the app. The server checks the deployed contract before enabling paid rooms.
4. Create a friend room with **0.01**, **0.05**, or **0.1 NEAR** per human. Join from a second browser profile with a different Meteor Testnet account. In each lobby, select **Deposit or confirm with Meteor**, approve the stake, and ready up. Football and Hockey can fill the remaining seats with bots. Dungeon Fighters needs two humans for a staked duel.
5. Finish the match. The server submits its result using the escrow-only referee key. Human winners split the pool. Draws return each stake. Select **Withdraw escrow balance** to transfer the Testnet NEAR to the wallet.

Paid lobbies expire after 15 minutes. If a match never settles, the original wallet can reclaim its deposit 25 minutes after funding through **Testnet payouts and refunds**. The browser saves match and seat receipts before sending deposits. The same wallet can also call `refund({match_id, seat_id})` and `withdraw()` directly on the contract.

## Implementation

The lobby and match API run in one long-lived Node process. The server owns gameplay and attests to results as the trusted Testnet referee. The contract verifies locked deposits, calculates payouts, and holds balances for withdrawal. Room state resets on restart, while funds and refund deadlines remain on-chain. The browser draws the arenas on Canvas 2D. Each tab has its own seat.

The pitch and characters reuse the project's original native sprite sheets under `public/assets/sprites`.

Run `npm test` for match rules and `npm run test:http` with the local server running for shared room and movement checks.
