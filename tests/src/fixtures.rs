//! A standard test world: deployed program, a 6-decimal USD mint (used for both
//! payments and bonds), an admin who is the upgrade authority, an arbitrator and a
//! treasury owner, and helpers that drive each instruction.

use anchor_lang::prelude::Pubkey;
use manifest::constants::{CONFIG_SEED, METADATA_BASE_URI_LEN};
use manifest::state::ConfigParams;
use solana_keypair::Keypair;
use solana_signer::Signer;

use crate::harness::*;

pub const REVIEW_WINDOW: i64 = 120;

pub struct World {
    pub s: Svm,
    pub admin: Keypair,
    pub arbitrator: Keypair,
    pub treasury: Keypair,
    /// 6-decimal USD test mint (SPL Token), allowed for payments and bonds.
    pub usd: Pubkey,
}

pub fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[CONFIG_SEED], &manifest::ID).0
}

impl World {
    /// Program deployed, mint created, config NOT yet initialized.
    pub fn bare() -> Self {
        let mut s = Svm::new();
        let admin = s.funded_keypair();
        s.set_upgrade_authority(&admin.pubkey());
        let arbitrator = s.funded_keypair();
        let treasury = s.funded_keypair();
        let usd = s.create_mint(&admin, DECIMALS, &spl_token_id());
        Self {
            s,
            admin,
            arbitrator,
            treasury,
            usd,
        }
    }

    /// Program deployed and config initialized with demo-friendly windows.
    pub fn new() -> Self {
        let mut w = Self::bare();
        let params = w.default_params();
        w.initialize_config(&params, &[w.usd]).unwrap();
        w
    }

    pub fn default_params(&self) -> ConfigParams {
        let mut payment_mints = [Pubkey::default(); 4];
        payment_mints[0] = self.usd;
        let mut bond_mints = [Pubkey::default(); 4];
        bond_mints[0] = self.usd;
        ConfigParams {
            arbitrator: self.arbitrator.pubkey(),
            treasury_owner: self.treasury.pubkey(),
            payment_mints,
            bond_mints,
            fee_bps: 75,
            coverage_bps: 2_000,
            freight_buffer_bps: 1_000,
            review_window_secs: REVIEW_WINDOW,
            pickup_grace_secs: 300,
            dispute_window_secs: 600,
            overdue_grace_secs: 600,
            on_time_grace_secs: 604_800,
            metadata_base_uri: fixed::<METADATA_BASE_URI_LEN>("https://manifest.app/api/tickets/"),
            paused: false,
        }
    }

    pub fn initialize_config(&mut self, params: &ConfigParams, mints: &[Pubkey]) -> TxResult {
        let mut ix = Svm::ix(
            manifest::instruction::InitializeConfig {
                params: params.clone(),
            },
            manifest::accounts::InitializeConfig {
                admin: self.admin.pubkey(),
                config: config_pda(),
                program: manifest::ID,
                program_data: program_data_address(),
                system_program: anchor_lang::system_program::ID,
            },
        );
        push_readonly(&mut ix, mints);
        let admin = self.admin.insecure_clone();
        self.s.send(&[ix], &admin, &[])
    }

    pub fn update_config_as(
        &mut self,
        signer: &Keypair,
        params: &ConfigParams,
        mints: &[Pubkey],
    ) -> TxResult {
        let mut ix = Svm::ix(
            manifest::instruction::UpdateConfig {
                params: params.clone(),
            },
            manifest::accounts::UpdateConfig {
                admin: signer.pubkey(),
                config: config_pda(),
            },
        );
        push_readonly(&mut ix, mints);
        self.s.send(&[ix], signer, &[])
    }

    pub fn config(&self) -> manifest::state::Config {
        self.s.account(&config_pda())
    }
}

/// Append read-only remaining accounts (e.g. mints to validate).
pub fn push_readonly(
    ix: &mut anchor_lang::solana_program::instruction::Instruction,
    keys: &[Pubkey],
) {
    for key in keys {
        ix.accounts
            .push(anchor_lang::solana_program::instruction::AccountMeta::new_readonly(*key, false));
    }
}

// ---------------------------------------------------------------- forwarders

pub fn forwarder_pda(authority: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[manifest::constants::FORWARDER_SEED, authority.as_ref()],
        &manifest::ID,
    )
    .0
}

