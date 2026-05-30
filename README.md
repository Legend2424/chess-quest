# ♞ Chess Quest — kids' chess time tracker

A colourful, kid-friendly website for **Minka** and **David** to log their chess
time, build weekly **tiers** (Bronze → Diamond), grow a **streak**, and earn
**rand rewards**. Works great on a computer; runs fine on tablets/phones too.

It is a plain static website (HTML/CSS/JS) — **no build step, no Node.js needed**.

---

## What it does

- **Profiles** for Minka & David (each with their own colour theme).
- **Log activities** for any day of the week: Lesson · Ana, Lesson · Corno,
  Game, Tournament, Puzzles, Studies (with quick duration buttons + custom).
- **Weekly tiers** by hours: 🥉 Bronze 4h · 🥈 Silver 6h · 🥇 Gold 10h ·
  💠 Platinum 12h · 💎 Diamond 15h. A progress bar shows *"X h more to next tier"*.
- **Streak** that grows every week you reach **Gold+** (max 10). Silver loses 1,
  Bronze / missed week loses 2. The badge looks cooler the higher you go 🔥🌈.
- **Rewards ledger** — each finished Gold+ week earns rand based on streak level
  (1–2 → R20, 3–4 → R50, 5–6 → R100, 7–9 → R150, 10 → R200). Parent ticks
  "Mark paid" (optionally behind a parent PIN). Tracks earned / paid / owed.
- **My Year** heat-map grid — every week of the year coloured by tier, with hours.
- Confetti + messages when a new tier is unlocked 🎉.

---

## 1. Set up the cloud (so data syncs across all devices)

> Skip this and the app still works — it just saves on each device separately.
> Doing it gives Minka & David the same data on every device.

1. Go to **https://supabase.com** → sign in (free) → **New project**.
   Pick any name + database password, choose the closest region, click **Create**.
2. Wait ~1 minute for it to finish setting up.
3. Open **SQL Editor** (left sidebar) → **New query** → paste the entire contents
   of [`supabase-setup.sql`](supabase-setup.sql) → press **Run**. You should see
   "Success".
4. Open **Project Settings → API**. Copy these two values:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (a long string starting with `eyJ...`)
5. Paste them into [`config.js`](config.js):
   ```js
   window.CHESS_CONFIG = {
     supabaseUrl: "https://abcd1234.supabase.co",
     supabaseAnonKey: "eyJhbGciOi...."
   };
   ```

That's it — the app now reads/writes to your cloud database.

---

## 2. Run it on this PC

From the `chess-tracker` folder:

```powershell
python -m http.server 5577
```

Then open **http://localhost:5577** in your browser.

To open it from **another device on your home Wi-Fi**, find this PC's IP
(`ipconfig` → IPv4 address, e.g. `192.168.0.20`) and on the other device visit
`http://192.168.0.20:5577` (the PC must stay on and the server running).

---

## 3. Put it online (GitHub Pages — free public link)

1. Create a new repository on **https://github.com** (e.g. `chess-quest`).
2. In the `chess-tracker` folder:
   ```powershell
   git init
   git add .
   git commit -m "Chess Quest"
   git branch -M main
   git remote add origin https://github.com/<your-username>/chess-quest.git
   git push -u origin main
   ```
   (First push opens a browser window to sign in to GitHub.)
3. On GitHub: repo **Settings → Pages → Build and deployment → Source = "Deploy
   from a branch"**, Branch = **main / (root)**, **Save**.
4. After ~1 minute your site is live at
   `https://<your-username>.github.io/chess-quest/`.

Because the Supabase **anon key** is safe to publish, the live site syncs to the
same cloud database as your local copy.

---

## Tweaking the rules

All the rules live at the top of [`app.js`](app.js) and are easy to change:

- `TIERS` — hours required for each tier.
- `rewardFor()` — rand amounts per streak level.
- `streakDelta()` — how much each tier gains/loses on the streak.
- `MAX_STREAK`, `CURRENCY`, `ACTIVITIES` — the rest of the knobs.

---

## How the streak & rewards are calculated (the assumptions)

- A **week runs Monday → Sunday**. The "current" week is in progress; completed
  weeks are locked in for the streak.
- The streak is recomputed every completed week: Gold+ adds 1 (max 10), Silver
  subtracts 1, Bronze **or a week with no chess** subtracts 2 (never below 0).
  So skipping a week hurts — that's intentional, to encourage consistency.
- You **earn rand only in finished weeks where you reached Gold+**, and the amount
  follows your streak level *after* that week. Below-Gold weeks pay nothing.

Want different behaviour (e.g. pay something for Silver weeks, or a Sunday→Saturday
week)? Tell me and I'll adjust it.
