# Product demo (≈2.5 minutes)

A screen recording of Manifest from the user's side: one shipment from booking to pickup.
Part 1 is the setup, Part 2 is what to click, and Part 3 is the voice-over, written to be
recorded separately and laid over the video. Everything is live on devnet; nothing on screen
is mocked. For the code, tests and architecture, use the technical demo (`docs/DEMO_SCRIPT.md`).

## Part 1: Setup (before the first take)

1. From the repo root, run:
   ```bash
   pnpm --filter @manifest/scripts demo-reset
   ```
   Note three things from the output: the open container (**LAG-NEW**), the arrived container
   (**LAG-ARR**) and **Ada's pickup URL**. Run demo-reset again before every take.
2. In Phantom (devnet), have three accounts ready, as set up in `docs/DEMO_SCRIPT.md` step 2:
   **Trader** (your own, empty), **Ada** and **Eastline**.
3. Open two browser windows side by side at https://manifest-seven-tau.vercel.app:
   - **Window A (trader):** Phantom on **Trader**, landing page, signed out.
   - **Window B (forwarder):** a second Chrome profile, Phantom on **Eastline**, open at
     `/forwarder/c/<LAG-NEW>`.
4. Put a carton photo on the desktop (`scripts/demo-assets/cartons-stack.jpg` works).
5. Close other tabs, hide the bookmarks bar, and zoom the browser to 110–125%.

## Part 2: Step-by-step recording

**Scene 1: The hook (0:00–0:20)**

1. Window A on the landing page.
2. Scroll slowly over the headline and the illustration. Pause on the headline.

**Scene 2: Sign in and get money (0:20–0:35)**

1. In the **Try it in 2 minutes** card, click **Sign in** and approve in Phantom.
2. Click **Get 500 test dollars**. Wait for the ✓.

**Scene 3: Book space (0:35–1:00)**

1. Click **Book on LAG-…**. If it names a container other than LAG-NEW, point Window B at
   that container instead.
2. **Goods:** enter `300` and "200 phone cases". Click **Next**.
3. **Volume:** enter `0.25`. Click **Next**.
4. **Supplier:** click **Use a test supplier address**. Click **Next**.
5. **Summary:** pause so the breakdown is readable. Click **Lock $… and book** and approve in
   Phantom.
6. The shipment page opens. Pause on it.

**Scene 4: The warehouse (1:00–1:25)**

1. Switch to Window B (Eastline) and refresh. The new shipment appears.
2. Click **Goods arrived at the warehouse: record receipt**.
3. Add the carton photo, enter `0.22` for the measured volume and `3` cartons.
4. Click **Upload evidence and record receipt** and approve in Phantom.

> From here, the trader has 2 minutes to approve. Go straight to scene 5.

**Scene 5: Approve and pay (1:25–1:50)**

1. Switch to Window A. The shipment page updates with the photos.
2. Hover over the **VERIFIED** badge.
3. Click **Approve goods**, then **Yes, pay $300.00**, and approve in Phantom.
4. The **Cargo Ticket** appears. Pause on it.

**Scene 6: The ticket can be sold (1:50–2:00)**

1. Scroll to **Sell goods in transit (transfer Cargo Ticket)**. Don't click it.

**Scene 7: Arrival in Lagos (2:00–2:15)**

1. In Window A, switch Phantom to **Ada**.
2. Open Ada's pickup URL.
3. Point the cursor at **Missing, damaged or overdue? Open a dispute**. Don't click it.

**Scene 8: Pickup (2:15–2:35)**

1. Click **Show pickup code** and approve in Phantom. Click **Can't scan? Copy the code**.
2. Switch to Window B and open `/forwarder/c/<LAG-ARR>`.
3. Scroll to the **Pickup scanner** section and open **Paste a code instead**. Paste the
   code and click **Check code**. **Valid ticket** appears.
4. Switch to Window A. Click **I've collected my goods**, then **Confirm pickup**, and approve.

**Scene 9: Close (2:35–2:45)**

1. Go back to the landing page and let it rest on screen.

### If something goes wrong

- **The faucet says you already got test dollars today:** run
  `pnpm --filter @manifest/scripts fund-wallet --address <wallet>`, then refresh.
- **The shipment was approved before you clicked** (the 2-minute window passed): run
  demo-reset and retake from scene 3.
- **The pickup code expired** (it lasts 10 minutes): click **Sign a new pickup code**.
- **Keep goods at $300 or less.** Phantom's embedded wallets have a $1,000/day limit.

## Part 3: Voice-over

Record this on its own, at a relaxed pace, then lay it over the video. Each block matches a
scene above. Words in [brackets] are notes for you, not to be read out.

**Scene 1**

> If you buy goods from China and sell them here in Nigeria, you already know the feeling.
> You send your money, sometimes through an agent you've never met, and then you wait. Weeks
> later, at the port, you finally find out if your goods are complete, if they're the wrong
> ones, or if they were ever shipped at all.
>
> [If you have a real story here, yours or someone you know, tell it in one or two
> sentences instead. A true story is the strongest hook you have.]
>
> I built Manifest to flip that around. You don't pay first and hope. You pay when you see
> your goods.

**Scene 2**

> Let me show you. I'm a trader, and I sign in with my wallet. For this demo, I'll grab some
> test money.

**Scene 3**

> I'm shipping 200 phone cases, and I only need a small slice of a shared container. I tell
> Manifest what the goods are worth and who my supplier is.
>
> Now here's the important part. When I book, my money doesn't go to the supplier, and it
> doesn't go to an agent. It's locked away, and nobody can touch it until the goods are
> proven.

**Scene 4**

> A couple of weeks later, my cartons reach the warehouse in China. The shipping company
> takes photos, measures them, counts the cartons, and records it all. Once it's recorded,
> nobody can quietly swap the photos later.

**Scene 5**

> Back in Lagos, I get to see my actual goods before a single dollar reaches the supplier.
> And Manifest checks that these are the same photos the warehouse recorded.
>
> They look right, so I approve. Only now does my supplier get paid. And I get this: a Cargo
> Ticket. Think of it as my receipt, and my right to collect these goods.

**Scene 6**

> And if I find a buyer while my goods are still at sea, I can pass the ticket on to them,
> and they collect the goods instead.

**Scene 7**

> Now meet Ada. Her container has just landed in Lagos. If anything were missing or damaged,
> she could raise a complaint right here. Every shipping company on Manifest puts money aside
> as a guarantee, and if they let her down, she can be paid back from it.

**Scene 8**

> Everything's fine, so Ada shows her pickup code. The shipping company checks it, hands
> over her cartons, and only then do they get paid for the shipping. Everyone gets paid,
> but only when they've done their part.

**Scene 9**

> Small traders have never had the protection that big importers get from their banks.
> Manifest gives them that protection, for orders of any size. You pay when you see your
> goods. It's built on Solana, and you can try it right now.
