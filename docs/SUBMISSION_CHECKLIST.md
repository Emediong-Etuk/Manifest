# Submission checklist

Deadline: **Mon Oct 12, 2026, 11:59 PM PT = Tue Oct 13, 7:59 AM WAT**. Aim to submit by
**Mon Oct 12, 11:00 PM WAT**. Code freeze: **Mon Oct 12, 6:00 PM WAT**.

## Schedule (WAT)

| When                     | What                                                                                                    | Who           |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | ------------- |
| As soon as possible      | Durable keypairs as environment secrets, ~12 devnet SOL on the deploy key, ~5 on the gas tank           | Greg          |
| Same session             | `preflight` → deploy → create-demo-mint → init-config → squads-setup (`docs/DEPLOY.md` 1–4)             | Claude Code   |
| Same day                 | Vercel import + env vars + Pinata; `seed-demo` against production; preflight all green                  | Greg + Claude |
| Next day                 | Real-phone judge path, WhatsApp preview, Blink on dial.to; devnet screenshots in the README             | Greg + Claude |
| Thu Oct 8 – Sat Oct 10   | Field interviews and LOIs (`docs/INTERVIEW_QUESTIONS.md`); fill the pitch's validation line             | Greg          |
| Sat Oct 10 – Sun Oct 11  | `demo-reset`, rehearse both scripts once, record pitch and demo, upload unlisted                        | Greg          |
| Sun Oct 11               | Fill README links, `docs/ARENA_SUBMISSION.md` → Arena form (save as draft)                              | Greg + Claude |
| **Mon Oct 12, 6:00 PM**  | **Code freeze**: CI green on `main`, tag `submission`, re-run the secret check                          | Claude Code   |
| **Mon Oct 12, 11:00 PM** | **Submit** on Arena (hard deadline Tue Oct 13, 7:59 AM WAT); then the X thread (`docs/LAUNCH_POSTS.md`) | Greg          |

If the deploy is still blocked on Sat Oct 10, decide then: record on a local validator as a
last resort (the spec lists the devnet program as "never cut", so this is a fallback, and
the submission must say so).

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

- [x] Program deployed (Oct 6): `4DCvHBveVC31TztNNzJp65GeHxNNdPFVxH4vgwDwa7S9`; ID in `.env.example`, README, `Anchor.toml` and the SDK
- [x] `init-config` + `squads-setup` run; arbitrator and treasury = Squads vault
      (multisig `9uyFwN6dHKPMFLVLq8qr8ndk5gGTWUGgtWzuHJCFMxtq`); `init-config --update`
      once the Vercel URL exists (ticket metadata still points at localhost)
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

- [ ] Drafts for every field: `docs/ARENA_SUBMISSION.md`
- [ ] Project page: name, one-liner ("Pay-on-proof escrow for traders who ship in shared
      containers"), description, track (Solana), repo, live app, videos, technical demo link
- [ ] Team members and X / Telegram handles
- [ ] Field validation: interviews and LOIs summarized (only real ones)
- [ ] Submitted before the deadline; screenshot of the confirmation

## Launch

- [ ] Post on X (draft thread in `docs/LAUNCH_POSTS.md`): what Manifest does, the Blink (a
      live container), both videos, the repo
- [ ] Share in West African crypto communities and with the forwarders interviewed