pub fn bond_vault_pda(forwarder: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[manifest::constants::BOND_VAULT_SEED, forwarder.as_ref()],
        &manifest::ID,
    )
    .0
}

/// A registered forwarder: wallet + PDAs.
pub struct Fwd {
    pub kp: Keypair,
    pub pda: Pubkey,
    pub vault: Pubkey,
    /// The forwarder wallet's USD associated token account.
    pub ata: Pubkey,
}

impl World {
    /// Create an ATA for `owner` and mint `amount` USD into it.
    pub fn fund_usd(&mut self, owner: &Pubkey, amount: u64) -> Pubkey {
        let admin = self.admin.insecure_clone();
        let ata = Svm::ata(owner, &self.usd, &spl_token_id());
        if !self.s.exists(&ata) {
            self.s.create_ata(&admin, owner, &self.usd, &spl_token_id());
        }
        if amount > 0 {
            self.s
                .mint_to(&admin, &self.usd, &ata, amount, &spl_token_id());
        }
        ata
    }

    pub fn register_forwarder_tx(
        &mut self,
        kp: &Keypair,
        name: &str,
        bond_mint: Pubkey,
    ) -> TxResult {
        let pda = forwarder_pda(&kp.pubkey());
        let ix = Svm::ix(
            manifest::instruction::RegisterForwarder { name: fixed(name) },
            manifest::accounts::RegisterForwarder {
                authority: kp.pubkey(),
                config: config_pda(),
                forwarder: pda,
                bond_mint,
                bond_vault: bond_vault_pda(&pda),
                token_program: spl_token_id(),
                system_program: anchor_lang::system_program::ID,
            },
        );
        self.s.send(&[ix], kp, &[])
    }

    /// Register a forwarder and deposit `bond` USD.
    pub fn forwarder(&mut self, name: &str, bond: u64) -> Fwd {
        let kp = self.s.funded_keypair();
        let usd = self.usd;
        self.register_forwarder_tx(&kp, name, usd).unwrap();
        let pda = forwarder_pda(&kp.pubkey());
        let ata = self.fund_usd(&kp.pubkey(), bond);
        let f = Fwd {
            kp,
            pda,
            vault: bond_vault_pda(&pda),
            ata,
        };
        if bond > 0 {
            self.move_bond(&f, bond, true).unwrap();
        }
        f
    }

    pub fn move_bond(&mut self, f: &Fwd, amount: u64, deposit: bool) -> TxResult {
        let accounts = manifest::accounts::MoveBond {
            authority: f.kp.pubkey(),
            forwarder: f.pda,
            bond_mint: self.usd,
            bond_vault: f.vault,
            authority_token_account: f.ata,
            token_program: spl_token_id(),
        };
        let ix = if deposit {
            Svm::ix(manifest::instruction::DepositBond { amount }, accounts)
        } else {
            Svm::ix(manifest::instruction::WithdrawBond { amount }, accounts)
        };
        self.s.send(&[ix], &f.kp, &[])
    }

    pub fn forwarder_state(&self, f: &Fwd) -> manifest::state::Forwarder {
        self.s.account(&f.pda)
    }
}

// ---------------------------------------------------------------- containers

pub const DAY: i64 = 86_400;
/// $380.00 per CBM.
pub const RATE: u64 = 380 * USD;
/// 28 CBM.
pub const CAPACITY: u32 = 28_000;

pub fn container_pda(forwarder: &Pubkey, index: u32) -> Pubkey {
    Pubkey::find_program_address(
        &[
            manifest::constants::CONTAINER_SEED,
            forwarder.as_ref(),
            &index.to_le_bytes(),
        ],
        &manifest::ID,
    )
    .0
}

impl World {
    /// LAG-1014: CNCAN -> NGAPP, Sea, 28 CBM, $380/CBM, cut-off in 10 days, ETA in 50.
    pub fn container_params(&self) -> manifest::instructions::OpenContainerParams {
        let now = self.s.now();
        manifest::instructions::OpenContainerParams {
            code: fixed("LAG-1014"),
            origin: *b"CNCAN",
            destination: *b"NGAPP",
            mode: manifest::state::ContainerMode::Sea,
            capacity_cbm_milli: CAPACITY,
            rate_per_cbm: RATE,
            cutoff_ts: now + 10 * DAY,
            eta_ts: now + 50 * DAY,
        }
    }

