# Competitive landscape

> **Status (Phase 0, Oct 4):** the off-chain section is drafted. The **past Colosseum
> projects** section is pending a Colosseum Copilot search, which needs Greg's Copilot
> sign-in (see `docs/SETUP_CHECKLIST.md`). If Copilot turns up a near-identical project,
> we stop and sharpen the wedge before Phase 1 goes further.

## Past Colosseum hackathon projects

_Pending Copilot._ Queries to run: "letter of credit", "trade finance", "escrow import",
"freight", "shipping", "bill of lading", "cargo", "Nigeria import", "Africa trade",
"supply chain escrow".

| Project                             | Hackathon | One-line summary | How Manifest differs |
| ----------------------------------- | --------- | ---------------- | -------------------- |
| _to be filled from Copilot results_ |           |                  |                      |

## Off-chain alternatives today

| Alternative                            | What it does                                                                                       | Why it doesn't serve a Computer Village / Alaba micro-importer                                                                                                                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Informal payment agents**            | Take naira or USDT, pay the Chinese supplier in RMB, often bundled with sourcing and consolidation | Money moves upfront and blind. No escrow, no proof of goods before payment, no recourse if the agent disappears. Trust comes from WhatsApp testimonials that are easy to fake.                                                                                    |
| **Bank letters of credit**             | Bank pays the seller when shipping documents are presented                                         | Built for full-container importers: minimum sizes, collateral, Form M paperwork, fees, and weeks of processing. Out of reach for someone shipping 1–3 CBM in a shared container. Documents prove shipment, not that the right goods went into a shared box.       |
| **Alibaba.com Trade Assurance**        | Platform escrow-style protection on orders placed and paid through Alibaba.com                     | Covers only orders placed through Alibaba.com. Most Nigerian traders source via 1688, the Yiwu market or WeChat-based suppliers through agents, which are outside its scope. It protects the order, not the shared-container leg or the Lagos warehouse handover. |
| **Cross-border payment / FX fintechs** | Faster, cheaper naira→RMB or USD payouts to suppliers                                              | Solve moving money, not trusting the counterparty. Payment is still released before goods are verified.                                                                                                                                                           |
| **Freight forwarders' own guarantees** | Reputation, WhatsApp groups, sometimes an informal promise to cover lost cartons                   | Unenforceable and unverifiable. A new trader can't tell a reliable forwarder from a bad one, and a good forwarder can't prove they're good.                                                                                                                       |

## Why Manifest is different (README statement)

Manifest is not just escrow: it is a pay-on-proof system built for the
shared-container leg, where small importers actually lose money. Funds release to the
supplier only after the forwarder photographs and measures the goods at the China
warehouse and the trader approves, and every forwarder must post a slashable bond that
backs the traders' open goods value. Each approved consignment becomes a transferable
Cargo Ticket, so goods in transit can be sold onward, and every delivery builds a public,
unfakeable forwarder track record.
