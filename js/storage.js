// Unified storage layer: talks to FastAPI when the user is signed in,
// falls back to localStorage otherwise. Every HTML page imports this module
// instead of touching localStorage directly.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CONFIG } from "./config.js";

export const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

const TODAY = () => new Date().toISOString().slice(0, 10);

// ── Local fallbacks ─────────────────────────────────────────────────────────

const LS = {
  getCards() {
    try {
      return JSON.parse(localStorage.getItem("vocabCards") || "{}");
    } catch {
      return {};
    }
  },
  setCards(cards) {
    localStorage.setItem("vocabCards", JSON.stringify(cards));
  },
  getProgress() {
    try {
      return JSON.parse(localStorage.getItem("storyProgress") || "{}");
    } catch {
      return {};
    }
  },
  setProgress(p) {
    localStorage.setItem("storyProgress", JSON.stringify(p));
  },
  getReadingDates() {
    try {
      return JSON.parse(localStorage.getItem("readingDates") || "[]");
    } catch {
      return [];
    }
  },
  setReadingDates(d) {
    localStorage.setItem("readingDates", JSON.stringify(d));
  },
};

// ── Session plumbing ────────────────────────────────────────────────────────

let _session = null;
let _sessionReady;

async function ensureSession() {
  if (_sessionReady) return _sessionReady;
  _sessionReady = sb.auth.getSession().then(({ data }) => {
    _session = data.session;
  });
  sb.auth.onAuthStateChange((_evt, session) => {
    _session = session;
  });
  return _sessionReady;
}

export async function isSignedIn() {
  await ensureSession();
  return !!_session;
}

export async function currentUser() {
  await ensureSession();
  return _session?.user || null;
}

async function authedFetch(path, opts = {}) {
  await ensureSession();
  const headers = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  if (_session?.access_token) {
    headers.Authorization = "Bearer " + _session.access_token;
  }
  const res = await fetch(CONFIG.API_URL + path, { ...opts, headers });
  if (res.status === 401) {
    _session = null;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Card shape adapter ──────────────────────────────────────────────────────
// Local shape (historical): keyed by telugu → { telugu, trans, meaning,
//   storyIdx, interval, easeFactor, repetitions, nextReview, added, id? }
// Server shape: { id, telugu, trans, meaning, story_idx, interval, ease_factor,
//   repetitions, next_review, added_at }

function serverToLocalCard(c) {
  return {
    id: c.id,
    telugu: c.telugu,
    trans: c.trans || "",
    meaning: c.meaning || "",
    storyIdx: c.story_idx,
    interval: c.interval,
    easeFactor: c.ease_factor,
    repetitions: c.repetitions,
    nextReview: c.next_review,
    added: c.added_at?.slice(0, 10),
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function getCards() {
  if (!(await isSignedIn())) return LS.getCards();
  const list = await authedFetch("/cards");
  const map = {};
  for (const c of list) map[c.telugu] = serverToLocalCard(c);
  return map;
}

export async function addCard(card) {
  if (!(await isSignedIn())) {
    const cards = LS.getCards();
    if (!cards[card.telugu]) {
      cards[card.telugu] = {
        ...card,
        interval: 1,
        easeFactor: 2.5,
        repetitions: 0,
        nextReview: TODAY(),
        added: TODAY(),
      };
      LS.setCards(cards);
    }
    return cards[card.telugu];
  }

  const created = await authedFetch("/cards", {
    method: "POST",
    body: JSON.stringify({
      telugu: card.telugu,
      trans: card.trans,
      meaning: card.meaning,
      story_idx: card.storyIdx ?? null,
    }),
  });
  return serverToLocalCard(created);
}

export async function updateCardMeaning(card, meaning) {
  if (!(await isSignedIn())) {
    const cards = LS.getCards();
    if (cards[card.telugu]) {
      cards[card.telugu].meaning = meaning;
      LS.setCards(cards);
    }
    return;
  }
  if (!card.id) return;
  await authedFetch(`/cards/${card.id}`, {
    method: "PATCH",
    body: JSON.stringify({ meaning }),
  });
}

export async function rateCard(card, quality) {
  if (!(await isSignedIn())) {
    const cards = LS.getCards();
    const c = cards[card.telugu];
    if (!c) return null;
    const updated = applySm2Local(c, quality);
    cards[card.telugu] = updated;
    LS.setCards(cards);
    return updated;
  }

  const updated = await authedFetch(`/cards/${card.id}/rate`, {
    method: "POST",
    body: JSON.stringify({ quality }),
  });
  return serverToLocalCard(updated);
}

export async function saveStoryProgress(storyIdx, bestPct) {
  if (!(await isSignedIn())) {
    const p = LS.getProgress();
    const key = String(storyIdx);
    const existing = p[key];
    if (!existing || bestPct > existing.bestPct) {
      p[key] = { bestPct, lastRead: TODAY() };
    } else {
      p[key].lastRead = TODAY();
    }
    LS.setProgress(p);
    return;
  }
  await authedFetch("/progress", {
    method: "POST",
    body: JSON.stringify({ story_idx: storyIdx, best_pct: bestPct }),
  });
}

export async function getStoryProgress() {
  if (!(await isSignedIn())) return LS.getProgress();
  const list = await authedFetch("/progress");
  const map = {};
  for (const p of list) {
    map[String(p.story_idx)] = {
      bestPct: p.best_pct,
      lastRead: p.last_read_at?.slice(0, 10),
    };
  }
  return map;
}

export async function recordReadingDate() {
  if (!(await isSignedIn())) {
    const dates = LS.getReadingDates();
    const today = TODAY();
    if (dates[0] !== today) {
      dates.unshift(today);
      if (dates.length > 365) dates.length = 365;
      LS.setReadingDates(dates);
    }
    return;
  }
  await authedFetch("/reading-days", { method: "POST" });
}

export async function getStreak() {
  if (!(await isSignedIn())) {
    return calculateStreakLocal(LS.getReadingDates());
  }
  const { streak } = await authedFetch("/streak");
  return streak;
}

// ── Auth ────────────────────────────────────────────────────────────────────

function usernameToEmail(u) {
  return `${u.toLowerCase().trim()}@${CONFIG.EMAIL_DOMAIN}`;
}

export async function signUp(username, password) {
  const { data, error } = await sb.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { username } },
  });
  if (error) throw error;
  _session = data.session;
  return data.user;
}

export async function signIn(username, password) {
  const { data, error } = await sb.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error) throw error;
  _session = data.session;
  return data.user;
}

