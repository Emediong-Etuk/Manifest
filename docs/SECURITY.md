# Security

Status: Phase 2 self-review (Oct 4, 2026). **Not audited.** Devnet only.

Method: every program file run through the Solana Developer MCP `program_autofixer`
(0 open issues), a manual walk through the Solana Foundation / Blueshift program-security
checklist (below), and 94 LiteSVM integration tests plus 12 unit tests, including
account-substitution attempts and the invariants listed here.

## Security invariants

Each one is asserted in `tests/src` (helpers `assert_vault_matches_state` and
`assert_bond_covers` in `fixtures.rs` run after every step of the lifecycle tests).

1. **Only program PDAs move escrow and bonds.** Each consignment vault is a token account
   owned by its consignment PDA; each bond vault is owned by its forwarder PDA. Transfers
   out are signed with PDA seeds inside the program.
2. **Vault balance equals state.** Before approval the vault holds goods + fee + freight;
   after approval it holds `freight_escrowed` only; after settlement it is empty
   (`Consignment::escrow_held`).
3. **Bond covers locked coverage** (`bond_balance >= locked_coverage`) after every
   instruction, with one documented exception: a slash can pay out more than the coverage
   it released. New bookings and bond withdrawals are then blocked until the forwarder
   tops up.
4. **Status transitions follow the state machine only.** Every handler checks the current
   status first (see `docs/ARCHITECTURE.md`).
5. **Mints are validated.** Escrow mint == container mint and is in `config.payment_mints`;
   the bond mint is in `config.bond_mints`; every configured mint has 6 decimals; token
   program IDs come from Anchor's `Interface` types; Token-2022 mints with escrow-unsafe
   extensions are rejected (see below).
6. **The Cargo Ticket has supply 1, decimals 0, no mint authority and no freeze
   authority.** Pickup, disputes and payouts require the account holding it (`amount == 1`).
7. **No reinitialization.** Program state uses `init` only; `init_if_needed` is used only
   for associated token accounts.
8. **Time comes from the Clock sysvar.** Cut-off must be in the future and before the ETA.
9. **No account closures** for Config / Forwarder / Container / Consignment: history is
   the reputation. Trade-off: rent stays locked: about 0.0036 SOL per consignment account
   plus 0.002 SOL for its (empty) vault token account. Closing settled vaults is a roadmap item.
10. **Checked arithmetic everywhere.** u128 intermediates, `try_from` back to u64, no `as`
    casts; boundary tests with `u64::MAX`.

## Threat model

| Threat                                                                    | Mitigation                                                                                                                                                                                                                                                                | Residual risk                                                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Forwarder lies in a receipt** (photos of the wrong goods, wrong volume) | The trader reviews the evidence before the supplier is paid and can reject → dispute. The forwarder's bond backs 20% of open goods value and can be slashed. The evidence manifest is hashed onchain, so it can't be swapped afterwards.                                  | A trader who doesn't review in time is auto-approved. The bond covers only `coverage_bps` of goods value.                      |
| **Forwarder loses or damages cartons after loading**                      | The holder opens a dispute within the window after arrival; the arbitrator can slash the bond.                                                                                                                                                                            | Physical-world facts are judged off-chain by the arbitrator.                                                                   |
| **Container never arrives**                                               | Holder can dispute once `eta + overdue_grace` passes; slash compensates.                                                                                                                                                                                                  | Bounded by the bond.                                                                                                           |
| **Trader griefing by silence**                                            | `auto_approve` after the review window (permissionless; the crank calls it).                                                                                                                                                                                              | —                                                                                                                              |
| **Trader never picks up**                                                 | `claim_freight_after_grace` pays the forwarder after the pickup grace period.                                                                                                                                                                                             | If freight is short (measured volume > escrow) and nobody tops up, the forwarder can't claim; they keep the goods as leverage. |
| **Arbitrator compromise**                                                 | Squads multisig. The arbitrator can only choose _between_ the parties: refunds go to the trader, slashes to the current ticket holder, force-approve pays the recorded payee. It can never send funds to itself.                                                          | A compromised multisig can still decide disputes wrongly. Roadmap: timelock + market-association members.                      |
| **Admin compromise**                                                      | Admin can't touch escrow or bonds. It can pause new bookings, change the treasury (future fees), change windows (applied at receipt time) and allowed mints. `initialize_config` is gated on the upgrade authority.                                                       | Mint allow-list and window changes are trusted. Roadmap: admin → Squads with timelock.                                         |
| **Evidence tampering**                                                    | SHA-256 of the canonical evidence manifest is stored onchain at receipt; the app recomputes it in the browser.                                                                                                                                                            | Storage availability (IPFS pinning) is off-chain.                                                                              |
| **Permanent delegate abuse**                                              | The delegate of every Cargo Ticket is the program PDA `["ticket_authority"]`, which only this program can sign for, in exactly two paths: `claim_freight_after_grace` and `resolve_slash_bond`, both burning the ticket at final settlement. Explained in the UI tooltip. | Holders must trust the program code (open source, upgrade authority documented).                                               |
| **Account substitution** (fake payee, treasury, vault, holder, forwarder) | `has_one` against stored keys, `address = config.treasury_owner`, associated-token constraints derive token-account addresses, holder read from the unique account with `amount == 1`. Tests substitute payee and treasury and assert `AccountMismatch`.                  | —                                                                                                                              |
| **Stablecoin peg**                                                        | Coverage math assumes payment and bond mints are USD stablecoins at ~1:1 and requires 6 decimals.                                                                                                                                                                         | A depeg changes the real coverage.                                                                                             |
| **Stablecoin issuer freeze** (USDC/USDT have freeze authorities)          | Out of our control.                                                                                                                                                                                                                                                       | An issuer could freeze a vault.                                                                                                |

