# Dungeon Stake: Kings & Knights

A browser-based 5v5 team chess raid. Five heroes storm a dungeon defended by five enemies. Each side discusses and votes for its next legal chess move. The server plays the most-voted move after 60 seconds.

## Run

Requires Node.js 20.9+ and npm. Recommended: Node 22 or 24.

```sh
npm install
npm run dev
```

Open http://localhost:3000. Pick a class, enter a name, and create a raid. Share its six-character code with friends. Each browser tab has its own session; select an unoccupied class before joining. Five unique roles on each side make ten seats. Everyone presses Ready before the 2.5-second raid transition.

For a solo demonstration, choose **Fill empty seats with demo bots**, then **Ready**. Bots are explicitly labeled. The host can resolve a demo turn early. In a human room, there is no fast-forward. Use a different browser/profile or tab to test multiple players. The default server binds to localhost. For LAN or public access, first address the framework security advisory described below and deliberately configure the server hostname.

## Rules

- Heroes are white; enemies are black. All classes have equal voting power and no hidden chess abilities.
- One replaceable vote per active teammate per turn. Submit standard algebraic notation, such as `e4`, `Nf3`, `O-O`, or `e8=Q`. chess.js validates moves; invalid votes are rejected.
- At 60 seconds, the most-voted valid move executes. Tied leaders are randomly chosen using Node's cryptographic RNG. With no valid votes, the server randomly chooses a legal move.
- Each team also has a ten-minute total clock, including its voting time. Running out loses the match. This distinguishes a turn deadline (automatic move) from a match timeout (loss).
- Checkmate wins. Stalemate, repetition, insufficient material and other draws recognized by chess.js refund mock deposits.
- Team chat and vote proposals are visible only to that team. Chat is writable during its turn.
- Ready deposits **100 pretend coins**. Winners split the 1,000-coin mock pot: 200 each. Losing players receive zero. A draw returns 100 each. These coins have **no monetary value**. `depositStake()` and `slashLosers()` are local placeholder functions; no wallet, contract, NEAR transaction or real payout is connected.

## Checks

```sh
npm test
npm run build
npm start
```

Tests cover lobby readiness, capacity through unique roles, legal voting, vote replacement, majority, ties, fallback, stale votes, checkmate, timeout, private snapshots and conserved/idempotent mock payouts.

## Architecture and limits

Next.js 14 App Router, React Context on the client, an authoritative Node server room store, chess.js 1.4 and react-chessboard 4.7.3. Browser snapshots poll every 700ms; a server interval advances deadlines independently. Refresh retains a seat in sessionStorage. Rooms are in memory and expire after two hours without access; a server restart loses them. Run **one long-lived Node process**, not horizontally scaled/serverless instances. No durable accounts, anti-sybil identity or reconnect seat reclamation is implemented. A seat left during a match remains until the match ends. Match clocks continue through disconnects.

Dependency note: the requested Next.js 14 line has unresolved security advisories in `npm audit`, including a critical Windows-hosted server advisory. Keep this prototype local; upgrade to a supported patched Next.js release before public hosting. A successful build does not mean a clean security audit.

## Art and third-party work

Original static sprites authored with the `sprite` skill from [melodic-software/claude-code-plugins](https://github.com/melodic-software/claude-code-plugins/tree/main/plugins/pixel-art), adapting its Walker kit and using its **native** renderer. The requested `skills add ... --skill sprite` command failed to discover this nested skill; its runtime was installed manually. Character generators, spec files and review brief are in `public/assets/sprites/`. Each subdirectory has `sheet.png` at 1x, `sheet.json`, a larger review preview and a gallery. Ten characters plus grass and stone tiles. The app uses only the 1x sheet PNGs with CSS pixelated rendering. No generated high-resolution images are used as pixel art.

Asset gallery: http://localhost:3000/assets/sprites/index.html. To regenerate, install the pixel-art plugin's scripts under `.claude/skills/sprite/scripts/`, then run `python public/assets/sprites/generate.py`.

Libraries: Next.js, React, Tailwind CSS, chess.js and react-chessboard. AI-assisted implementation; original game-specific UI and server logic.

## Hackathon scope

This is a fresh pivot replacing the previous project in this repository during the hackathon. Git history is retained and `HACKATHON.md` is unchanged. Phase 1 intentionally has **no NEAR integration**; a real testnet economy is future work, not a completed feature. Submission metadata and public demo must be updated and confirmed before submission. This prototype should not be described as live Web3 staking.
