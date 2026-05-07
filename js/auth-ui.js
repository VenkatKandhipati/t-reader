// Minimal login/signup modal + account chip. Append once per page:
//   import { mountAuthUI } from "./js/auth-ui.js";
//   mountAuthUI();

import {
  currentUser,
  importLocalIfFirstLogin,
  isSignedIn,
  sb,
  signIn,
  signOut,
  signUp,
} from "./storage.js";
import { getSyncStatus, isOnline, onStatusChange, onSyncStatus } from "./notify.js";

const STYLE = `
  .kathalu-auth-wrap { position: relative; display: inline-block; }

  .kathalu-auth-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--btn-border, #b5b0a6);
    border-radius: 999px;
    background: transparent;
    cursor: pointer;
    font: inherit;
    color: var(--text-primary, #2c2c2c);
    font-size: 0.85rem;
    line-height: 1;
  }
  .kathalu-auth-chip:hover { background: var(--btn-hover-bg, rgba(0,0,0,0.05)); }
  .kathalu-auth-chip:focus-visible {
    outline: 2px solid var(--accent, #b5531a);
    outline-offset: 2px;
  }

  .kathalu-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent, #b5531a);
    color: #fff;
    font-size: 0.8rem;
    font-weight: 600;
    border: 1px solid var(--btn-border, #b5b0a6);
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .kathalu-avatar:hover { opacity: 0.9; }
  .kathalu-avatar:focus-visible {
    outline: 2px solid var(--accent, #b5531a);
    outline-offset: 2px;
  }

  .kathalu-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 200px;
    background: var(--page-bg, #f5f0e6);
    color: var(--text-primary, #2c2c2c);
    border: 1px solid var(--btn-border, #b5b0a6);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    padding: 6px;
    z-index: 10000;
    font-size: 0.85rem;
  }
  .kathalu-menu-label {
    padding: 8px 10px 4px;
    color: var(--text-tertiary, #666);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .kathalu-menu-user {
    padding: 0 10px 8px;
    color: var(--text-primary, #2c2c2c);
    font-weight: 600;
    word-break: break-all;
    border-bottom: 1px solid var(--btn-border, #b5b0a6);
    margin-bottom: 6px;
  }
  .kathalu-menu-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .kathalu-menu-item:hover { background: var(--btn-hover-bg, rgba(0,0,0,0.05)); }
  a.kathalu-menu-item { text-decoration: none; }
  .kathalu-menu-item.kathalu-danger { color: var(--accent, #b5531a); }

  .kathalu-offline {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--btn-hover-bg, rgba(0,0,0,0.05));
    border: 1px solid var(--btn-border, #b5b0a6);
    color: var(--accent, #b5531a);
    font-size: 0.72rem;
    line-height: 1;
    margin-right: 6px;
    vertical-align: middle;
  }
  .kathalu-offline::before {
    content: "";
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--accent, #b5531a);
  }

  .kathalu-sync-dot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px; height: 18px;
    margin-right: 4px;
    vertical-align: middle;
    color: var(--text-tertiary, #888);
    font-size: 0.75rem;
    line-height: 1;
  }
  .kathalu-sync-dot[data-state="idle"] { display: none; }
  .kathalu-sync-dot[data-state="syncing"] { color: var(--accent-gold, #c8a96e); }
  .kathalu-sync-dot[data-state="synced"]  { color: var(--accent-green, #6b8f3a); }
  .kathalu-sync-dot[data-state="error"]   { color: var(--accent, #b5531a); }
  .kathalu-sync-dot[data-state="syncing"] svg { animation: kathalu-spin 1s linear infinite; }

  @keyframes kathalu-spin { to { transform: rotate(360deg); } }

  .kathalu-spinner {
    display: inline-block;
    width: 14px; height: 14px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    vertical-align: -2px;
    margin-right: 6px;
    animation: kathalu-spin 0.7s linear infinite;
  }

  .kathalu-modal-back {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
  }
  .kathalu-modal {
    background: var(--page-bg, #f5f0e6);
    color: var(--text-primary, #2c2c2c);
    padding: 24px;
    border-radius: 12px;
    width: min(360px, calc(100vw - 32px));
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  }
  .kathalu-modal h2 { margin: 0 0 16px; font-size: 1.2rem; }
  .kathalu-modal label { display: block; font-size: 0.8rem; margin-top: 10px; color: var(--text-secondary,#555); }
  .kathalu-modal input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--btn-border, #b5b0a6);
    border-radius: 6px;
    margin-top: 4px;
    background: var(--bg, #fff);
    color: inherit;
    font: inherit;
  }
  .kathalu-modal .kathalu-row { display: flex; gap: 8px; margin-top: 18px; }
  .kathalu-modal button {
    flex: 1;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid var(--btn-border, #b5b0a6);
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
  }
  .kathalu-modal button.kathalu-primary {
    background: var(--accent, #b5531a);
    border-color: var(--accent, #b5531a);
    color: #fff;
  }
  .kathalu-modal button:hover { opacity: 0.9; }
  .kathalu-tab { display: flex; border-bottom: 1px solid var(--btn-border, #b5b0a6); margin-bottom: 8px; }
  .kathalu-tab button {
    flex: 1; border: none; background: transparent; padding: 8px;
    color: var(--text-secondary, #555); border-bottom: 2px solid transparent;
  }
  .kathalu-tab button.active { color: var(--accent, #b5531a); border-color: var(--accent, #b5531a); }
  .kathalu-err { color: #b5531a; font-size: 0.8rem; margin-top: 10px; min-height: 1em; }
  .kathalu-hint { font-size: 0.75rem; color: var(--text-muted,#888); margin-top: 6px; }
`;