## Checklist walk (Solana Foundation / Blueshift)

| Check                              | Result                                                                                                                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner checks                       | All program state is `Account<T>` (owner + discriminator checked by Anchor); token accounts and mints are `InterfaceAccount`, owned by SPL Token or Token-2022.                                                                                |
| Signer checks                      | Every privileged action has a `Signer` tied to state: `has_one = authority / admin / arbitrator`, forwarder PDA seeds derived from the signer, `consignment.trader == payer`, ticket holder == token-account owner.                            |
| PDA validation and canonical bumps | Seeds + stored canonical bumps for config/forwarder/vaults/ticket authority; new accounts use Anchor's canonical `bump`.                                                                                                                       |
| Arbitrary CPI                      | CPIs go only to `Program<System>`, `Program<Token2022>`, `Program<AssociatedToken>` and `Interface<TokenInterface>`.                                                                                                                           |
| Reinitialization                   | `init` for program state and the ticket mint; `init_if_needed` only for ATAs.                                                                                                                                                                  |
| Type cosplay                       | Anchor 8-byte discriminators; no raw deserialization of program state.                                                                                                                                                                         |
| Duplicate mutable accounts         | Anchor 1.x rejects them by default. Booking forbids payee == trader / treasury and trader == treasury so approval never aliases. Known edge: a holder who is also the forwarder's wallet can't call `confirm_pickup` (aliased token accounts). |
| Lamport griefing on PDA init       | Anchor's `init` handles pre-funded addresses (allocate + assign path).                                                                                                                                                                         |
| Token-2022 extensions              | Payment/bond mints with TransferFee, TransferHook, PermanentDelegate, NonTransferable, DefaultAccountState, ConfidentialTransfer, Pausable or ScaledUiAmount are rejected at config time. All transfers use `transfer_checked`.                |
| Metadata pointer                   | The Cargo Ticket's pointer points to the mint itself (verified in tests).                                                                                                                                                                      |
| Rent                               | Ticket metadata rent is computed from the actual TLV length, not hardcoded; ATA rent comes from the ATA program.                                                                                                                               |
| Rounding                           | Fee rounds down (trader's favor), coverage rounds up (trader's favor), freight rounds up to the next base unit (≤ 0.000001 USD).                                                                                                               |
| remaining_accounts                 | Only used to pass mint accounts to config validation; matched by key.                                                                                                                                                                          |
| TOCTOU                             | Fee, coverage and freight rate are fixed at booking; the review deadline is fixed at receipt.                                                                                                                                                  |
| Upgrade authority                  | Deploy key (devnet). Roadmap: Squads or immutable.                                                                                                                                                                                             |

## Known limitations

- **Physical-world oracle.** The program proves _who said what, when_; the goods
  themselves are verified by people (trader review, arbitrator).
- **Owner reassignment on classic SPL Token accounts.** A trader or payee could reassign
  the owner of their own token account, which makes approval fail for that consignment.
  This only harms themselves; the trader can still dispute and be refunded by the arbitrator.
- **Freight shortfall liveness** (see the threat table).
- **Embedded-wallet limits** (Phantom) and **devnet only**.
