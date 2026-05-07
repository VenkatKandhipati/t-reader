// Account settings page: stats grid, switchable heatmap, password change, delete.

import {
  changePassword,
  currentUser,
  deleteAccount,
  getAccountStats,
  getHeatmap,
  isSignedIn,
  sb,
} from "./storage.js";

const STORIES = window.STORIES || [];

const root = document.getElementById("content");
const userLine = document.getElementById("userLine");

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    e.append(c instanceof Node ? c : document.createTextNode(c));
  }
  return e;
}

function tile(label, value, sub, cls = "") {
  return el(
    "div",
    { class: "tile" },
    el("div", { class: "tile-label" }, label),
    el("div", { class: "tile-value " + cls }, String(value)),
    sub ? el("div", { class: "tile-sub" }, sub) : null
  );
}

// ── Heatmap ────────────────────────────────────────────────────────────────

const HEAT_BANDS = [
  [0, "var(--heat-0)"],
  [1, "var(--heat-1)"],
  [3, "var(--heat-2)"],
  [8, "var(--heat-3)"],
  [16, "var(--heat-4)"],
];

function heatColor(count) {
  let color = HEAT_BANDS[0][1];
  for (const [threshold, c] of HEAT_BANDS) {
    if (count >= threshold) color = c;
  }
  return color;
}

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

function buildHeatmap(data) {
  const start = new Date(data.start + "T00:00:00");
  const end = new Date(data.end + "T00:00:00");
  const counts = new Map(data.days.map((p) => [p.day, p.count]));

  const cell = 13;
  const gap = 3;

  if (data.range === "year") {
    const startSunday = new Date(start);
    startSunday.setDate(start.getDate() - start.getDay());
    const totalDays = Math.floor((end - startSunday) / 86400000) + 1;
    const weeks = Math.ceil(totalDays / 7);

    const w = weeks * (cell + gap) + 30;
    const h = 7 * (cell + gap) + 20;
    const svg = svgEl("svg", {
      class: "heatmap-svg",
      width: w,
      height: h,
      viewBox: `0 0 ${w} ${h}`,
    });

    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    let lastMonth = -1;
    for (let col = 0; col < weeks; col++) {
      const probe = new Date(startSunday);
      probe.setDate(startSunday.getDate() + col * 7);
      const m = probe.getMonth();
      if (m !== lastMonth && probe.getDate() <= 7) {
        svg.appendChild(svgEl("text", {
          x: 30 + col * (cell + gap),
          y: 10,
          "font-size": 9,
          fill: "var(--text-muted)",
        }, months[m]));
        lastMonth = m;
      }
    }

    ["Mon","Wed","Fri"].forEach((label, i) => {
      svg.appendChild(svgEl("text", {
        x: 0, y: 20 + (1 + i * 2) * (cell + gap) + 9,
        "font-size": 9, fill: "var(--text-muted)",
      }, label));
    });

    for (let col = 0; col < weeks; col++) {
      for (let row = 0; row < 7; row++) {
        const d = new Date(startSunday);
        d.setDate(startSunday.getDate() + col * 7 + row);
        if (d < start || d > end) continue;
        const key = dateKey(d);
        const c = counts.get(key) || 0;
        svg.appendChild(svgEl("rect", {
          class: "heat-cell",
          x: 30 + col * (cell + gap),
          y: 20 + row * (cell + gap),
          width: cell,
          height: cell,
          rx: 2,
          fill: heatColor(c),
        }, null, [["title", `${key}: ${c} activity`]]));
      }
    }
    return svg;
  }

  if (data.range === "month") {
    const startSunday = new Date(start);
    startSunday.setDate(start.getDate() - start.getDay());
    const totalDays = Math.floor((end - startSunday) / 86400000) + 1;
    const weeks = Math.ceil(totalDays / 7);

    const cellM = 28;
    const gapM = 4;
    const w = weeks * (cellM + gapM) + 30;
    const h = 7 * (cellM + gapM) + 20;
    const svg = svgEl("svg", { class: "heatmap-svg", width: w, height: h, viewBox: `0 0 ${w} ${h}` });

    ["S","M","T","W","T","F","S"].forEach((label, i) => {
      svg.appendChild(svgEl("text", {
        x: 0, y: 20 + i * (cellM + gapM) + 18,
        "font-size": 10, fill: "var(--text-muted)",
      }, label));
    });

    for (let col = 0; col < weeks; col++) {
      for (let row = 0; row < 7; row++) {
        const d = new Date(startSunday);
        d.setDate(startSunday.getDate() + col * 7 + row);
        if (d < start || d > end) continue;
        const key = dateKey(d);
        const c = counts.get(key) || 0;
        const g = svgEl("g", {});
        g.appendChild(svgEl("rect", {
          class: "heat-cell",
          x: 30 + col * (cellM + gapM),
          y: 20 + row * (cellM + gapM),
          width: cellM,
          height: cellM,
          rx: 4,
          fill: heatColor(c),
        }, null, [["title", `${key}: ${c} activity`]]));
        g.appendChild(svgEl("text", {
          x: 30 + col * (cellM + gapM) + cellM / 2,
          y: 20 + row * (cellM + gapM) + cellM / 2 + 3,
          "text-anchor": "middle",
          "font-size": 9,
          fill: c >= 8 ? "#fff" : "var(--text-muted)",
        }, String(d.getDate())));
        svg.appendChild(g);
      }
    }
    return svg;
  }

  // week
  const cellW = 44;
  const gapW = 6;
  const w = 7 * (cellW + gapW);
  const h = cellW + 30;
  const svg = svgEl("svg", { class: "heatmap-svg", width: w, height: h, viewBox: `0 0 ${w} ${h}` });
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dateKey(d);
    const c = counts.get(key) || 0;
    svg.appendChild(svgEl("text", {
      x: i * (cellW + gapW) + cellW / 2,
      y: 12,
      "text-anchor": "middle",
      "font-size": 10,
      fill: "var(--text-muted)",
    }, days[d.getDay()]));
    svg.appendChild(svgEl("rect", {
      class: "heat-cell",
      x: i * (cellW + gapW),
      y: 18,
      width: cellW,
      height: cellW,
      rx: 5,
      fill: heatColor(c),
    }, null, [["title", `${key}: ${c} activity`]]));
    svg.appendChild(svgEl("text", {
      x: i * (cellW + gapW) + cellW / 2,
      y: 18 + cellW / 2 + 4,
      "text-anchor": "middle",
      "font-size": 13,
      "font-weight": "600",
      fill: c >= 8 ? "#fff" : "var(--text-muted)",
    }, String(d.getDate())));
  }
  return svg;
}

