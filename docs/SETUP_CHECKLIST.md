# Setup checklist (human-only tasks for Greg)

Things only Greg can do because they need his accounts, money, identity or judgment.
Claude Code will ask for each one when the phase that needs it starts. Never paste a key,
token or seed phrase into the chat: put it in `.env.local` locally, or in the cloud
environment's settings (session title bar → environment menu → **Edit** → environment
variables) for cloud sessions.

## Before Phase 2 (devnet deploy, ~Oct 6)

- [ ] **Durable keypairs.** Cloud containers are ephemeral, so keys made there disappear.
      On your own machine (Solana CLI installed), create a deploy/upgrade-authority key with
      `solana-keygen new -o ~/.config/solana/manifest-dev.json` and a program-ID key with
      `solana-keygen new -o ~/.config/solana/manifest-program.json`.
      Back up both files somewhere safe. Then add their contents (the JSON byte arrays) to
      the cloud environment as `MANIFEST_DEV_KEYPAIR` and `MANIFEST_PROGRAM_KEYPAIR`. The
      SessionStart hook writes them into place in every new session, and Claude Code will
      run `anchor keys sync` to switch the program ID to yours. Tell Claude Code the two
      public keys (`solana address -k <file>`); public keys are fine to share.
- [ ] **Fund the dev keypair** with ~12 devnet SOL at <https://faucet.solana.com> (sign in
      with GitHub for higher limits). The program is ~760 KB: ~5.3 SOL stays locked as
      rent and the same again is needed temporarily for the deploy buffer. Full runbook:
      `docs/DEPLOY.md`.
- [ ] **Gas-tank keypair** (devnet faucet + demo mint authority): create a third keypair,
      fund it with ~5 devnet SOL, and add it as `GAS_TANK_SECRET_KEY`.
- [ ] **Devnet USDC** for testing from <https://faucet.circle.com> (Solana devnet).

## Before Phase 3 (frontend, ~Oct 7)

- [ ] **Phantom Portal** (<https://phantom.com/portal>). Note: Phantom has paused new
      Portal applications; if you already have a Portal app, use it. Without an App ID the
      app works with the Phantom extension/app only (no Google/Apple sign-in). Copy the **App ID**
      → `NEXT_PUBLIC_PHANTOM_APP_ID`. Add allowed origins and redirect URLs for
      `http://localhost:3000`, the Vercel preview domain, and the production domain
      (redirect path `/auth/callback`).
- [ ] **Helius** (<https://www.helius.dev>, free plan): devnet RPC URL → `NEXT_PUBLIC_RPC_URL`.
- [ ] **Pinata** (<https://pinata.cloud>): JWT → `PINATA_JWT`, gateway domain → `PINATA_GATEWAY`.

## Before Phase 4–5 (integrations and deploy, ~Oct 9–11)

- [x] **Public GitHub repo**: <https://github.com/Emediong-Etuk/Manifest> (done).
- [ ] **Vercel**: import the repo (root directory `app`), connect it, and share the
      production URL. Env vars (see `.env.example`): `NEXT_PUBLIC_CLUSTER=devnet`,
      `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_PROGRAM_ID`,
      `NEXT_PUBLIC_DEMO_MINT`, `NEXT_PUBLIC_SQUADS_MULTISIG`, `NEXT_PUBLIC_SQUADS_VAULT`,
      `NEXT_PUBLIC_PHANTOM_APP_ID` (if any), and the secrets `GAS_TANK_SECRET_KEY`,
      `CRON_SECRET`, `PINATA_JWT`, `PINATA_GATEWAY`, `RPC_URL` (optional).
- [ ] **Vercel KV / Upstash Redis** (free tier, from the Vercel Storage tab): adds
      `KV_REST_API_URL` + `KV_REST_API_TOKEN` so faucet limits survive across serverless
      instances.
- [ ] **GitHub repository secrets** `APP_URL` and `CRON_SECRET` (same value as Vercel):
      turns on the 5-minute crank in `.github/workflows/crank.yml` (Vercel Hobby crons
      only run daily).
- [ ] **Your Phantom wallet's public key** for the Squads multisig (third member), or we
      use the admin key.
- [ ] **Dialect** (optional): register the Blink domain for X unfurls
      (<https://docs.dialect.to/blinks>).

## Hackathon and research

- [x] **Colosseum Copilot sign-in.** Done Oct 5 (novelty check in `docs/COMPETITIVE_LANDSCAPE.md`). Copilot v2 no longer uses a PAT (`COLOSSEUM_COPILOT_PAT`
      is a v1 leftover; v1 tokens stop working Oct 28). Claude Code starts
      `npx @colosseum-org/copilot-connect login --device` and shows you a link and a code;
      open the link while signed in to Colosseum, enter the code, approve. Codes expire
      after 10 minutes, so do this while the session is active.
- [ ] **Colosseum Arena**: register and create the Manifest project (you are team leader).
- [ ] **Field validation (high value for judging):** talk to 2 forwarders and 5–10 traders
      this week. Collect quotes, a short video clip and ideally 1–2 signed LOIs using
      `docs/LOI_TEMPLATE.md` (written in Phase 5; ask for it earlier if you need it).
- [ ] **Your handles** (X, LinkedIn, GitHub, etc.) for the README team section.

## Design

- [ ] Hero illustration, empty states, 404 and Cargo Ticket art direction. Sizes and file
      names: `app/public/illustrations/README.md`.

## Submission (Oct 11–12)

- [ ] Record the pitch and technical demo videos (scripts in `docs/PITCH_SCRIPT.md` and
      `docs/DEMO_SCRIPT.md`).
- [ ] Fill the Arena submission form. Target: **Mon Oct 12, 11:00 PM WAT**. Hard deadline
      **Tue Oct 13, 7:59 AM WAT** (Oct 12, 11:59 PM PT).
- [ ] Post the submission thread on X with the Blink and videos.
