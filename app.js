/* ============================================================
   CHESS QUEST — application logic
   Vanilla JS, no build step. Works on localStorage by default;
   uses Supabase cloud sync when config.js is filled in.
   ============================================================ */

/* ---------------- constants ---------------- */
const KIDS = {
  minka: { name: "Minka", emoji: "🦄", color: "#c061f0", tierSet: "standard" },
  david: { name: "David", emoji: "🐉", color: "#3aa0ff", tierSet: "standard", photo: "assets/David.jpeg" },
  chris: { name: "Chris", emoji: "🦖", color: "#ff7a33", tierSet: "junior", junior: true, photo: "assets/Chris.jpeg" },
};

// avatar markup: photo when available, otherwise the emoji fallback
function avatarInner(k) {
  return k.photo
    ? `<img src="${k.photo}" alt="${k.name}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${k.emoji}'}))">`
    : k.emoji;
}

const ACTIVITIES = [
  { id: "lesson_ana",   label: "Lesson · Ana",   icon: "👩‍🏫", fixed: 60 },
  { id: "lesson_corno", label: "Lesson · Corno", icon: "🧑‍🏫", fixed: 60 },
  { id: "game",         label: "Game",           icon: "♟️", options: [15, 30, 45, 60, 90], custom: "min" },
  { id: "tournament",   label: "Tournament",     icon: "🏆", options: [60, 120, 180, 240, 300], custom: "hours" },
  { id: "puzzles",      label: "Puzzles",        icon: "🧩", options: [15, 30] },
  { id: "studies",      label: "Studies",        icon: "📚", options: [15, 30, 60] },
];
const ACT_BY_ID = Object.fromEntries(ACTIVITIES.map(a => [a.id, a]));

// tiers (ascending). hoursArr = [bronze, silver, gold, platinum, diamond]
function makeTiers(h) {
  return [
    { id: "none",     label: "No tier",  hours: 0,    color: "var(--none)",     icon: "▫️" },
    { id: "bronze",   label: "Bronze",   hours: h[0], color: "var(--bronze)",   icon: "🥉" },
    { id: "silver",   label: "Silver",   hours: h[1], color: "var(--silver)",   icon: "🥈" },
    { id: "gold",     label: "Gold",     hours: h[2], color: "var(--gold)",     icon: "🥇" },
    { id: "platinum", label: "Platinum", hours: h[3], color: "var(--platinum)", icon: "💠" },
    { id: "diamond",  label: "Diamond",  hours: h[4], color: "var(--diamond)",  icon: "💎" },
  ];
}
const TIER_SETS = {
  standard: { tiers: makeTiers([4, 6, 8, 10, 15]), axis: 20 }, // Minka & David
  junior:   { tiers: makeTiers([2, 4, 6, 8, 10]),  axis: 12 }, // Chris (age 6)
};
function tiersFor(kid) { return TIER_SETS[KIDS[kid].tierSet].tiers; }
function axisFor(kid)  { return TIER_SETS[KIDS[kid].tierSet].axis; }
function goldHours(kid) { return tiersFor(kid).find(t => t.id === "gold").hours; }

const GOLD_PLUS = new Set(["gold", "platinum", "diamond"]); // weeks that earn rewards
const MAX_STREAK = 10;
const CURRENCY = "R";

/* reward for a given streak level */
function rewardFor(level) {
  if (level >= 10) return 200;
  if (level >= 7) return 150;
  if (level >= 5) return 100;
  if (level >= 3) return 50;
  if (level >= 1) return 20;
  return 0;
}
/* how a tier changes the streak (Diamond = double bump) */
function streakChange(tierId) {
  if (tierId === "diamond") return +2;             // double jump!
  if (tierId === "gold" || tierId === "platinum") return +1;
  if (tierId === "silver") return -1;
  return -2;                                        // bronze or no tier = missed week
}