function svgEl(tag, attrs = {}, text = null, titles = []) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.setAttribute("class", v);
    else e.setAttribute(k, String(v));
  }
  if (text != null) e.textContent = text;
  for (const [tk, tv] of titles) {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "title");
    t.textContent = tv;
    e.appendChild(t);
  }
  return e;
}

function legendCells() {
  const wrap = el("span", { class: "legend-cells" });
  for (const [, color] of HEAT_BANDS) {
    wrap.appendChild(el("span", { class: "legend-cell", style: `background:${color}` }));
  }
  return wrap;
}

// ── Sections ──────────────────────────────────────────────────────────────

function streakSection(stats) {
  const s = stats.streak || {};
  const sinceFirst =
    s.first_read ? Math.max(1, Math.round((Date.now() - new Date(s.first_read + "T00:00:00")) / 86400000)) : 0;
  return el(
    "div",
    { class: "tile-grid" },
    tile("Current streak", s.current ?? 0, s.current ? "days in a row" : "start today", "tile-accent"),
    tile("Longest streak", s.longest ?? 0, "days", "tile-gold"),
    tile("Total reading days", s.total_days ?? 0, sinceFirst ? `over ${sinceFirst} days` : null),
    tile(
      "Activity rate",
      sinceFirst ? Math.round(((s.total_days ?? 0) / sinceFirst) * 100) + "%" : "—",
      "lifetime"
    )
  );
}

function storiesSection(stats) {
  const s = stats.stories || {};
  const total = STORIES.length;
  const coverage = total ? Math.round(((s.started ?? 0) / total) * 100) : 0;
  return el(
    "div",
    { class: "tile-grid" },
    tile("Stories started", s.started ?? 0, total ? `of ${total}` : null),
    tile("Completed", s.completed ?? 0, "≥ 80% proficiency", "tile-green"),
    tile("Mastered", s.mastered ?? 0, "100% proficiency", "tile-gold"),
    tile("Avg proficiency", (s.avg_proficiency ?? 0) + "%", "across started"),
    tile("Library coverage", coverage + "%", "of all stories")
  );
}

