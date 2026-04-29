// Write-through sync: existing pages keep using localStorage synchronously.
// When the user is signed in, we (a) hydrate local from cloud on load,
// (b) mirror writes to the cloud in the background,
// (c) import pre-existing local data on first login.
//
// Include this as <script type="module" src="./js/sync.js"></script>
// It self-mounts. Pages may rely on localStorage as usual.

import {
  getCards,
  getStoryProgress,
  isSignedIn,
  importLocalIfFirstLogin,
  signOut,
  sb,
  currentUser,
} from "./storage.js";
import { mountAuthUI } from "./auth-ui.js";
import { CONFIG } from "./config.js";

const TRACKED = new Set(["vocabCards", "storyProgress", "readingDates"]);

async function authHeader() {
  const { data } = await sb.auth.getSession();
  return data.session
    ? { Authorization: "Bearer " + data.session.access_token }
    : null;
}

async function api(path, opts = {}) {
  const h = await authHeader();
  if (!h) return null;
  const res = await fetch(CONFIG.API_URL + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...h,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${t || res.statusText}`);
  }
  return res.status === 204 ? null : res.json();
}

// ── Diff helpers ────────────────────────────────────────────────────────────

let lastKnown = {
  vocabCards: null,
  storyProgress: null,
  readingDates: null,
};

function snapshot() {
  lastKnown.vocabCards = safeParse(localStorage.getItem("vocabCards"), {});
  lastKnown.storyProgress = safeParse(localStorage.getItem("storyProgress"), {});
  lastKnown.readingDates = safeParse(localStorage.getItem("readingDates"), []);
}

function safeParse(s, fallback) {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}

function qualityFromDelta(old, next) {
  if (!old) return null;
  const prevReps = old.repetitions ?? 0;
  const nextReps = next.repetitions ?? 0;
  if (nextReps === 0 && prevReps > 0) return 0;
  if (nextReps > prevReps) {
    const efDelta = (next.easeFactor ?? 2.5) - (old.easeFactor ?? 2.5);
    if (efDelta > 0.09) return 5;
    if (efDelta >= 0 && efDelta <= 0.01) return 4;
    return 3;
  }
  return null;
}

async function pushCardsDiff(next) {
  const prev = lastKnown.vocabCards || {};
  const toSync = [];

  for (const [telugu, card] of Object.entries(next)) {
    const old = prev[telugu];
    const srsChanged =
      !old ||
      old.interval !== card.interval ||
      old.easeFactor !== card.easeFactor ||
      old.repetitions !== card.repetitions ||
      old.nextReview !== card.nextReview ||
      old.meaning !== card.meaning ||
      old.trans !== card.trans;

    if (!srsChanged) continue;

    toSync.push({
      telugu,
      trans: card.trans || null,
      meaning: card.meaning || null,
      story_idx: card.storyIdx ?? null,
      interval: card.interval ?? 0,
      ease_factor: card.easeFactor ?? 2.5,
      repetitions: card.repetitions ?? 0,
      next_review: card.nextReview || new Date().toISOString().slice(0, 10),
      last_quality: qualityFromDelta(old, card),
    });
  }

  if (!toSync.length) return;
  await api("/cards/state-sync", {
    method: "POST",
    body: JSON.stringify({ cards: toSync }),
  });
}

async function pushProgressDiff(next) {
  const prev = lastKnown.storyProgress || {};
  const ops = [];
  for (const [idx, v] of Object.entries(next)) {
    const old = prev[idx];
    if (!old || old.bestPct !== v.bestPct || old.lastRead !== v.lastRead) {
      ops.push(
        api("/progress", {
          method: "POST",
          body: JSON.stringify({
            story_idx: parseInt(idx, 10),
            best_pct: v.bestPct ?? 0,
          }),
        })
      );
    }
  }
  await Promise.allSettled(ops);
}

async function pushReadingDaysDiff(next) {
  const prev = new Set(lastKnown.readingDates || []);
  const added = (next || []).filter((d) => !prev.has(d));
  if (!added.length) return;
  // Server only supports "today". Only push if today was added.
  const today = new Date().toISOString().slice(0, 10);
  if (added.includes(today)) {
    await api("/reading-days", { method: "POST" });
  }
}

// Called whenever one of the tracked keys is written.
async function onLocalWrite(key) {
  const signedIn = await isSignedIn();
  console.log("[kathalu sync] onLocalWrite", key, "signedIn:", signedIn);
  if (!signedIn) return;
  const raw = localStorage.getItem(key);
  const next = safeParse(raw, key === "readingDates" ? [] : {});
  try {
    if (key === "vocabCards") await pushCardsDiff(next);
    else if (key === "storyProgress") await pushProgressDiff(next);
    else if (key === "readingDates") await pushReadingDaysDiff(next);
  } catch (e) {
    console.warn("[kathalu sync] push failed", key, e);
  }
  lastKnown[key] = next;
}

// ── Monkey-patch Storage.prototype.setItem for tracked keys ─────────────────
// Patch the prototype (not the instance) so it works reliably across browsers
// including Safari. Guard against double-install across module re-imports.

function installWriteInterceptor() {
  if (Storage.prototype.__kathaluPatched) return;
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    orig.call(this, key, value);
    if (this === localStorage && TRACKED.has(key)) {
      console.log("[kathalu sync] intercepted setItem", key);
      queueMicrotask(() => onLocalWrite(key));
    }
  };
  Storage.prototype.__kathaluPatched = true;
}

// ── Card-rating detection (intercept rate path for SM-2 server update) ─────
// The flashcard page writes updated SRS fields directly to vocabCards. We
// detect per-card rating changes in the diff and send them to /cards/:id/rate
// when the card has a server id known.

const HYDRATE_KEY = "kathalu:hydrated";

async function hydrateLocalFromCloud(force = false) {
  if (!(await isSignedIn())) return;
  if (!force && sessionStorage.getItem(HYDRATE_KEY)) return;

  const [cardsMap, progress, streakData] = await Promise.all([
    getCards(),
    getStoryProgress(),
    api("/streak"),
  ]);

  // Only overwrite if cloud has data, or local is empty. This keeps freshly
  // clicked words alive across navigations while the background POST is in
  // flight.
  const localCards = safeParse(localStorage.getItem("vocabCards"), {});
  if (Object.keys(cardsMap).length > 0 || Object.keys(localCards).length === 0) {
    localStorage.setItem("vocabCards", JSON.stringify(cardsMap));
  }
  const localProgress = safeParse(localStorage.getItem("storyProgress"), {});
  if (Object.keys(progress).length > 0 || Object.keys(localProgress).length === 0) {
    localStorage.setItem("storyProgress", JSON.stringify(progress));
  }
  sessionStorage.setItem(HYDRATE_KEY, "1");

  // readingDates: reconstruct last-N-days list so the streak UI works.
  // Server owns truth; fetch today's status implicitly via streak endpoint.
  // Simplest: build a synthetic list from streak length.
  const streak = streakData?.streak ?? 0;
  const lastRead = streakData?.last_read;
  const dates = [];
  if (lastRead) {
    const base = new Date(lastRead + "T00:00:00");
    for (let i = 0; i < streak; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
  }
  localStorage.setItem("readingDates", JSON.stringify(dates));
  snapshot();
}

// ── Boot ────────────────────────────────────────────────────────────────────

async function boot() {
  snapshot();
  installWriteInterceptor();

  // Mount auth chip if a slot exists.
  await mountAuthUI();

  if (await isSignedIn()) {
    try {
      await importLocalIfFirstLogin();
      await hydrateLocalFromCloud();
      // Let pages re-read from localStorage after hydration.
      window.dispatchEvent(new CustomEvent("kathalu:synced"));
    } catch (e) {
      console.warn("[kathalu sync] hydrate failed", e);
    }
  }

  sb.auth.onAuthStateChange(async (evt) => {
    if (evt === "SIGNED_IN") {
      try {
        await importLocalIfFirstLogin();
        sessionStorage.removeItem(HYDRATE_KEY);
        await hydrateLocalFromCloud(true);
        window.dispatchEvent(new CustomEvent("kathalu:synced"));
      } catch (e) {
        console.warn("[kathalu sync] post-auth hydrate failed", e);
      }
    }
    if (evt === "SIGNED_OUT") {
      sessionStorage.removeItem(HYDRATE_KEY);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

export { signOut };