/* ---------------- date helpers (Monday-based weeks) ---------------- */
function pad(n) { return String(n).padStart(2, "0"); }
function fmt(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parse(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function todayStr() { return fmt(new Date()); }
function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); }
function mondayOf(s) {
  const d = parse(s);
  const dow = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setDate(d.getDate() - dow);
  return fmt(d);
}
function weekDays(monday) { return Array.from({ length: 7 }, (_, i) => addDays(monday, i)); }
function dowName(s) { return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][(parse(s).getDay() + 6) % 7]; }
function monthDay(s) { const d = parse(s); return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]} ${d.getDate()}`; }
// ISO week number
function isoWeek(s) {
  const d = parse(s); const t = new Date(d);
  t.setDate(t.getDate() + 4 - ((t.getDay() + 6) % 7 + 1) % 7);
  const yearStart = new Date(t.getFullYear(), 0, 1);
  return Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
}

/* round minutes->hours nicely */
function hrs(min) { return Math.round((min / 60) * 100) / 100; }
function hrsLabel(min) {
  const h = min / 60;
  return (Math.round(h * 10) / 10).toString();
}

/* ============================================================
   STORE — localStorage or Supabase
   ============================================================ */
const Store = {
  mode: "local",
  client: null,

  init() {
    const c = window.CHESS_CONFIG || {};
    if (c.supabaseUrl && c.supabaseAnonKey && window.supabase) {
      try {
        this.client = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey);
        this.mode = "cloud";
      } catch (e) { console.warn("Supabase init failed, using local:", e); this.mode = "local"; }
    }
  },

  // ---- load everything ----
  async loadAll() {
    if (this.mode === "cloud") {
      try {
        const [a, p, s] = await Promise.all([
          this.client.from("activities").select("*"),
          this.client.from("payouts").select("*"),
          this.client.from("settings").select("*"),
        ]);
        if (a.error || p.error || s.error) throw (a.error || p.error || s.error);
        state.activities = a.data || [];
        state.payouts = {};
        (p.data || []).forEach(r => { state.payouts[`${r.kid}|${r.week_start}`] = r; });
        state.settings = {};
        (s.data || []).forEach(r => { state.settings[r.key] = r.value; });
        this._cache();
        return;
      } catch (e) {
        console.warn("Cloud load failed, falling back to local cache:", e);
        this.mode = "local";
        toast("⚠️ Cloud unavailable — using this device's saved data");
      }
    }
    // local
    state.activities = JSON.parse(localStorage.getItem("chess_activities") || "[]");
    state.payouts = JSON.parse(localStorage.getItem("chess_payouts") || "{}");
    state.settings = JSON.parse(localStorage.getItem("chess_settings") || "{}");
  },

  _cache() {
    localStorage.setItem("chess_activities", JSON.stringify(state.activities));
    localStorage.setItem("chess_payouts", JSON.stringify(state.payouts));
    localStorage.setItem("chess_settings", JSON.stringify(state.settings));
  },

  async addActivity(rec) {
    state.activities.push(rec);
    this._cache();
    if (this.mode === "cloud") {
      const { error } = await this.client.from("activities").insert(rec);
      if (error) { toast("⚠️ Could not save to cloud"); console.warn(error); }
    }
  },

  async deleteActivity(id) {
    state.activities = state.activities.filter(a => a.id !== id);
    this._cache();
    if (this.mode === "cloud") {
      const { error } = await this.client.from("activities").delete().eq("id", id);
      if (error) console.warn(error);
    }
  },

  async setPayout(kid, weekStart, paid, amount) {
    const row = { kid, week_start: weekStart, paid, amount, paid_at: paid ? new Date().toISOString() : null };
    state.payouts[`${kid}|${weekStart}`] = row;
    this._cache();
    if (this.mode === "cloud") {
      const { error } = await this.client.from("payouts").upsert(row, { onConflict: "kid,week_start" });
      if (error) console.warn(error);
    }
  },

  async setSetting(key, value) {
    state.settings[key] = value;
    this._cache();
    if (this.mode === "cloud") {
      const { error } = await this.client.from("settings").upsert({ key, value }, { onConflict: "key" });
      if (error) console.warn(error);
    }
  },
};

/* ============================================================
   STATE
   ============================================================ */
const state = {
  kid: null,
  tab: "dashboard",
  weekStart: mondayOf(todayStr()),
  historyYear: new Date().getFullYear(),
  activities: [],
  payouts: {},
  settings: {},
  sel: { day: todayStr(), act: null, minutes: null, custom: "" },
};

/* ---------------- computation ---------------- */
function kidActs(kid) { return state.activities.filter(a => a.kid === kid); }

function weekMinutes(kid, monday) {
  return kidActs(kid).filter(a => mondayOf(a.date) === monday).reduce((s, a) => s + a.minutes, 0);
}
function dayMinutes(kid, day) {
  return kidActs(kid).filter(a => a.date === day).reduce((s, a) => s + a.minutes, 0);
}
function tierFor(kid, hours) {
  const tiers = tiersFor(kid);
  let t = tiers[0];
  for (const tt of tiers) if (hours >= tt.hours) t = tt;
  return t;
}
function nextTier(kid, hours) {
  for (const tt of tiersFor(kid)) if (hours < tt.hours) return tt;
  return null; // maxed
}

/* full streak history across all weeks from first activity to last COMPLETED week */
function streakSeries(kid) {
  const acts = kidActs(kid);
  if (!acts.length) return { series: [], current: 0, best: 0 };
  const first = mondayOf(acts.reduce((m, a) => a.date < m ? a.date : m, acts[0].date));
  const lastCompleted = addDays(mondayOf(todayStr()), -7); // week before the current one
  const series = [];
  let streak = 0, best = 0;
  let w = first;
  // guard against infinite loops
  for (let i = 0; i < 600 && w <= lastCompleted; i++, w = addDays(w, 7)) {
    const min = weekMinutes(kid, w);
    const h = hrs(min);
    const tier = tierFor(kid, h);
    streak = Math.max(0, Math.min(MAX_STREAK, streak + streakChange(tier.id)));
    best = Math.max(best, streak);
    const reward = GOLD_PLUS.has(tier.id) ? rewardFor(streak) : 0;
    series.push({ week: w, minutes: min, hours: h, tier, streak, reward });
  }
  return { series, current: streak, best };
}

/* what happens to the streak if the CURRENT week ends as-is */
function currentWeekProjection(kid) {
  const base = streakSeries(kid).current;
  const cur = mondayOf(todayStr());
  const min = weekMinutes(kid, cur);
  const h = hrs(min);
  const tier = tierFor(kid, h);
  const projected = Math.max(0, Math.min(MAX_STREAK, base + streakChange(tier.id)));
  const reward = GOLD_PLUS.has(tier.id) ? rewardFor(projected) : 0;
  return { base, minutes: min, hours: h, tier, projected, reward };
}

function ledgerFor(kid) {
  const { series } = streakSeries(kid);
  return series.filter(s => s.reward > 0).map(s => {
    const p = state.payouts[`${kid}|${s.week}`];
    return { ...s, amount: s.reward, paid: !!(p && p.paid) };
  }).reverse();
}

/* ============================================================
   RENDER
   ============================================================ */
const app = document.getElementById("app");

function render() {
  if (!state.kid) { renderPicker(); return; }
  document.body.className = "kid-" + state.kid;
  let body = "";
  if (state.tab === "dashboard") body = renderDashboard();
  else if (state.tab === "history") body = renderHistory();
  else if (state.tab === "rewards") body = renderRewards();
  app.innerHTML = renderHeader() + body + renderFoot();
  wire();
}

/* ---------- profile picker ---------- */
function renderPicker() {
  document.body.className = "";
  app.innerHTML = `
    <div class="picker-wrap">
      <div class="logo">♞</div>
      <div>
        <h1>Chess <span>Quest</span></h1>
        <div class="tag">Track your chess, build your streak, level up! 🚀</div>
      </div>
      <div class="kid-cards">
        ${Object.entries(KIDS).map(([id, k]) => {
          const proj = state.activities.length ? streakSeries(id).current : 0;
          return `
          <button class="kid-card ${id}" data-kid="${id}">
            <div class="avatar">${avatarInner(k)}</div>
            <div class="name">${k.name}</div>
            <div class="mini-flame">${proj > 0 ? "🔥".repeat(Math.min(5, Math.ceil(proj / 2))) + " streak " + proj : "Tap to start!"}</div>
            <div class="sub">Tap to open</div>
          </button>`;
        }).join("")}
      </div>
      <div class="${Store.mode === "cloud" ? "cloud-chip on" : "cloud-chip local"}">
        ${Store.mode === "cloud" ? "☁️ Cloud sync on — saved for every device" : "💾 Saved on this device"}
      </div>
    </div>`;
  app.querySelectorAll(".kid-card").forEach(b =>
    b.addEventListener("click", () => { state.kid = b.dataset.kid; state.tab = "dashboard"; state.weekStart = mondayOf(todayStr()); render(); }));
}

/* ---------- header ---------- */
function renderHeader() {
  const k = KIDS[state.kid];
  const tab = (id, label, icon) => `<button class="tab ${state.tab === id ? "active" : ""}" data-tab="${id}">${icon} ${label}</button>`;
  return `
  <header class="appbar">
    <div class="brand"><span class="knight">♞</span> Chess Quest</div>
    <div class="tabs">
      ${tab("dashboard", "Dashboard", "🏠")}
      ${tab("history", "My Year", "📅")}
      ${tab("rewards", "Rewards", "💰")}
    </div>
    <div class="who ${state.kid}">
      <div class="who-avatar">${avatarInner(k)}</div>
      <div class="who-name">${k.name}</div>
      <button class="switch" data-switch>Switch</button>
    </div>
  </header>`;
}

function renderFoot() {
  const chip = Store.mode === "cloud"
    ? `<span class="cloud-chip on">☁️ Cloud sync on</span>`
    : `<span class="cloud-chip local">💾 This device only</span>`;
  return `<div class="foot">${chip} &nbsp;·&nbsp; Chess Quest · keep your streak alive every week 🔥</div>`;
}

/* ---------- DASHBOARD ---------- */
function renderDashboard() {
  return `<div class="dash">
    <div class="dash-col main">
      ${renderAddActivity()}
      ${renderWeekLog()}
    </div>
    <div class="dash-col side">
      ${renderStreakHero()}
      ${renderWeekProgress()}
    </div>
  </div>`;
}

function streakClass(n) {
  if (n <= 0) return "s0";
  if (n <= 2) return "s-low";
  if (n <= 4) return "s-mid";
  if (n <= 6) return "s-high";
  if (n <= 9) return "s-epic";
  return "s-max";
}
function flameStr(n) {
  if (n <= 0) return "💤";
  if (n >= 10) return "🌈🔥🌈";
  if (n >= 7) return "🔥🔥🔥";
  if (n >= 4) return "🔥🔥";
  return "🔥";
}

function renderStreakHero() {
  const { current, best } = streakSeries(state.kid);
  const reward = rewardFor(current);
  const pips = Array.from({ length: MAX_STREAK }, (_, i) => `<div class="pip ${i < current ? "on" : ""}"></div>`).join("");
  let caption, sub;
  if (current <= 0) { caption = "No streak yet"; sub = `Reach Gold (${goldHours(state.kid)}h) this week to start a streak!`; }
  else if (current >= MAX_STREAK) { caption = "MAX STREAK! 🏆"; sub = "You are unstoppable — keep it going!"; }
  else { caption = `${current}-week Gold streak!`; sub = `${MAX_STREAK - current} more Gold weeks to MAX`; }

  return `
  <section class="panel streak-hero compact">
    <div class="section-title">🔥 Your Streak</div>
    <div class="streak-badge ${streakClass(current)}">
      <div class="flames">${flameStr(current)}</div>
      <div class="num">${current}</div>
      <div class="lbl">WEEKS</div>
    </div>
    <div class="streak-caption">${caption}</div>
    <div class="streak-sub">${sub}</div>
    ${reward > 0 ? `<div class="streak-reward">💰 Earning ${CURRENCY}${reward} per Gold week</div>` : ""}
    <div class="streak-pips">${pips}</div>
    <div class="best-streak">🏅 Best streak ever: ${best} weeks</div>
  </section>`;
}

function renderWeekProgress() {
  const monday = state.weekStart;
  const min = weekMinutes(state.kid, monday);
  const h = hrs(min);
  const tier = tierFor(state.kid, h);
  const nt = nextTier(state.kid, h);
  const isCurrent = monday === mondayOf(todayStr());
  const AXIS = axisFor(state.kid); // progress bar full-scale hours
  const pct = Math.min(100, (h / AXIS) * 100);
  const marks = tiersFor(state.kid).slice(1).map(t => {
    const left = (t.hours / AXIS) * 100;
    const reached = h >= t.hours;
    return `<div class="tier-mark ${reached ? "reached" : ""}" style="left:${left}%; --tc:${t.color}">
      <span class="tm-line"></span>
      <span class="tm-lbl">${t.icon}<b>${t.hours}h</b></span>
    </div>`;
  }).join("");

  let msg;
  if (nt) {
    const need = Math.round((nt.hours - h) * 10) / 10;
    msg = `<span class="next-tier-msg"><b>${need}h</b> more to reach ${nt.icon} <b>${nt.label}</b>!</span>`;
  } else {
    msg = `<span class="next-tier-msg">💎 Diamond reached — amazing!</span>`;
  }

  // projection note for current week
  let projNote = "";
  if (isCurrent) {
    const p = currentWeekProjection(state.kid);
    if (p.tier.id === "diamond") projNote = `<div class="streak-sub" style="margin-top:8px">💎 Diamond! <b>DOUBLE</b> streak jump to <b>${p.projected}</b> (earn ${CURRENCY}${p.reward}) 🚀</div>`;
    else if (GOLD_PLUS.has(p.tier.id)) projNote = `<div class="streak-sub" style="margin-top:8px">✅ Gold+ this week → streak goes to <b>${p.projected}</b> (earn ${CURRENCY}${p.reward})</div>`;
    else projNote = `<div class="streak-sub" style="margin-top:8px">⚠️ Below Gold → streak would ${p.projected < p.base ? "drop to " + p.projected : "stay " + p.projected}. Reach Gold to keep it climbing!</div>`;
  }

  // breakdown by activity
  const acts = kidActs(state.kid).filter(a => mondayOf(a.date) === monday);
  const byType = {};
  acts.forEach(a => { byType[a.type] = (byType[a.type] || 0) + a.minutes; });
  const maxType = Math.max(1, ...Object.values(byType));
  const breakdown = Object.keys(byType).length
    ? `<div class="breakdown">${ACTIVITIES.filter(a => byType[a.id]).map(a => `
        <div class="bd-row">
          <span>${a.icon} ${a.label}</span>
          <span class="bd-bar"><i style="width:${(byType[a.id] / maxType) * 100}%"></i></span>
          <span style="text-align:right">${hrsLabel(byType[a.id])}h</span>
        </div>`).join("")}</div>`
    : "";

  return `
  <section class="panel">
    <div class="week-head">
      <div class="section-title">📈 This Week ${KIDS[state.kid].junior ? '<span class="jr-badge">👶 Junior</span>' : ""}</div>
      <div class="week-nav">
        <button data-week="-1" title="Previous week">‹</button>
        <div class="week-label">Week ${isoWeek(monday)}<small>${monthDay(monday)} – ${monthDay(addDays(monday, 6))}${isCurrent ? " · now" : ""}</small></div>
        <button data-week="1" ${isCurrent ? "disabled" : ""} title="Next week">›</button>
      </div>
    </div>
    <div class="row" style="align-items:flex-end; justify-content:space-between">
      <div class="hours-big">${hrsLabel(min)}<small>hrs</small></div>
      <div class="tier-badge" style="color:${tier.color}">${tier.icon} ${tier.label}</div>
    </div>
    <div class="progress-wrap">
      <div class="progress-track">
        <div class="progress-fill" style="width:${pct}%"></div>
        ${marks}
      </div>
      <div class="axis"><span>0h</span><span>20h</span></div>
    </div>
    ${msg}
    ${projNote}
    ${breakdown}
  </section>`;
}

function renderAddActivity() {
  // day selector limited to the viewed week
  const days = weekDays(state.weekStart);
  // ensure selected day is within this week
  if (!days.includes(state.sel.day)) {
    state.sel.day = days.includes(todayStr()) ? todayStr() : days[0];
  }
  const today = todayStr();
  const dayBtns = days.map(d => {
    const dm = dayMinutes(state.kid, d);
    return `<button class="day-btn ${state.sel.day === d ? "sel" : ""} ${d === today ? "today" : ""}" data-day="${d}">
      <div class="dow">${dowName(d)}</div>
      <div class="dnum">${monthDay(d).split(" ")[1]}</div>
      <div class="dhrs">${dm ? hrsLabel(dm) + "h" : ""}</div>
    </button>`;
  }).join("");

  const actBtns = ACTIVITIES.map(a =>
    `<button class="act-btn ${state.sel.act === a.id ? "sel" : ""}" data-act="${a.id}">
      <span class="ico">${a.icon}</span><span class="nm">${a.label}</span>
    </button>`).join("");

  // duration chooser
  let dur = "";
  if (state.sel.act) {
    const a = ACT_BY_ID[state.sel.act];
    if (a.fixed) {
      dur = `<div class="dur-area"><div class="streak-sub">Duration: <b>${hrsLabel(a.fixed)} hour</b> (fixed)</div></div>`;
    } else {
      const chips = a.options.map(o => {
        const lbl = o >= 60 && o % 60 === 0 ? `${o / 60}h` : `${o}m`;
        return `<button class="chip ${state.sel.minutes === o ? "sel" : ""}" data-min="${o}">${lbl}</button>`;
      }).join("");
      const customLbl = a.custom === "hours" ? "hours" : "min";
      dur = `<div class="dur-area">
        <div class="dur-chips">
          ${chips}
          <span class="custom-dur">
            <input type="number" min="1" step="${a.custom === "hours" ? "0.5" : "5"}" placeholder="${customLbl}" data-custom value="${state.sel.custom}">
            <span style="font-weight:800;color:var(--muted)">${customLbl}</span>
          </span>
        </div>
      </div>`;
    }
  }

  const ready = state.sel.act && (ACT_BY_ID[state.sel.act].fixed || state.sel.minutes || state.sel.custom);

  return `
  <section class="panel">
    <div class="section-title">➕ Add Chess Time</div>
    <div class="streak-sub" style="margin-bottom:8px">1 · Pick the day</div>
    <div class="day-pick">${dayBtns}</div>
    <div class="streak-sub" style="margin-bottom:8px">2 · Pick the activity</div>
    <div class="act-grid">${actBtns}</div>
    ${dur}
    <button class="add-btn" data-add ${ready ? "" : "disabled"}>✅ Add to ${dowName(state.sel.day)}</button>
  </section>`;
}

function renderWeekLog() {
  const monday = state.weekStart;
  const acts = kidActs(state.kid).filter(a => mondayOf(a.date) === monday)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const list = acts.length
    ? acts.map(a => {
        const def = ACT_BY_ID[a.type] || { icon: "♟️", label: a.type };
        return `<div class="log-item">
          <span class="ico">${def.icon}</span>
          <span class="info"><div class="t">${def.label}</div><div class="d">${dowName(a.date)}, ${monthDay(a.date)}</div></span>
          <span class="mins">${hrsLabel(a.minutes)}h</span>
          <button class="del" data-del="${a.id}" title="Remove">✕</button>
        </div>`;
      }).join("")
    : `<div class="empty-note">No chess logged this week yet.<br>Add your first activity above! 👆</div>`;

  return `
  <section class="panel">
    <div class="section-title">📋 This Week's Log</div>
    <div class="log-list">${list}</div>
  </section>`;
}

/* ---------- HISTORY / YEAR GRID ---------- */
function renderHistory() {
  const year = state.historyYear;
  const { series } = streakSeries(state.kid);
  const byWeek = {};
  series.forEach(s => { byWeek[s.week] = s; });
  // also include current (in progress) week
  const curMon = mondayOf(todayStr());
  const curMin = weekMinutes(state.kid, curMon);
  if (!byWeek[curMon]) byWeek[curMon] = { week: curMon, minutes: curMin, hours: hrs(curMin), tier: tierFor(state.kid, hrs(curMin)) };

  // build all Mondays whose ISO-week belongs to this calendar year-ish:
  // simplest: iterate Mondays of the year
  const firstMon = mondayOf(`${year}-01-04`); // ISO week 1 contains Jan 4
  const cells = [];
  let w = firstMon;
  for (let i = 0; i < 53; i++) {
    const wn = isoWeek(w);
    const rec = byWeek[w];
    const min = rec ? rec.minutes : weekMinutes(state.kid, w);
    const h = hrs(min);
    const tier = tierFor(state.kid, h);
    const isFuture = w > curMon;
    const isCur = w === curMon;
    cells.push({ w, wn, min, h, tier, isFuture, isCur });
    w = addDays(w, 7);
    if (isoWeek(w) === 1 && i > 40) break; // wrapped into next year
  }

  const grid = cells.map(c => {
    const bg = c.min > 0 ? `background:${c.tier.color}; border-color:${c.tier.color}; color:#1a1330` : "";
    return `<div class="heat-cell ${c.isFuture ? "future" : ""} ${c.isCur ? "current" : ""}" style="${bg}"
              data-week-cell="${c.w}" title="Week ${c.wn} · ${hrsLabel(c.min)}h · ${c.tier.label}">
      <div class="wk" style="${c.min>0?'color:rgba(0,0,0,.55)':''}">W${c.wn}</div>
      <div class="hh">${c.min > 0 ? hrsLabel(c.min) : "·"}</div>
    </div>`;
  }).join("");

  // year stats
  const played = cells.filter(c => !c.isFuture && c.min > 0);
  const goldWeeks = cells.filter(c => GOLD_PLUS.has(c.tier.id)).length;
  const totalH = cells.reduce((s, c) => s + c.h, 0);
  const bestWeek = cells.reduce((m, c) => c.h > m ? c.h : m, 0);

  const legend = tiersFor(state.kid).map(t => `<span class="lg"><span class="sw" style="background:${t.color}"></span>${t.icon} ${t.label}${t.hours?` (${t.hours}h)`:""}</span>`).join("");

  return `
  <section class="panel span2">
    <div class="week-head">
      <div class="section-title">📅 ${KIDS[state.kid].name}'s Chess Year</div>
      <div class="year-nav">
        <button data-year="-1">‹</button>
        <div class="week-label">${year}</div>
        <button data-year="1" ${year >= new Date().getFullYear() ? "disabled" : ""}>›</button>
      </div>
    </div>
    <div class="streak-sub">Each block is one week. Colour = tier reached, number = hours played. Click a block to view it.</div>
    <div class="heat">${grid}</div>
    <div class="legend">${legend}</div>
    <div class="year-stats">
      <div class="stat"><div class="v">${Math.round(totalH)}h</div><div class="k">Total this year</div></div>
      <div class="stat"><div class="v">${played.length}</div><div class="k">Weeks played</div></div>
      <div class="stat"><div class="v">${goldWeeks}</div><div class="k">🥇 Gold+ weeks</div></div>
      <div class="stat"><div class="v">${hrsLabel(bestWeek*60)}h</div><div class="k">Best week</div></div>
    </div>
  </section>`;
}

