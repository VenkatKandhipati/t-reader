// Lightweight toast + connection-status broadcaster.
// - showToast(msg, kind?) drops a transient message in the corner.
// - setOnlineStatus(online) tracks whether authed API calls are reaching
//   the server. Other modules listen via window.addEventListener
//   ("kathalu:online-status", e => e.detail.online).

const STYLE = `
  .kathalu-toast-wrap {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 10001;
    pointer-events: none;
  }
  .kathalu-toast {
    pointer-events: auto;
    background: var(--page-bg, #f5f0e6);
    color: var(--text-primary, #2c2c2c);
    border: 1px solid var(--btn-border, #b5b0a6);
    border-left: 3px solid var(--accent, #b5531a);
    border-radius: 8px;
    padding: 10px 14px;
    font: inherit;
    font-size: 0.85rem;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    max-width: 360px;
    opacity: 0;
    transition: opacity 160ms ease, transform 160ms ease;
    transform: translateY(-4px);
  }
  .kathalu-toast.kathalu-toast--show {
    opacity: 1;
    transform: translateY(0);
  }
  .kathalu-toast--info { border-left-color: var(--accent-gold, #c8a96e); }
  .kathalu-toast--warn { border-left-color: var(--accent, #b5531a); }
  .kathalu-toast--ok   { border-left-color: var(--accent-green, #6b8f3a); }
`;

let _container = null;
let _online = true;
let _sync = "idle"; // idle | syncing | synced | error
let _syncedTimer = null;
const STATUS_EVENT = "kathalu:online-status";
const SYNC_EVENT = "kathalu:sync-status";

function ensureStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById("kathalu-notify-style")) return;
  const tag = document.createElement("style");
  tag.id = "kathalu-notify-style";
  tag.textContent = STYLE;
  document.head.appendChild(tag);
}

function ensureContainer() {
  if (typeof document === "undefined") return null;
  ensureStyle();
  if (_container && document.body.contains(_container)) return _container;
  _container = document.createElement("div");
  _container.className = "kathalu-toast-wrap";
  _container.setAttribute("role", "status");
  _container.setAttribute("aria-live", "polite");
  document.body.appendChild(_container);
  return _container;
}

export function showToast(message, kind = "warn", durationMs = 4000) {
  const root = ensureContainer();
  if (!root) return;
  const el = document.createElement("div");
  el.className = `kathalu-toast kathalu-toast--${kind}`;
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("kathalu-toast--show"));
  setTimeout(() => {
    el.classList.remove("kathalu-toast--show");
    setTimeout(() => el.remove(), 200);
  }, durationMs);
}

export function setOnlineStatus(online) {
  if (online === _online) return;
  _online = online;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(STATUS_EVENT, { detail: { online } })
    );
  }
  if (!online) {
    showToast("Connection lost — working offline. Changes saved locally.", "warn", 5000);
  } else {
    showToast("Back online — syncing…", "ok", 2500);
  }
}

export function isOnline() {
  return _online;
}

export function onStatusChange(handler) {
  if (typeof window === "undefined") return () => {};
  const wrapped = (e) => handler(e.detail.online);
  window.addEventListener(STATUS_EVENT, wrapped);
  return () => window.removeEventListener(STATUS_EVENT, wrapped);
}

export function setSyncStatus(state) {
  if (state === _sync) return;
  _sync = state;
  if (_syncedTimer) {
    clearTimeout(_syncedTimer);
    _syncedTimer = null;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { state } }));
  }
  // Auto-fade "synced" back to idle so the dot doesn't sit there forever.
  if (state === "synced") {
    _syncedTimer = setTimeout(() => setSyncStatus("idle"), 2500);
  }
}

export function getSyncStatus() {
  return _sync;
}

export function onSyncStatus(handler) {
  if (typeof window === "undefined") return () => {};
  const wrapped = (e) => handler(e.detail.state);
  window.addEventListener(SYNC_EVENT, wrapped);
  return () => window.removeEventListener(SYNC_EVENT, wrapped);
}
