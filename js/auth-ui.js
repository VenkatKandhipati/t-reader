// Minimal login/signup modal + account chip. Append once per page:
//   import { mountAuthUI } from "./js/auth-ui.js";
//   mountAuthUI();

import {
  currentUser,
  importLocalIfFirstLogin,
  isSignedIn,
  signIn,
  signOut,
  signUp,
} from "./storage.js";

const STYLE = `
  .kathalu-auth-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border: 1px solid var(--btn-border, #b5b0a6);
    border-radius: 999px;
    background: transparent;
    cursor: pointer;
    font: inherit;
    color: var(--text-primary, #2c2c2c);
    font-size: 0.85rem;
  }
  .kathalu-auth-chip:hover { background: var(--btn-hover-bg, rgba(0,0,0,0.05)); }

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

  const form = h(
    "form",
    {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = "";
        submit.disabled = true;
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
          window.location.reload();
        } catch (ex) {
          err.textContent = ex.message || String(ex);
        } finally {
          submit.disabled = false;
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

export async function mountAuthUI(container) {
  ensureStyle();
  const slot = container || document.getElementById("authSlot");
  if (!slot) return;

  async function render() {
    slot.innerHTML = "";
    const signed = await isSignedIn();
    if (signed) {
      const user = await currentUser();
      const name = user?.user_metadata?.username || "account";
      const chip = h(
        "button",
        {
          class: "kathalu-auth-chip",
          title: "Sign out",
          onclick: async () => {
            await signOut();
            await render();
            window.location.reload();
          },
        },
        `${name} · sign out`
      );
      slot.appendChild(chip);
    } else {
      const chip = h(
        "button",
        { class: "kathalu-auth-chip", onclick: openModal },
        "Sign in"
      );
      slot.appendChild(chip);
    }
  }
  await render();

  try {
    if (await isSignedIn()) await importLocalIfFirstLogin();
  } catch {}
}