export async function signOut() {
  await sb.auth.signOut();
  _session = null;
}

// ── First-login import ──────────────────────────────────────────────────────

const IMPORTED_FLAG = "kathaluImported";

export async function importLocalIfFirstLogin() {
  if (!(await isSignedIn())) return null;
  const user = await currentUser();
  const flagKey = `${IMPORTED_FLAG}:${user.id}`;
  if (localStorage.getItem(flagKey)) return null;

  const cards = Object.values(LS.getCards());
  const progress = LS.getProgress();
  const dates = LS.getReadingDates();

  if (!cards.length && !Object.keys(progress).length && !dates.length) {
    localStorage.setItem(flagKey, "1");
    return null;
  }

  const payload = {
    cards: cards.map((c) => ({
      telugu: c.telugu,
      trans: c.trans || null,
      meaning: c.meaning || null,
      story_idx: c.storyIdx ?? null,
      interval: c.interval ?? 0,
      ease_factor: c.easeFactor ?? 2.5,
      repetitions: c.repetitions ?? 0,
      next_review: c.nextReview || null,
      added_at: c.added ? `${c.added}T00:00:00Z` : null,
    })),
    story_progress: Object.entries(progress).map(([idx, v]) => ({
      story_idx: parseInt(idx, 10),
      best_pct: v.bestPct ?? 0,
    })),
    reading_days: dates,
  };

  const result = await authedFetch("/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  localStorage.setItem(flagKey, "1");
  return result;
}

// ── Local SM-2 fallback (mirrors backend/app/sm2.py) ────────────────────────

function applySm2Local(card, quality) {
  let { interval = 0, easeFactor = 2.5, repetitions = 0 } = card;
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
    easeFactor = Math.max(1.3, easeFactor);
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    easeFactor = Math.max(
      1.3,
      easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    );
    repetitions++;
  }
  const next = new Date();
  next.setDate(next.getDate() + interval);
  return {
    ...card,
    interval,
    easeFactor,
    repetitions,
    nextReview: next.toISOString().slice(0, 10),
  };
}

function calculateStreakLocal(dates) {
  if (!dates.length) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mostRecent = new Date(dates[0] + "T00:00:00");
  const diffDays = Math.floor((today - mostRecent) / 86400000);
  if (diffDays > 1) return 0;
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + "T00:00:00");
    const curr = new Date(dates[i] + "T00:00:00");
    const gap = Math.floor((prev - curr) / 86400000);
    if (gap === 1) streak++;
    else break;
  }
  return streak;
}