/* ---------- REWARDS ---------- */
function renderRewards() {
  const ledger = ledgerFor(state.kid);
  const earned = ledger.reduce((s, r) => s + r.amount, 0);
  const paid = ledger.filter(r => r.paid).reduce((s, r) => s + r.amount, 0);
  const due = earned - paid;
  const cur = streakSeries(state.kid).current;

  const ladderSteps = [
    { lv: "1–2", r: 20, on: cur >= 1 && cur <= 2 },
    { lv: "3–4", r: 50, on: cur >= 3 && cur <= 4 },
    { lv: "5–6", r: 100, on: cur >= 5 && cur <= 6 },
    { lv: "7–9", r: 150, on: cur >= 7 && cur <= 9 },
    { lv: "10", r: 200, on: cur >= 10 },
  ].map(s => `<div class="step ${s.on ? "on" : ""}"><div class="lv">Streak ${s.lv}</div><div class="rr">${CURRENCY}${s.r}</div></div>`).join("");

  const rows = ledger.length ? ledger.map(r => `
    <div class="ledger-row">
      <div class="wk">Week ${isoWeek(r.week)} · ${r.tier.icon} ${r.tier.label}<small>${monthDay(r.week)} – ${monthDay(addDays(r.week,6))} · ${hrsLabel(r.minutes)}h · streak ${r.streak}</small></div>
      <div class="amt">${CURRENCY}${r.amount}</div>
      <button class="pay-toggle ${r.paid ? "paid" : "unpaid"}" data-pay="${r.week}" data-amt="${r.amount}">${r.paid ? "✅ Paid" : "Mark paid"}</button>
    </div>`).join("")
    : `<div class="empty-note">No rewards earned yet.<br>Reach <b>Gold (10h)</b> in a finished week to start earning! 💰</div>`;

  const pinSet = !!state.settings.parent_pin;

  return `
  <section class="panel span2">
    <div class="section-title">💰 Rewards</div>
    <div class="reward-summary">
      <div class="rs-card earned"><div class="v">${CURRENCY}${earned}</div><div class="k">Total earned</div></div>
      <div class="rs-card paid"><div class="v">${CURRENCY}${paid}</div><div class="k">Paid out</div></div>
      <div class="rs-card due"><div class="v">${CURRENCY}${due}</div><div class="k">Still owed</div></div>
    </div>
    <div class="streak-sub">You earn money for every <b>finished week</b> where you reach Gold or higher. The amount follows your streak level:</div>
    <div class="ladder">${ladderSteps}</div>
    <div class="section-title" style="margin-top:22px">🧾 Reward history</div>
    <div class="ledger">${rows}</div>
    <div class="pin-bar">
      🔒 Parent lock for "Mark paid":
      ${pinSet
        ? `<span>PIN is set.</span><button data-pin-clear>Remove PIN</button>`
        : `<input type="password" maxlength="6" placeholder="set PIN" data-pin-input><button data-pin-set>Set PIN</button>`}
    </div>
  </section>`;
}

