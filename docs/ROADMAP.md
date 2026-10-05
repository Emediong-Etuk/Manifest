# Roadmap

What comes after the hackathon MVP. None of it is in the deployed program today.

## Reflect: a guarantee that earns yield {#reflect}

A forwarder's bond is locked capital. If it could sit in a yield-bearing dollar, the
guarantee would stop being dead money, and more forwarders could afford a bigger one.

- **Status (Oct 5, 2026):** not integrated. We found no Reflect devnet deployment in the
  Solana developer docs index, so there is nothing real to test against on devnet.
- **What's ready:** `config.bond_mints` holds up to four mints. A yield-bearing stable mint
  can be added with `update_config`. Coverage math assumes a ~1:1 USD stablecoin with
  6 decimals.
- **Before adding one:** check its Token-2022 extensions. The program rejects
  `TransferFee`, `TransferHook`, `PermanentDelegate`, `NonTransferable`,
  `DefaultAccountState`, `ConfidentialTransfer`, `Pausable` and `ScaledUiAmount`
  (see `docs/SECURITY.md`). A rebasing or interest-bearing display mint needs a review of
  how coverage is valued.
- **No CPI from our program into Reflect.** The bond stays a plain token balance the
  program can slash.

## Kora: gasless transactions {#kora}

Traders shouldn't need SOL. On devnet the gas tank (`/api/faucet`) sends a little SOL with
the test dollars, which is enough for a demo.

- **Mainnet plan:** a Kora fee-payer node that sponsors Manifest transactions and charges
  the fee in the payment stablecoin.
- **Phantom constraint:** embedded wallets only support `signAndSendTransaction` (no
  sign-only). A dapp fee payer needs Phantom's `presignTransaction` callback, so the app
  signs as fee payer first. Not built yet: it can't be tested in our CI container without
  the Phantom extension (see `docs/DECISIONS.md`, Phantom findings).

## Product

- **Squads timelock** on arbitration, and market-association members on the multisig.
- **Admin to Squads.** Move `config.admin` and the upgrade authority to a multisig with a
  timelock, or make the program immutable.
- **Close settled vaults** to return rent (~0.002 SOL per shipment).
- **Helius webhooks → Telegram:** "Your goods arrived at the Guangzhou warehouse. Review the
  photos."
- **Altitude** (Squads' stablecoin operating account) as the mainnet treasury and payout
  stack for protocol fees.
- **Naira on-ramp** partners, so traders can fund escrow without a payment agent.