    pub fn open_container_tx(
        &mut self,
        f: &Fwd,
        params: manifest::instructions::OpenContainerParams,
        mint: Pubkey,
    ) -> TxResult {
        let index = self.forwarder_state(f).container_count;
        let ix = Svm::ix(
            manifest::instruction::OpenContainer { params },
            manifest::accounts::OpenContainer {
                authority: f.kp.pubkey(),
                config: config_pda(),
                forwarder: f.pda,
                container: container_pda(&f.pda, index),
                mint,
                system_program: anchor_lang::system_program::ID,
            },
        );
        self.s.send(&[ix], &f.kp, &[])
    }

    /// Open the standard container and return its address.
    pub fn container(&mut self, f: &Fwd) -> Pubkey {
        let index = self.forwarder_state(f).container_count;
        let params = self.container_params();
        let usd = self.usd;
        self.open_container_tx(f, params, usd).unwrap();
        container_pda(&f.pda, index)
    }

    pub fn close_booking_tx(&mut self, caller: &Keypair, f: &Fwd, container: Pubkey) -> TxResult {
        let ix = Svm::ix(
            manifest::instruction::CloseBooking {},
            manifest::accounts::CloseBooking {
                caller: caller.pubkey(),
                forwarder: f.pda,
                container,
            },
        );
        self.s.send(&[ix], caller, &[])
    }

    pub fn cancel_container_tx(&mut self, f: &Fwd, container: Pubkey) -> TxResult {
        let ix = Svm::ix(
            manifest::instruction::CancelContainer {},
            manifest::accounts::CancelContainer {
                authority: f.kp.pubkey(),
                forwarder: f.pda,
                container,
            },
        );
        self.s.send(&[ix], &f.kp, &[])
    }

    pub fn container_state(&self, container: &Pubkey) -> manifest::state::Container {
        self.s.account(container)
    }
}

// ---------------------------------------------------------------- consignments

pub fn consignment_pda(container: &Pubkey, index: u16) -> Pubkey {
    Pubkey::find_program_address(
        &[
            manifest::constants::CONSIGNMENT_SEED,
            container.as_ref(),
            &index.to_le_bytes(),
        ],
        &manifest::ID,
    )
    .0
}

pub fn vault_pda(consignment: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[manifest::constants::VAULT_SEED, consignment.as_ref()],
        &manifest::ID,
    )
    .0
}

pub fn cargo_ticket_pda(consignment: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[manifest::constants::CARGO_TICKET_SEED, consignment.as_ref()],
        &manifest::ID,
    )
    .0
}

pub fn ticket_authority_pda() -> Pubkey {
    Pubkey::find_program_address(&[manifest::constants::TICKET_AUTHORITY_SEED], &manifest::ID).0
}

/// A trader wallet with a funded USD token account.
pub struct Trader {
    pub kp: Keypair,
    pub ata: Pubkey,
}

/// $2,400.00 of goods, 1.250 CBM estimated.
pub const GOODS: u64 = 2_400 * USD;
pub const EST_CBM: u32 = 1_250;
pub const EVIDENCE: [u8; 32] = [7u8; 32];

impl World {
    pub fn trader(&mut self, usd: u64) -> Trader {
        let kp = self.s.funded_keypair();
        let ata = self.fund_usd(&kp.pubkey(), usd);
        Trader { kp, ata }
    }

    pub fn book_params(&self, payee: Pubkey) -> manifest::instructions::BookConsignmentParams {
        manifest::instructions::BookConsignmentParams {
            goods_amount: GOODS,
            est_cbm_milli: EST_CBM,
            payee,
            description: fixed("Phone cases, 12 cartons"),
        }
    }

    pub fn book_tx(
        &mut self,
        t: &Trader,
        container: Pubkey,
        params: manifest::instructions::BookConsignmentParams,
    ) -> TxResult {
        let cs = self.container_state(&container);
        let consignment = consignment_pda(&container, cs.consignment_count);
        let ix = Svm::ix(
            manifest::instruction::BookConsignment { params },
            manifest::accounts::BookConsignment {
                trader: t.kp.pubkey(),
                config: config_pda(),
                forwarder: cs.forwarder,
                container,
                consignment,
                vault: vault_pda(&consignment),
                mint: cs.mint,
                trader_token_account: t.ata,
                token_program: spl_token_id(),
                system_program: anchor_lang::system_program::ID,
            },
        );
        self.s.send(&[ix], &t.kp, &[])
    }