function ensureStyle() {
  if (document.getElementById("kathalu-auth-style")) return;
  const tag = document.createElement("style");
  tag.id = "kathalu-auth-style";
  tag.textContent = STYLE;
  document.head.appendChild(tag);
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of children) el.append(c);
  return el;
}

function friendlyAuthError(ex, mode) {
  const raw = (ex?.message || String(ex) || "").toLowerCase();
  if (raw.includes("user already registered") || raw.includes("already exists")) {
    return "That username is taken — try signing in or pick another.";
  }
  if (raw.includes("invalid login credentials") || raw.includes("invalid_grant")) {
    return "Wrong username or password.";
  }
  if (raw.includes("password should be at least")) {
    return "Password must be at least 6 characters.";
  }
  if (raw.includes("rate limit") || raw.includes("too many requests")) {
    return "Too many attempts — wait a minute and try again.";
  }
  if (raw.includes("failed to fetch") || raw.includes("network") || raw.includes("err_network")) {
    return "Can't reach server — check your connection.";
  }
  if (raw.startsWith("api 5")) {
    return "Server error — please try again.";
  }
  return mode === "signup"
    ? "Couldn't create your account. " + (ex?.message || "")
    : "Couldn't sign you in. " + (ex?.message || "");
}

function openModal() {
  let mode = "signin";
  const err = h("div", { class: "kathalu-err" });
  const usernameInput = h("input", { type: "text", autocomplete: "username", required: "" });
  const passwordInput = h("input", { type: "password", autocomplete: "current-password", required: "" });

  const signInBtn = h("button", { type: "button", class: "active", onclick: () => setMode("signin") }, "Sign in");
  const signUpBtn = h("button", { type: "button", onclick: () => setMode("signup") }, "Sign up");

  const submit = h("button", { type: "submit", class: "kathalu-primary" }, "Sign in");
  const cancel = h("button", { type: "button", onclick: close }, "Cancel");

  function setMode(m) {
    mode = m;
    signInBtn.className = m === "signin" ? "active" : "";
    signUpBtn.className = m === "signup" ? "active" : "";
    submit.textContent = m === "signin" ? "Sign in" : "Create account";
    err.textContent = "";
  }

  function setBusy(busy) {
    submit.disabled = busy;
    cancel.disabled = busy;
    usernameInput.disabled = busy;
    passwordInput.disabled = busy;
    signInBtn.disabled = busy;
    signUpBtn.disabled = busy;
    submit.innerHTML = "";
    if (busy) {
      submit.appendChild(h("span", { class: "kathalu-spinner", "aria-hidden": "true" }));
      submit.append(mode === "signin" ? "Signing in…" : "Creating account…");
    } else {
      submit.append(mode === "signin" ? "Sign in" : "Create account");
    }
  }

  const form = h(
    "form",
    {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = "";
        setBusy(true);
        try {
          const u = usernameInput.value.trim();
          const p = passwordInput.value;
          if (u.length < 2) throw new Error("Username too short");
          if (p.length < 6) throw new Error("Password must be 6+ chars");
          if (mode === "signin") {
            await signIn(u, p);
          } else {
            await signUp(u, p);
          }
          await importLocalIfFirstLogin().catch(() => null);
          close();
        } catch (ex) {
          err.textContent = friendlyAuthError(ex, mode);
        } finally {
          setBusy(false);
        }
      },
    },
    h("h2", {}, "Welcome to Kathalu"),
    h("div", { class: "kathalu-tab" }, signInBtn, signUpBtn),
    h("label", {}, "Username", usernameInput),
    h("label", {}, "Password", passwordInput),
    h("div", { class: "kathalu-hint" }, "Optional. Your progress syncs across devices when signed in."),
    err,
    h("div", { class: "kathalu-row" }, cancel, submit)
  );

  const back = h("div", { class: "kathalu-modal-back", onclick: (e) => { if (e.target === back) close(); } },
    h("div", { class: "kathalu-modal" }, form)
  );

  function close() {
    back.remove();
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey);
  document.body.appendChild(back);
  setTimeout(() => usernameInput.focus(), 0);
}

