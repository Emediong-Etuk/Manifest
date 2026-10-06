# Technical demo script (≈3 minutes)

Colosseum asks for a 2–3 minute technical demo: core features, tech stack, and the
decisions behind them, focused on how the product uses Solana
([Colosseum: perfecting your submission](https://blog.colosseum.com/perfecting-your-hackathon-submission/)).
**Confirm the current limits in the Arena form before recording.**

Everything below is on **devnet**, with real transactions. Click paths use the exact
button labels in the app.

## Rehearsed

The whole script runs as a Playwright test on a local validator, click for click
(`app/e2e/rehearsal.spec.ts`; Phantom replaced by the local test wallet, dial.to by the
same Actions GET/POST). If you change a label in the app, run it again:
`E2E_MINT=<mint> pnpm --filter @manifest/app exec playwright test e2e/rehearsal.spec.ts`.
Last run: Oct 5, passed in 24 s.

Dele's address for the transfer (public key only, nothing written):
`pnpm --filter @manifest/scripts export-wallet --name demo-buyer-dele --public`.

## Before you record (20 minutes, once)

1. **Fresh demo state** (repo root, `.env.local` pointing at devnet and the deployed app):
   ```bash
   pnpm --filter @manifest/scripts seed-demo     # first time only (Eastline, LAG-1014, LAG-0930, dispute)
   pnpm --filter @manifest/scripts demo-reset    # every take: a fresh open container + a fresh arrived one
   pnpm --filter @manifest/scripts crank         # nothing pending
   ```
   From the demo-reset output note: the first container URL (call it **LAG-NEW**), the
   arrived container (**LAG-ARR**), **Ada's pickup** URL and the **Resolve** command. Each
   take uses up a pickup and a dispute; demo-reset makes new ones, and tops up Eastline's
   guarantee to cover them.
2. **Wallets in Phantom (devnet):** Phantom → Settings → Developer settings → Testnet mode
   → Solana Devnet. Then import two demo keys:
   ```bash
   pnpm --filter @manifest/scripts export-wallet --name demo-forwarder-eastline
   pnpm --filter @manifest/scripts export-wallet --name demo-trader-ada
   ```
   Each writes `.keys/<name>.phantom.txt`. In Phantom: Add account → Import private key →
   paste the single line → name it "Eastline" / "Ada". **Delete the .txt files afterwards.**
   Your own Phantom account ("Trader") stays empty: you'll fund it on camera.
3. **Two browser windows side by side:**
   - **Window A (trader):** Chrome profile with Phantom on account **Trader**.
   - **Window B (forwarder):** second Chrome profile with Phantom on account **Eastline**,
     open at `<app>/forwarder/c/<LAG-NEW>`.
4. **Terminal** with the test output ready: run `cargo test -p manifest-tests` once and keep
   the green summary on screen. Open `docs/ARCHITECTURE.md` on GitHub in a tab.
5. A photo of a carton (or `scripts/demo-assets/cartons-stack.jpg`) on the desktop for the
   upload.

## Script

| Time      | Show                                                                                                                                                                                                                                                                                                                           | Say (short)                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:20 | README architecture diagram                                                                                                                                                                                                                                                                                                    | "One Anchor program holds the money. Escrow and guarantees sit in token accounts owned by program PDAs, so only its instructions can move them. Next.js app, Squads arbitrator."                         |
| 0:20–0:35 | `docs/ARCHITECTURE.md`: accounts table + consignment state machine                                                                                                                                                                                                                                                             | "Config, Forwarder, Container, Consignment. Twenty-six instructions; every status change is one of these arrows."                                                                                        |
| 0:35–0:45 | Terminal: `test result: ok. 95 passed`                                                                                                                                                                                                                                                                                         | "95 LiteSVM tests on the real binary: every must-fail case, money conservation, invariants checked after each step."                                                                                     |
| 0:45–1:05 | **Window A**: `dial.to/?action=solana-action:<app>/api/actions/book/<LAG-NEW>&cluster=devnet` → fill goods `300`, CBM `0.25`, supplier = Dele's address, description → **Book space** → approve in Phantom                                                                                                                     | "A Blink. The Action builds and simulates `book_consignment`; my $406.75 is now in an escrow vault owned by the shipment's PDA." (If the wallet is empty, first **Get test dollars** in the app banner.) |
| 1:05–1:30 | **Window B** (Eastline): refresh → new shipment → **Goods arrived at the warehouse: record receipt** → pick the photo, measured `0.22`, cartons `3`, packing list → **Upload evidence and record receipt** → approve                                                                                                           | "At the warehouse the forwarder signs the upload. The server strips EXIF and returns the SHA-256 of the canonical manifest; that hash goes onchain."                                                     |
| 1:30–1:50 | **Window A**: **My shipments** → the new shipment → **VERIFIED · Matches the record on Solana** → **Approve goods** → **Yes, pay $300.00** → approve. (Approve within 2 minutes or the crank auto-approves.)                                                                                                                   | "My browser re-hashes the manifest and compares it with the chain. Approving pays the supplier, refunds unused freight and mints my Cargo Ticket."                                                       |
| 1:50–2:05 | Phantom → Collectibles: the **Manifest Cargo Ticket**; then on the shipment page **Sell goods in transit (transfer Cargo Ticket)** → Dele's address → type its last 4 characters → **Transfer ticket**                                                                                                                         | "A Token-2022 NFT: metadata in the mint, a permanent delegate that only the program can sign for, used to burn it at settlement. Transferable, so goods at sea can be sold."                             |
| 2:05–2:30 | Phantom A → account **Ada** → Ada's pickup URL (from demo-reset) → **Show pickup code** → **Can't scan? Copy the code**. **Window B** → `<app>/forwarder/c/<LAG-ARR>` → **Pickup scanner** → **Paste a code instead** → paste → **Check code** → **Valid ticket**. Window A → **I've collected my goods** → **Confirm pickup** | "At Lagos the holder signs a pickup code; the forwarder checks it against the chain. Confirming burns the ticket and releases the freight to the forwarder in the same transaction."                     |
| 2:30–2:50 | Terminal: the **Resolve** command demo-reset printed (`resolve-dispute … --resolution slash --amount 500`; four links print) → `<app>/admin` → **Paid from guarantees**                                                                                                                                                        | "Disputes go to a 2-of-3 Squads multisig. The vault is the program's arbitrator: proposal, two approvals, execute. $500 moved from Eastline's guarantee to the ticket holder."                           |
| 2:50–3:00 | Click any **View on Solana Explorer** link                                                                                                                                                                                                                                                                                     | "Every step you saw is a devnet transaction. Code, tests and docs are open source."                                                                                                                      |

## If something goes wrong

- **"You already got test dollars today"**: use `pnpm --filter @manifest/scripts fund-wallet --address <wallet>`.
- **Auto-approved before you clicked**: the crank ran. Book again on LAG-NEW, or pause the
  GitHub crank workflow while recording.
- **Blink doesn't load on dial.to**: the app must be on public HTTPS; book from the app's
  **Book space** page instead and say it's the same transaction builder.
- **The Cargo Ticket isn't under Phantom → Collectibles** (Token-2022 NFT display on devnet
  is untested here): open the ticket mint on Solana Explorer from the shipment page instead;
  Explorer shows the Token-2022 metadata, supply 1 and the holder.
- **Phantom shows the Google/Apple $1,000/day warning**: keep goods ≤ $300 in the demo.