    /// Book the standard consignment with a fresh payee; returns the consignment.
    pub fn book(&mut self, t: &Trader, container: Pubkey) -> Pubkey {
        let payee = Keypair::new().pubkey();
        let params = self.book_params(payee);
        self.book_with(t, container, params)
    }

    pub fn book_with(
        &mut self,
        t: &Trader,
        container: Pubkey,
        params: manifest::instructions::BookConsignmentParams,
    ) -> Pubkey {
        let index = self.container_state(&container).consignment_count;
        self.book_tx(t, container, params).unwrap();
        consignment_pda(&container, index)
    }

    pub fn record_receipt_tx(
        &mut self,
        f: &Fwd,
        consignment: Pubkey,
        measured_cbm_milli: u32,
        carton_count: u16,
    ) -> TxResult {
        let c = self.consignment_state(&consignment);
        let ix = Svm::ix(
            manifest::instruction::RecordReceipt {
                evidence_hash: EVIDENCE,
                measured_cbm_milli,
                carton_count,
            },
            manifest::accounts::RecordReceipt {
                authority: f.kp.pubkey(),
                config: config_pda(),
                forwarder: f.pda,
                container: c.container,
                consignment,
            },
        );
        self.s.send(&[ix], &f.kp, &[])
    }

    pub fn settle_accounts(
        &self,
        payer: &Pubkey,
        consignment: Pubkey,
    ) -> manifest::accounts::SettleApproval {
        let c = self.consignment_state(&consignment);
        let treasury = self.treasury.pubkey();
        let ticket = cargo_ticket_pda(&consignment);
        manifest::accounts::SettleApproval {
            payer: *payer,
            config: config_pda(),
            container: c.container,
            consignment,
            vault: c.vault,
            mint: c.mint,
            trader: c.trader,
            trader_token_account: Svm::ata(&c.trader, &c.mint, &spl_token_id()),
            payee: c.payee,
            payee_token_account: Svm::ata(&c.payee, &c.mint, &spl_token_id()),
            treasury_owner: treasury,
            treasury_token_account: Svm::ata(&treasury, &c.mint, &spl_token_id()),
            ticket_authority: ticket_authority_pda(),
            cargo_ticket_mint: ticket,
            trader_ticket_account: Svm::ata(&c.trader, &ticket, &token_2022_id()),
            token_program: spl_token_id(),
            token_2022_program: token_2022_id(),
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: anchor_lang::system_program::ID,
        }
    }

    pub fn approve_tx(&mut self, payer: &Keypair, consignment: Pubkey) -> TxResult {
        let accounts = self.settle_accounts(&payer.pubkey(), consignment);
        let ix = Svm::ix(manifest::instruction::ApproveGoods {}, accounts);
        self.s.send(&with_cu_limit(ix), payer, &[])
    }

    pub fn auto_approve_tx(&mut self, payer: &Keypair, consignment: Pubkey) -> TxResult {
        let accounts = self.settle_accounts(&payer.pubkey(), consignment);
        let ix = Svm::ix(manifest::instruction::AutoApprove {}, accounts);
        self.s.send(&with_cu_limit(ix), payer, &[])
    }

    pub fn reject_goods_tx(
        &mut self,
        signer: &Keypair,
        consignment: Pubkey,
        reason: u8,
    ) -> TxResult {
        let c = self.consignment_state(&consignment);
        let cs = self.container_state(&c.container);
        let ix = Svm::ix(
            manifest::instruction::RejectGoods { reason },
            manifest::accounts::RejectGoods {
                trader: signer.pubkey(),
                forwarder: cs.forwarder,
                container: c.container,
                consignment,
            },
        );
        self.s.send(&[ix], signer, &[])
    }

