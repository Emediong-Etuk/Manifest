# Product demo script (≈2.5 minutes)

A screen recording of the product from the user's side: one trader's shipment from booking to
pickup, in plain language. For the code, tests and architecture, use the technical demo
(`docs/DEMO_SCRIPT.md`). Everything is live on **devnet**; nothing on screen is mocked.

## Setup (once, before the first take)

1. **Fresh demo state** from the repo root:
   ```bash
   pnpm --filter @manifest/scripts demo-reset
   ```
   From the output, note the open container (**LAG-NEW**), the arrived container
   (**LAG-ARR**) and **Ada's pickup URL**. Run demo-reset again before every take.
2. **Phantom (devnet)** with three accounts, as set up in `docs/DEMO_SCRIPT.md` step 2:
   **Trader** (your own, empty), **Ada** and **Eastline**.
3. **Two browser windows side by side**, both at https://manifest-seven-tau.vercel.app:
   - **Window A, the trader:** Phantom on **Trader**, open on the landing page, signed out.
   - **Window B, the forwarder:** a second Chrome profile, Phantom on **Eastline**, open at
     `/forwarder/c/<LAG-NEW>`. The landing page's **Book on …** button picks the open
     container with the soonest cut-off; if it names a different container, open the
     forwarder window on that one instead.
4. A carton photo on the desktop (`scripts/demo-assets/cartons-stack.jpg` works).
5. Close other tabs, hide bookmarks, set the browser zoom to 110–125% so text reads on video.

**Timing rule:** once the forwarder records the receipt, the trader has 2 minutes to approve
before the review window lapses. Keep scenes 4 and 5 back to back.

## Script

| #   | Time      | Show                                                                                                                                                                                                                                         | Say                                                                                                                                                                                                                                      |
| --- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 0:00–0:15 | **Window A**: landing page, slow scroll over the hero                                                                                                                                                                                        | "Small importers in Lagos pay Chinese suppliers upfront and find out weeks later, at the port, whether the goods are short, wrong or never shipped. Manifest changes the order: you pay only after you see proof."                       |
| 2   | 0:15–0:30 | **Try it in 2 minutes** card: **Sign in** → approve in Phantom → **Get 500 test dollars** → the ✓ appears                                                                                                                                    | "I sign in with my wallet and grab some test dollars. On mainnet, this is USDC."                                                                                                                                                         |
| 3   | 0:30–0:55 | **Book on LAG-NEW** → **Goods**: `300`, "200 phone cases" → **Next** → **Volume**: `0.25` CBM → **Next** → **Supplier**: **Use a test supplier address** → **Next** → **Summary** → **Lock $… and book** → approve. The shipment page opens. | "I book a quarter of a cubic metre in a shared container from Guangzhou to Apapa. The goods money, freight and fee go into an escrow on Solana. Not to my agent, not to the supplier. Nobody can touch it except the rules."             |
| 4   | 0:55–1:20 | **Window B** (Eastline): refresh → the new shipment → **Goods arrived at the warehouse: record receipt** → add the photo, measured `0.22` CBM, `3` cartons → **Upload evidence and record receipt** → approve                                | "Two weeks later the cartons reach the forwarder's warehouse in China. They photograph and measure them, and the fingerprint of that evidence is written onchain, so nobody can swap the photos later."                                  |
| 5   | 1:20–1:45 | **Window A**: the shipment page updates → the photos and the **VERIFIED** badge → **Approve goods** → **Yes, pay $300.00** → approve → the **Cargo Ticket** appears                                                                          | "Back in Lagos, I see my actual goods, and the app confirms the photos match the record onchain. Only now is my supplier paid. Unused freight comes back to me, and I get a Cargo Ticket: my right to collect these goods."              |
| 6   | 1:45–1:55 | Scroll to **Sell goods in transit (transfer Cargo Ticket)**; don't transfer                                                                                                                                                                  | "The ticket is transferable. If I sell the goods while they're at sea, the buyer collects them."                                                                                                                                         |
| 7   | 1:55–2:10 | **Window A**: switch Phantom to **Ada** → open Ada's pickup URL (her container has arrived). Point at **Missing, damaged or overdue? Open a dispute**; don't click                                                                           | "Here's Ada, whose container has just landed in Lagos. If anything were missing or damaged, she'd open a dispute. Every forwarder locks a guarantee onchain, and an independent multisig can refund her or pay her from that guarantee." |
| 8   | 2:10–2:35 | **Show pickup code** → approve. **Window B**: `/forwarder/c/<LAG-ARR>` → **Pickup scanner** → **Paste a code instead** → paste → **Check code** → **Valid ticket**. **Window A**: **I've collected my goods** → **Confirm pickup** → approve | "Everything's fine, so she shows a pickup code from her wallet. The forwarder checks it against the chain, she collects her cartons, and only then is the forwarder paid their freight."                                                 |
| 9   | 2:35–2:45 | Landing page, live stats                                                                                                                                                                                                                     | "Manifest: a letter of credit for traders too small for a bank. Pay on proof. Built on Solana."                                                                                                                                          |

## Tips

- **Record the voice separately** and lay it over the screen recording; it's easier than
  clicking and talking at once. Each "Say" line fits its time slot at a calm pace.
- **Phantom popups:** keep them on screen when you approve; they show it's a real transaction.
- **If the faucet says you already got test dollars today:**
  `pnpm --filter @manifest/scripts fund-wallet --address <wallet>`, then refresh.
- **If the shipment was approved before you clicked** (the review window lapsed): run
  demo-reset and retake from scene 3.
- **Pickup code expired** (it's valid for 10 minutes): click **Sign a new pickup code**.
- **Keep goods at $300 or less**, because Phantom's embedded wallets have a $1,000/day limit.