/* ============================================================
   EVENT WIRING
   ============================================================ */
function wire() {
  // tabs
  app.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { state.tab = b.dataset.tab; render(); });
  const sw = app.querySelector("[data-switch]");
  if (sw) sw.onclick = () => { state.kid = null; render(); };

  // week nav
  app.querySelectorAll("[data-week]").forEach(b => b.onclick = () => {
    const dir = Number(b.dataset.week);
    const next = addDays(state.weekStart, dir * 7);
    if (next > mondayOf(todayStr())) return;
    state.weekStart = next; render();
  });
  // year nav
  app.querySelectorAll("[data-year]").forEach(b => b.onclick = () => { state.historyYear += Number(b.dataset.year); render(); });
  // history cell -> jump to that week
  app.querySelectorAll("[data-week-cell]").forEach(b => b.onclick = () => {
    state.weekStart = b.dataset.weekCell; state.tab = "dashboard"; render();
  });

  // day pick
  app.querySelectorAll("[data-day]").forEach(b => b.onclick = () => { state.sel.day = b.dataset.day; render(); });
  // activity pick
  app.querySelectorAll("[data-act]").forEach(b => b.onclick = () => {
    state.sel.act = b.dataset.act; state.sel.minutes = null; state.sel.custom = ""; render();
  });
  // duration chips
  app.querySelectorAll("[data-min]").forEach(b => b.onclick = () => { state.sel.minutes = Number(b.dataset.min); state.sel.custom = ""; render(); });
  const custom = app.querySelector("[data-custom]");
  if (custom) custom.oninput = () => { state.sel.custom = custom.value; state.sel.minutes = null;
    app.querySelectorAll("[data-min]").forEach(c => c.classList.remove("sel"));
    const addb = app.querySelector("[data-add]"); if (addb) addb.disabled = !custom.value;
  };

  // add
  const addBtn = app.querySelector("[data-add]");
  if (addBtn) addBtn.onclick = onAdd;

  // delete
  app.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
    await Store.deleteActivity(b.dataset.del); render();
  });

  // pay toggle
  app.querySelectorAll("[data-pay]").forEach(b => b.onclick = () => onPayToggle(b.dataset.pay, Number(b.dataset.amt)));

  // pin
  const pinSet = app.querySelector("[data-pin-set]");
  if (pinSet) pinSet.onclick = async () => {
    const v = app.querySelector("[data-pin-input]").value.trim();
    if (!v) return;
    await Store.setSetting("parent_pin", v); toast("🔒 Parent PIN set"); render();
  };
  const pinClear = app.querySelector("[data-pin-clear]");
  if (pinClear) pinClear.onclick = async () => {
    const v = prompt("Enter current PIN to remove it:");
    if (v === state.settings.parent_pin) { await Store.setSetting("parent_pin", ""); toast("PIN removed"); render(); }
    else toast("❌ Wrong PIN");
  };
}