    pub fn refund_tx(&mut self, signer: &Keypair, consignment: Pubkey) -> TxResult {
        let c = self.consignment_state(&consignment);
        let cs = self.container_state(&c.container);
        let ix = Svm::ix(
            manifest::instruction::RefundAfterCutoff {},
            manifest::accounts::RefundAfterCutoff {
                trader: signer.pubkey(),
                forwarder: cs.forwarder,
                container: c.container,
                consignment,
                vault: c.vault,
                mint: c.mint,
                trader_token_account: Svm::ata(&signer.pubkey(), &c.mint, &spl_token_id()),
                token_program: spl_token_id(),
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            },
        );
        self.s.send(&[ix], signer, &[])
    }

    pub fn reject_booking_tx(&mut self, f: &Fwd, consignment: Pubkey) -> TxResult {
        let c = self.consignment_state(&consignment);
        let ix = Svm::ix(
            manifest::instruction::RejectBooking {},
            manifest::accounts::RejectBooking {
                authority: f.kp.pubkey(),
                forwarder: f.pda,
                container: c.container,
                consignment,
                vault: c.vault,
                mint: c.mint,
                trader: c.trader,
                trader_token_account: Svm::ata(&c.trader, &c.mint, &spl_token_id()),
                token_program: spl_token_id(),
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            },
        );
        self.s.send(&[ix], &f.kp, &[])
    }

    pub fn consignment_state(&self, consignment: &Pubkey) -> manifest::state::Consignment {
        self.s.account(consignment)
    }

    /// Invariant 2: the vault holds exactly what the state says it should.
    #[track_caller]
    pub fn assert_vault_matches_state(&self, consignment: &Pubkey) {
        let c = self.consignment_state(consignment);
        assert_eq!(
            self.s.balance(&c.vault),
            c.escrow_held().unwrap(),
            "vault balance != state for {:?}",
            c.status
        );
    }

    /// Invariant 3: the bond always covers locked coverage.
    #[track_caller]
    pub fn assert_bond_covers(&self, f: &Fwd) {
        let state = self.forwarder_state(f);
        assert!(state.bond_balance >= state.locked_coverage);
        assert_eq!(self.s.balance(&f.vault), state.bond_balance);
    }
}

/// Prepend a 400k compute-unit limit (approval mints a Token-2022 NFT with metadata).
pub fn with_cu_limit(
    ix: anchor_lang::solana_program::instruction::Instruction,
) -> Vec<anchor_lang::solana_program::instruction::Instruction> {
    // ComputeBudgetInstruction::SetComputeUnitLimit = discriminator 2 + u32 LE.
    let mut data = vec![2u8];
    data.extend_from_slice(&400_000u32.to_le_bytes());
    let budget = anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
        compute_budget_program_id(),
        &data,
        vec![],
    );
    vec![budget, ix]
}

pub fn compute_budget_program_id() -> Pubkey {
    "ComputeBudget111111111111111111111111111111"
        .parse()
        .unwrap()
}

// ---------------------------------------------------------------- shipping, pickup, disputes

pub const CONTAINER_NUMBER: [u8; 11] = *b"CSQU3054383";
pub const BL_HASH: [u8; 32] = [9u8; 32];

impl World {
    pub fn ship_tx(&mut self, f: &Fwd, container: Pubkey, load: bool) -> TxResult {
        let accounts = manifest::accounts::ShipContainer {
            authority: f.kp.pubkey(),
            config: config_pda(),
            forwarder: f.pda,
            container,
        };
        let ix = if load {
            Svm::ix(
                manifest::instruction::MarkLoaded {
                    container_number: CONTAINER_NUMBER,
                    bl_hash: BL_HASH,
                },
                accounts,
            )
        } else {
            Svm::ix(manifest::instruction::MarkArrived {}, accounts)
        };
        self.s.send(&[ix], &f.kp, &[])
    }

    pub fn mark_loaded_with(
        &mut self,
        f: &Fwd,
        container: Pubkey,
        container_number: [u8; 11],
        bl_hash: [u8; 32],
    ) -> TxResult {
        let ix = Svm::ix(
            manifest::instruction::MarkLoaded {
                container_number,
                bl_hash,
            },
            manifest::accounts::ShipContainer {
                authority: f.kp.pubkey(),
                config: config_pda(),
                forwarder: f.pda,
                container,
            },
        );
        self.s.send(&[ix], &f.kp, &[])
    }