function openAccountMenu(anchor, name, onSignOut) {
  const userRow = h("div", { class: "kathalu-menu-user" }, name);
  const settingsLink = h(
    "a",
    {
      href: "account.html",
      class: "kathalu-menu-item",
      role: "menuitem",
    },
    "Account settings"
  );
  const signOutBtn = h(
    "button",
    {
      type: "button",
      class: "kathalu-menu-item kathalu-danger",
      onclick: () => { close(); onSignOut(); },
    },
    "Sign out"
  );
  const menu = h(
    "div",
    { class: "kathalu-menu", role: "menu" },
    h("div", { class: "kathalu-menu-label" }, "Signed in as"),
    userRow,
    settingsLink,
    signOutBtn
  );

  function close() {
    menu.remove();
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("mousedown", onDocClick, true);
    anchor.setAttribute("aria-expanded", "false");
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  function onDocClick(e) {
    if (!menu.contains(e.target) && e.target !== anchor) close();
  }

  anchor.parentElement.appendChild(menu);
  anchor.setAttribute("aria-expanded", "true");
  document.addEventListener("keydown", onKey);
  document.addEventListener("mousedown", onDocClick, true);
  setTimeout(() => signOutBtn.focus(), 0);
}

export async function mountAuthUI(container) {
  ensureStyle();
  const slot = container || document.getElementById("authSlot");
  if (!slot) return;

  function syncDotEl(state) {
    const labels = {
      idle: "",
      syncing: "Syncing…",
      synced: "All changes saved",
      error: "Sync failed — will retry",
    };
    const glyphs = {
      syncing: "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round'><path d='M21 12a9 9 0 1 1-3-6.7'/><polyline points='21 4 21 9 16 9'/></svg>",
      synced:  "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='4 12 10 18 20 6'/></svg>",
      error:   "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round'><path d='M12 3 1 21h22Z'/><line x1='12' y1='10' x2='12' y2='14'/><line x1='12' y1='17' x2='12' y2='17.5'/></svg>",
    };
    const el = h("span", {
      class: "kathalu-sync-dot",
      "data-state": state,
      title: labels[state] || "",
      "aria-label": labels[state] || "",
    });
    el.innerHTML = glyphs[state] || "";
    return el;
  }

  async function render() {
    slot.innerHTML = "";
    const wrap = h("span", { class: "kathalu-auth-wrap" });
    slot.appendChild(wrap);

    const signed = await isSignedIn();

    if (signed) {
      wrap.appendChild(syncDotEl(getSyncStatus()));
    }
    if (signed && !isOnline()) {
      wrap.appendChild(h("span", { class: "kathalu-offline", title: "Working offline — changes saved locally" }, "Offline"));
    }

    if (signed) {
      const user = await currentUser();
      const name = user?.user_metadata?.username || "account";
      const initial = (name[0] || "?").toUpperCase();
      const avatar = h(
        "button",
        {
          type: "button",
          class: "kathalu-avatar",
          title: `Signed in as ${name}`,
          "aria-label": `Account menu for ${name}`,
          "aria-haspopup": "menu",
          "aria-expanded": "false",
          onclick: (e) => {
            e.stopPropagation();
            if (wrap.querySelector(".kathalu-menu")) return;
            openAccountMenu(avatar, name, async () => {
              await signOut();
            });
          },
        },
        initial
      );
      wrap.appendChild(avatar);
    } else {
      const chip = h(
        "button",
        { type: "button", class: "kathalu-auth-chip", onclick: openModal },
        "Sign in"
      );
      wrap.appendChild(chip);
    }
  }
  await render();

  // Re-render the chip whenever auth state flips so we don't need full reloads.
  sb.auth.onAuthStateChange(() => { render(); });
  // Also re-render when the connection status flips, to show/hide "Offline".
  onStatusChange(() => { render(); });
  // Update only the sync dot — avoid full re-render on every write.
  onSyncStatus((state) => {
    const dot = slot.querySelector(".kathalu-sync-dot");
    if (!dot) return;
    const fresh = syncDotEl(state);
    dot.replaceWith(fresh);
  });

  try {
    if (await isSignedIn()) await importLocalIfFirstLogin();
  } catch {}
}