function vocabSection(stats) {
  const v = stats.vocab || {};
  return el(
    "div",
    { class: "tile-grid" },
    tile("Total cards", v.total ?? 0, "in your deck"),
    tile("Due today", v.due_today ?? 0, "ready to review", "tile-accent"),
    tile("Learning", v.learning ?? 0, "rep < 2"),
    tile("Young", v.young ?? 0, "interval < 21d", "tile-gold"),
    tile("Mature", v.mature ?? 0, "interval ≥ 21d", "tile-green"),
    tile("Mastered", v.mastered ?? 0, "interval ≥ 90d", "tile-green"),
    tile("Avg ease", (v.avg_ease ?? 0).toFixed(2), "difficulty proxy")
  );
}

function reviewSection(stats) {
  const r = stats.reviews || {};
  return el(
    "div",
    { class: "tile-grid" },
    tile("Total reviews", r.total ?? 0, "all-time"),
    tile("Last 7 days", r.last_7d ?? 0, "reviews"),
    tile("Last 30 days", r.last_30d ?? 0, "reviews"),
    tile(
      "Recall (30d)",
      Math.round((r.accuracy_30d ?? 0) * 100) + "%",
      "rated ≥ Good",
      "tile-green"
    ),
    tile(
      "Recall (all-time)",
      Math.round((r.accuracy_overall ?? 0) * 100) + "%",
      "rated ≥ Good"
    )
  );
}

function qualityDistribution(stats) {
  const dist = stats.reviews?.quality_dist || {};
  const labels = ["Again", "Hard", "OK", "Good", "Easy", "Perfect"];
  const max = Math.max(1, ...Object.values(dist));
  const wrap = el("div", { class: "forecast" });
  for (let q = 0; q <= 5; q++) {
    const c = dist[String(q)] || 0;
    wrap.appendChild(
      el(
        "div",
        { class: "bar-row" },
        el("span", { class: "label" }, labels[q] + ` (${q})`),
        el(
          "span",
          { class: "track" },
          el("span", {
            class: "fill",
            style: `width:${(c / max) * 100}%; background: ${q < 3 ? "var(--accent)" : q < 5 ? "var(--accent-gold)" : "var(--accent-green)"}`,
          })
        ),
        el("span", { class: "count" }, c)
      )
    );
  }
  return wrap;
}

function forecastSection(stats) {
  const byDay = stats.forecast?.by_day || {};
  const wrap = el("div", { class: "forecast" });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = [];
  let max = 1;
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const c = byDay[key] || 0;
    if (c > max) max = c;
    days.push({ key, c, label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) });
  }
  if (Object.keys(byDay).length === 0) {
    wrap.appendChild(el("div", { class: "empty" }, "No reviews scheduled in the next 30 days."));
    return wrap;
  }
  for (const d of days) {
    wrap.appendChild(
      el(
        "div",
        { class: "bar-row" },
        el("span", { class: "label" }, d.label),
        el("span", { class: "track" }, el("span", { class: "fill", style: `width:${(d.c / max) * 100}%` })),
        el("span", { class: "count" }, d.c)
      )
    );
  }
  return wrap;
}

function hardestWordsSection(stats) {
  const list = stats.hardest_words || [];
  if (!list.length) {
    return el("div", { class: "word-list" }, el("div", { class: "empty" }, "Review more words to see your toughest ones."));
  }
  const wrap = el("div", { class: "word-list" });
  for (const w of list) {
    wrap.appendChild(
      el(
        "div",
        { class: "word-row" },
        el(
          "span",
          {},
          el("span", { class: "word-telugu" }, w.telugu),
          w.trans ? el("span", { class: "word-trans" }, w.trans) : null
        ),
        el("span", { class: "word-ease" }, "ease " + w.ease_factor.toFixed(2))
      )
    );
  }
  return wrap;
}