    /// Close (forwarder), load and arrive.
    pub fn sail(&mut self, f: &Fwd, container: Pubkey) {
        let kp = f.kp.insecure_clone();
        if self.container_state(&container).status == manifest::state::ContainerStatus::Open {
            self.close_booking_tx(&kp, f, container).unwrap();
        }
        self.ship_tx(f, container, true).unwrap();
        self.ship_tx(f, container, false).unwrap();
    }

    pub fn top_up_tx(
        &mut self,
        payer: &Keypair,
        payer_ata: Pubkey,
        consignment: Pubkey,
        amount: u64,
    ) -> TxResult {
        let c = self.consignment_state(&consignment);
        let ix = Svm::ix(
            manifest::instruction::TopUpFreight { amount },
            manifest::accounts::TopUpFreight {
                payer: payer.pubkey(),
                consignment,
                vault: c.vault,
                mint: c.mint,
                payer_token_account: payer_ata,
                token_program: spl_token_id(),
            },
        );
        self.s.send(&[ix], payer, &[])
    }

    pub fn confirm_pickup_tx(&mut self, holder: &Keypair, consignment: Pubkey) -> TxResult {
        let c = self.consignment_state(&consignment);
        let cs = self.container_state(&c.container);
        let fwd: manifest::state::Forwarder = self.s.account(&cs.forwarder);
        let ix = Svm::ix(
            manifest::instruction::ConfirmPickup {},
            manifest::accounts::ConfirmPickup {
                holder: holder.pubkey(),
                config: config_pda(),
                forwarder: cs.forwarder,
                authority: fwd.authority,
                container: c.container,
                consignment,
                vault: c.vault,
                mint: c.mint,
                forwarder_token_account: Svm::ata(&fwd.authority, &c.mint, &spl_token_id()),
                holder_token_account: Svm::ata(&holder.pubkey(), &c.mint, &spl_token_id()),
                cargo_ticket_mint: c.cargo_ticket_mint,
                holder_ticket_account: Svm::ata(
                    &holder.pubkey(),
                    &c.cargo_ticket_mint,
                    &token_2022_id(),
                ),
                token_program: spl_token_id(),
                token_2022_program: token_2022_id(),
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            },
        );
        self.s.send(&with_cu_limit(ix), holder, &[])
    }

    pub fn claim_freight_tx(&mut self, f: &Fwd, consignment: Pubkey, holder: Pubkey) -> TxResult {
        let c = self.consignment_state(&consignment);
        let ix = Svm::ix(
            manifest::instruction::ClaimFreightAfterGrace {},
            manifest::accounts::ClaimFreightAfterGrace {
                authority: f.kp.pubkey(),
                config: config_pda(),
                forwarder: f.pda,
                container: c.container,
                consignment,
                vault: c.vault,
                mint: c.mint,
                forwarder_token_account: Svm::ata(&f.kp.pubkey(), &c.mint, &spl_token_id()),
                holder,
                holder_token_account: Svm::ata(&holder, &c.mint, &spl_token_id()),
                cargo_ticket_mint: c.cargo_ticket_mint,
                holder_ticket_account: Svm::ata(&holder, &c.cargo_ticket_mint, &token_2022_id()),
                ticket_authority: ticket_authority_pda(),
                token_program: spl_token_id(),
                token_2022_program: token_2022_id(),
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            },
        );
        self.s.send(&with_cu_limit(ix), &f.kp, &[])
    }

    pub fn open_dispute_tx(
        &mut self,
        holder: &Keypair,
        consignment: Pubkey,
        reason: u8,
    ) -> TxResult {
        let c = self.consignment_state(&consignment);
        let cs = self.container_state(&c.container);
        let ix = Svm::ix(
            manifest::instruction::OpenDispute { reason },
            manifest::accounts::OpenDispute {
                holder: holder.pubkey(),
                config: config_pda(),
                forwarder: cs.forwarder,
                container: c.container,
                consignment,
                cargo_ticket_mint: c.cargo_ticket_mint,
                holder_ticket_account: Svm::ata(
                    &holder.pubkey(),
                    &c.cargo_ticket_mint,
                    &token_2022_id(),
                ),
                token_2022_program: token_2022_id(),
            },
        );
        self.s.send(&[ix], holder, &[])
    }