async function onAdd() {
  const a = ACT_BY_ID[state.sel.act];
  let minutes;
  if (a.fixed) minutes = a.fixed;
  else if (state.sel.minutes) minutes = state.sel.minutes;
  else if (state.sel.custom) minutes = a.custom === "hours" ? Math.round(parseFloat(state.sel.custom) * 60) : Math.round(parseFloat(state.sel.custom));
  if (!minutes || minutes <= 0) return;

  // tier before/after for celebration
  const before = tierFor(state.kid, hrs(weekMinutes(state.kid, mondayOf(state.sel.day))));

  const rec = { id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
    kid: state.kid, date: state.sel.day, type: a.id, minutes };
  await Store.addActivity(rec);

  const after = tierFor(state.kid, hrs(weekMinutes(state.kid, mondayOf(state.sel.day))));

  // reset duration selection (keep day + activity for fast multi-entry)
  state.sel.minutes = null; state.sel.custom = "";
  render();

  if (after.id !== before.id && after.id !== "none") {
    celebrate(`${after.icon} ${after.label} unlocked! Amazing!`, true);
  } else {
    toast(`✅ Added ${hrsLabel(minutes)}h of ${a.label}`);
  }
}

async function onPayToggle(week, amount) {
  const key = `${state.kid}|${week}`;
  const cur = state.payouts[key];
  const isPaid = !!(cur && cur.paid);
  // require PIN to CHANGE if a pin is set
  if (state.settings.parent_pin) {
    const v = prompt("Parent PIN to change payment status:");
    if (v !== state.settings.parent_pin) { toast("❌ Wrong PIN"); return; }
  }
  await Store.setPayout(state.kid, week, !isPaid, amount);
  toast(!isPaid ? `💸 Marked ${CURRENCY}${amount} as paid` : "Marked as unpaid");
  render();
}

