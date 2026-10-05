# Submission checklist

Deadline: **Mon Oct 12, 2026, 11:59 PM PT = Tue Oct 13, 7:59 AM WAT**. Aim to submit by
**Mon Oct 12, 11:00 PM WAT**. Code freeze: **Mon Oct 12, 6:00 PM WAT**.

## Repository

- [x] Public GitHub repo: <https://github.com/Emediong-Etuk/Manifest>, MIT license
- [x] README complete (problem with sources, how it works, architecture, sponsor tech,
      security, run locally, business model)
- [ ] README links filled in: live app, devnet program ID + Explorer link, pitch and demo
      videos, Greg's handles, hero illustration
- [ ] No secrets in history. Oct 5: local scan of all commits found no keypairs, private
      keys or secret values. Also enable GitHub secret scanning (free for public repos:
      Settings → Code security) and re-check at code freeze.
- [ ] CI green on the final commit; tag `phase-6` / `submission`

## Devnet

- [ ] Program deployed; ID in `.env.example`, README, `Anchor.toml` and the SDK
- [ ] `init-config` + `squads-setup` run; arbitrator and treasury = Squads vault
- [ ] `seed-demo` run against the production app; `demo-reset` right before recording
- [ ] Faucet works on production (gas tank funded with ≥ 5 devnet SOL)
- [ ] Crank running (GitHub Actions secrets `APP_URL` + `CRON_SECRET`)

## App

- [ ] Vercel production deploy; all env vars set (list in `docs/SETUP_CHECKLIST.md`)
- [ ] Production URL added to Phantom Portal allowed origins and redirect URLs (if an App
      ID is used)
- [ ] Judge path on a real phone: landing → sign in → test dollars → booked in < 2 min
- [ ] Container link preview renders in WhatsApp; Blink renders on dial.to (devnet)

## Videos

- [ ] Confirm current length limits and required fields in the Arena form
- [ ] Pitch video (≤ 3 min, `docs/PITCH_SCRIPT.md`) uploaded unlisted (YouTube or Loom)
- [ ] Technical demo (2–3 min, `docs/DEMO_SCRIPT.md`) uploaded unlisted
- [ ] Both links in the README and the Arena form

## Arena (Greg, as team leader)

- [ ] Project page: name, one-liner ("Pay-on-proof escrow for traders who ship in shared
      containers"), description, track (Solana), repo, live app, videos, technical demo link
- [ ] Team members and X / Telegram handles
- [ ] Field validation: interviews and LOIs summarized (only real ones)
- [ ] Submitted before the deadline; screenshot of the confirmation

## Launch

- [ ] Post on X: what Manifest does, the Blink (a live container), both videos, the repo
- [ ] Share in West African crypto communities and with the forwarders interviewed