    pub fn resolve_refund_tx(&mut self, arbitrator: &Keypair, consignment: Pubkey) -> TxResult {
        let c = self.consignment_state(&consignment);
        let cs = self.container_state(&c.container);
        let ix = Svm::ix(
            manifest::instruction::ResolveRefundEscrow {},
            manifest::accounts::ResolveRefundEscrow {
                arbitrator: arbitrator.pubkey(),
                config: config_pda(),
                forwarder: cs.forwarder,
                container: c.container,
                consignment,
                vault: c.vault,
                mint: c.mint,
                trader: c.trader,
                trader_token_account: Svm::ata(&c.trader, &c.mint, &spl_token_id()),
                token_program: spl_token_id(),
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            },
        );
        self.s.send(&[ix], arbitrator, &[])
    }

    pub fn resolve_force_approve_tx(
        &mut self,
        arbitrator: &Keypair,
        consignment: Pubkey,
    ) -> TxResult {
        let accounts = self.settle_accounts(&arbitrator.pubkey(), consignment);
        let ix = Svm::ix(manifest::instruction::ResolveForceApprove {}, accounts);
        self.s.send(&with_cu_limit(ix), arbitrator, &[])
    }

    pub fn resolve_dismiss_tx(&mut self, arbitrator: &Keypair, consignment: Pubkey) -> TxResult {
        let ix = Svm::ix(
            manifest::instruction::ResolveDismiss {},
            manifest::accounts::ResolveDismiss {
                arbitrator: arbitrator.pubkey(),
                config: config_pda(),
                consignment,
            },
        );
        self.s.send(&[ix], arbitrator, &[])
    }

    pub fn resolve_slash_tx(
        &mut self,
        arbitrator: &Keypair,
        consignment: Pubkey,
        holder: Pubkey,
        amount: u64,
    ) -> TxResult {
        let c = self.consignment_state(&consignment);
        let cs = self.container_state(&c.container);
        let fwd: manifest::state::Forwarder = self.s.account(&cs.forwarder);
        let ix = Svm::ix(
            manifest::instruction::ResolveSlashBond { amount },
            manifest::accounts::ResolveSlashBond {
                arbitrator: arbitrator.pubkey(),
                config: config_pda(),
                forwarder: cs.forwarder,
                container: c.container,
                consignment,
                vault: c.vault,
                mint: c.mint,
                bond_mint: fwd.bond_mint,
                bond_vault: fwd.bond_vault,
                holder,
                holder_token_account: Svm::ata(&holder, &c.mint, &spl_token_id()),
                holder_bond_token_account: None,
                cargo_ticket_mint: c.cargo_ticket_mint,
                holder_ticket_account: Svm::ata(&holder, &c.cargo_ticket_mint, &token_2022_id()),
                ticket_authority: ticket_authority_pda(),
                token_program: spl_token_id(),
                bond_token_program: spl_token_id(),
                token_2022_program: token_2022_id(),
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            },
        );
        self.s.send(&with_cu_limit(ix), arbitrator, &[])
    }

    /// Transfer the Cargo Ticket from `from` to `to` (creating `to`'s Token-2022 ATA).
    pub fn transfer_ticket(
        &mut self,
        from: &Keypair,
        to: &Pubkey,
        consignment: Pubkey,
    ) -> TxResult {
        let ticket = self.consignment_state(&consignment).cargo_ticket_mint;
        let program = token_2022_id();
        let create = anchor_spl::associated_token::spl_associated_token_account::instruction::create_associated_token_account_idempotent(
            &from.pubkey(),
            to,
            &ticket,
            &program,
        );
        let transfer = anchor_spl::token_2022::spl_token_2022::instruction::transfer_checked(
            &program,
            &Svm::ata(&from.pubkey(), &ticket, &program),
            &ticket,
            &Svm::ata(to, &ticket, &program),
            &from.pubkey(),
            &[],
            1,
            0,
        )
        .unwrap();
        self.s.send(&[create, transfer], from, &[])
    }

    /// Book, receive and approve one consignment; returns it.
    pub fn approved(&mut self, f: &Fwd, container: Pubkey, t: &Trader, measured: u32) -> Pubkey {
        let k = self.book(t, container);
        self.record_receipt_tx(f, k, measured, 12).unwrap();
        let kp = t.kp.insecure_clone();
        self.approve_tx(&kp, k).unwrap();
        k
    }
}