function weekdayHourSection(stats) {
  const data = stats.weekday_hour || [];
  if (!data.length) {
    return el("div", { class: "heatmap-wrap" }, el("div", { class: "empty" }, "Once you review some cards we'll show your peak hours."));
  }
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const [w, h, c] of data) grid[w][h] = c;
  let max = 1;
  for (const row of grid) for (const v of row) if (v > max) max = v;

  const cell = 14, gap = 2;
  const w = 24 * (cell + gap) + 30;
  const h = 7 * (cell + gap) + 20;
  const svg = svgEl("svg", { class: "heatmap-svg", width: w, height: h, viewBox: `0 0 ${w} ${h}` });
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  for (let r = 0; r < 7; r++) {
    svg.appendChild(svgEl("text", { x: 0, y: 20 + r * (cell + gap) + 11, "font-size": 9, fill: "var(--text-muted)" }, days[r]));
  }
  for (let h2 = 0; h2 < 24; h2 += 4) {
    svg.appendChild(svgEl("text", { x: 30 + h2 * (cell + gap), y: 12, "font-size": 9, fill: "var(--text-muted)" }, h2 + "h"));
  }
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 24; c++) {
      const v = grid[r][c];
      const intensity = v / max;
      const fill = v === 0 ? "var(--heat-0)" :
        intensity < 0.25 ? "var(--heat-1)" :
        intensity < 0.5  ? "var(--heat-2)" :
        intensity < 0.75 ? "var(--heat-3)" : "var(--heat-4)";
      svg.appendChild(svgEl("rect", {
        class: "heat-cell",
        x: 30 + c * (cell + gap),
        y: 20 + r * (cell + gap),
        width: cell, height: cell, rx: 2,
        fill,
      }, null, [["title", `${days[r]} ${c}:00 — ${v} review${v === 1 ? "" : "s"}`]]));
    }
  }
  return el("div", { class: "heatmap-wrap" }, svg);
}

// ── Forms ─────────────────────────────────────────────────────────────────

function passwordForm() {
  const pw = el("input", { type: "password", autocomplete: "new-password", required: "" });
  const pw2 = el("input", { type: "password", autocomplete: "new-password", required: "" });
  const msg = el("div", { class: "form-msg" });
  const submit = el("button", { type: "submit", class: "primary" }, "Update password");

  const form = el(
    "form",
    {
      class: "form-card",
      onsubmit: async (e) => {
        e.preventDefault();
        msg.className = "form-msg";
        msg.textContent = "";
        if (pw.value.length < 6) { msg.className = "form-msg err"; msg.textContent = "Password must be 6+ characters."; return; }
        if (pw.value !== pw2.value) { msg.className = "form-msg err"; msg.textContent = "Passwords don't match."; return; }
        submit.disabled = true;
        try {
          await changePassword(pw.value);
          msg.className = "form-msg ok";
          msg.textContent = "Password updated.";
          pw.value = ""; pw2.value = "";
        } catch (ex) {
          msg.className = "form-msg err";
          msg.textContent = ex.message || "Couldn't update password.";
        } finally {
          submit.disabled = false;
        }
      },
    },
    el("label", {}, "New password", pw),
    el("label", {}, "Confirm password", pw2),
    msg,
    el("div", { class: "row" }, submit)
  );
  return form;
}

function deleteForm(username) {
  const confirmInput = el("input", { type: "text", placeholder: username, autocomplete: "off" });
  const msg = el("div", { class: "form-msg" });
  const btn = el("button", { type: "submit", class: "danger" }, "Delete my account");

  const form = el(
    "form",
    {
      class: "danger-zone",
      onsubmit: async (e) => {
        e.preventDefault();
        msg.className = "form-msg";
        if (confirmInput.value.trim() !== username) {
          msg.className = "form-msg err";
          msg.textContent = `Type "${username}" exactly to confirm.`;
          return;
        }
        if (!window.confirm("This permanently deletes your account, vocabulary, and reading history. Continue?")) return;
        btn.disabled = true;
        try {
          await deleteAccount();
          window.location.href = "library.html";
        } catch (ex) {
          msg.className = "form-msg err";
          msg.textContent = ex.message || "Couldn't delete account.";
          btn.disabled = false;
        }
      },
    },
    el("p", {}, "This permanently removes your account, all flashcards, story progress, reading days, and reading sessions. You cannot undo this."),
    el("label", {}, `Type your username (${username}) to confirm`, confirmInput),
    msg,
    el("div", { class: "row" }, btn)
  );
  return form;
}

// ── Boot ───────────────────────────────────────────────────────────────────