/* ============================================================
   TOAST + CONFETTI
   ============================================================ */
let toastTimer;
function toast(msg, win = false) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "show" + (win ? " win" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ""; }, 2600);
}
function celebrate(msg, big) {
  toast(msg, true);
  fireConfetti(big ? 160 : 70);
}

/* lightweight canvas confetti (no dependency) */
const cc = document.getElementById("confetti-canvas");
const ctx = cc.getContext("2d");
let pieces = [], rafId = null;
function sizeCanvas() { cc.width = window.innerWidth; cc.height = window.innerHeight; }
sizeCanvas(); window.addEventListener("resize", sizeCanvas);
const COLORS = ["#ffd23f", "#ff7ad9", "#3aa0ff", "#46e6c0", "#ff7a18", "#c061f0"];
function fireConfetti(n) {
  for (let i = 0; i < n; i++) {
    pieces.push({
      x: Math.random() * cc.width, y: -20 - Math.random() * cc.height * 0.3,
      vx: (Math.random() - 0.5) * 6, vy: 3 + Math.random() * 5,
      s: 6 + Math.random() * 8, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
      c: COLORS[(Math.random() * COLORS.length) | 0], life: 0,
    });
  }
  if (!rafId) loopConfetti();
}
function loopConfetti() {
  ctx.clearRect(0, 0, cc.width, cc.height);
  pieces = pieces.filter(p => p.y < cc.height + 30 && p.life < 400);
  pieces.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.rot += p.vr; p.life++;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
    ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore();
  });
  if (pieces.length) rafId = requestAnimationFrame(loopConfetti);
  else { ctx.clearRect(0, 0, cc.width, cc.height); rafId = null; }
}

/* ============================================================
   BOOT
   ============================================================ */
(async function boot() {
  Store.init();
  app.innerHTML = `<div class="picker-wrap"><div class="logo">♞</div><div class="tag">Loading your chess quest…</div></div>`;
  await Store.loadAll();
  render();
})();