async function render() {
  const signed = await isSignedIn();
  if (!signed) {
    userLine.textContent = "";
    root.innerHTML = "";
    root.appendChild(
      el(
        "div",
        { class: "signed-out" },
        "Sign in from the ",
        el("a", { href: "library.html" }, "library"),
        " to view your account and statistics."
      )
    );
    return;
  }

  const user = await currentUser();
  const username = user?.user_metadata?.username || user?.email || "you";
  userLine.textContent = `Signed in as ${username}`;

  root.innerHTML = "";
  root.appendChild(el("div", { class: "empty" }, "Loading statistics…"));

  let stats;
  try {
    stats = await getAccountStats();
  } catch (e) {
    root.innerHTML = "";
    root.appendChild(el("div", { class: "empty" }, "Couldn't load stats — " + (e.message || "")));
    return;
  }

  root.innerHTML = "";

  // Heatmap section with switchable range
  const heatHost = el("div", { class: "heatmap-wrap" });
  const yearBtn = el("button", { type: "button" }, "Year");
  const monthBtn = el("button", { type: "button" }, "Month");
  const weekBtn = el("button", { type: "button" }, "Week");

  async function loadHeatmap(range, activeBtn) {
    [yearBtn, monthBtn, weekBtn].forEach((b) => b.classList.remove("active"));
    activeBtn.classList.add("active");
    heatHost.querySelector(".heat-svg-host")?.remove();
    const inner = el("div", { class: "heat-svg-host" }, el("div", { class: "empty" }, "Loading…"));
    heatHost.appendChild(inner);
    try {
      const data = await getHeatmap(range);
      inner.innerHTML = "";
      inner.appendChild(buildHeatmap(data));
    } catch (e) {
      inner.innerHTML = "";
      inner.appendChild(el("div", { class: "empty" }, "Couldn't load heatmap."));
    }
  }

  yearBtn.onclick = () => loadHeatmap("year", yearBtn);
  monthBtn.onclick = () => loadHeatmap("month", monthBtn);
  weekBtn.onclick = () => loadHeatmap("week", weekBtn);

  const controls = el(
    "div",
    { class: "heatmap-controls" },
    el("div", { class: "seg" }, yearBtn, monthBtn, weekBtn),
    el(
      "span",
      { class: "heat-legend" },
      "Less",
      legendCells(),
      "More"
    )
  );
  heatHost.prepend(controls);

  root.appendChild(
    el(
      "section",
      {},
      el("h2", {}, "Reading activity"),
      el("div", { class: "section-hint" }, "Each cell is a day — color shows how active you were."),
      heatHost
    )
  );
  loadHeatmap("year", yearBtn);

  root.appendChild(el("section", {}, el("h2", {}, "Streaks"), streakSection(stats)));
  root.appendChild(el("section", {}, el("h2", {}, "Stories"), storiesSection(stats)));
  root.appendChild(el("section", {}, el("h2", {}, "Vocabulary"), vocabSection(stats)));
  root.appendChild(el("section", {}, el("h2", {}, "Reviews"), reviewSection(stats)));

  root.appendChild(
    el(
      "section",
      {},
      el("h2", {}, "Review forecast"),
      el("div", { class: "section-hint" }, "How many cards become due in the next 14 days."),
      forecastSection(stats)
    )
  );

  root.appendChild(
    el(
      "section",
      {},
      el("h2", {}, "Quality distribution"),
      el("div", { class: "section-hint" }, "Self-rated answer quality across all reviews."),
      qualityDistribution(stats)
    )
  );

  root.appendChild(
    el(
      "section",
      {},
      el("h2", {}, "Peak hours"),
      el("div", { class: "section-hint" }, "When you review — weekday × hour of day."),
      weekdayHourSection(stats)
    )
  );

  root.appendChild(
    el(
      "section",
      {},
      el("h2", {}, "Hardest words"),
      el("div", { class: "section-hint" }, "Lowest ease factor — these need extra attention."),
      hardestWordsSection(stats)
    )
  );

  root.appendChild(
    el(
      "section",
      {},
      el("h2", {}, "Change password"),
      passwordForm()
    )
  );

  root.appendChild(
    el(
      "section",
      {},
      el("h2", {}, "Danger zone"),
      deleteForm(username)
    )
  );
}

render();
sb.auth.onAuthStateChange(() => render());
