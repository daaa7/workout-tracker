// ════════════════════════════════════════════════════════════════
// TackT Pro — entitlement + gating framework (scaffold)
//
// Reuses the shared `SB` client and `toast()` from app.js. Self-driving:
// loads the user's entitlement on every auth change and exposes a small API.
//
// THE PROMISE: Pro gates NET-NEW features ONLY. Anything shipped today stays
// free forever. So this framework is INERT until a brand-new feature opts in
// by calling Pro.gate('<key>'). It never touches existing screens.
//
//   if (!Pro.gate('templates')) return;   // ← guard a net-new Pro feature
//   Pro.isPro()                           // → bool
//   Pro.has('templates')                  // → bool (free features always true)
//   document.dispatchEvent → 'tackt:pro-change' fires when tier loads/changes
// ════════════════════════════════════════════════════════════════
window.Pro = (function () {
  // ── Feature registry ──────────────────────────────────────────
  // pro:true  → requires Pro.  pro:false → free forever (NEVER gate these).
  const FEATURES = {
    // Net-new, behind Pro:
    templates: { name: "Templates & weekly plans", pro: true, built: false,
                 blurb: "Save routines and one-tap log a planned day." },
    plans:     { name: "Guided Plans", pro: true, built: true,
                 blurb: "Follow proven multi-week programs — like the BJJ comeback plan — that load onto your Log in a tap. (Level 1 is free.)" },

    // Shipped today — listed so the rule is explicit. Do NOT gate:
    year_heatmap: { name: "Year heatmap",      pro: false, freeForever: true },
    records:      { name: "Personal records",  pro: false, freeForever: true },
    stats:        { name: "Stats & momentum",  pro: false, freeForever: true },
  };

  const state = { ready: false, tier: "free", status: "active", expires: null };

  function isPro() {
    if (state.tier !== "pro" || state.status !== "active") return false;
    if (state.expires && new Date(state.expires) < new Date()) return false;
    return true;
  }

  // Free features → always available. Pro features → only when isPro().
  function has(key) {
    const f = FEATURES[key];
    if (!f || !f.pro) return true;
    return isPro();
  }

  // Guard a Pro feature. Returns true if allowed; otherwise opens the
  // paywall and returns false. Use: if (!Pro.gate('templates')) return;
  function gate(key) {
    if (has(key)) return true;
    showPaywall(key);
    return false;
  }

  // ── Entitlement loading ───────────────────────────────────────
  const cacheKey = (uid) => "wo_pro_" + uid;
  function readCache(uid) { try { return JSON.parse(localStorage.getItem(cacheKey(uid))); } catch (e) { return null; } }
  function writeCache(uid, d) { try { localStorage.setItem(cacheKey(uid), JSON.stringify({ tier: d.tier, status: d.status, expires_at: d.expires_at })); } catch (e) {} }

  async function load() {
    const sb = window.SB;
    let uid = null;
    // getSession reads from local storage — instant + offline-safe (getUser hits the network).
    try { uid = (await sb.auth.getSession()).data.session?.user?.id || null; } catch (e) {}
    if (!sb || !uid) { setTier("free", "active", null); state.ready = true; return; }
    // Paint instantly from the last known tier so the PRO mark shows on cold start.
    const cached = readCache(uid);
    if (cached) setTier(cached.tier, cached.status, cached.expires_at);
    // Then refresh from the server.
    try {
      const { data, error } = await sb.from("wo_entitlements")
        .select("tier,status,expires_at").eq("user_id", uid).maybeSingle();
      if (error) throw error;
      const row = data || { tier: "free", status: "active", expires_at: null };
      setTier(row.tier, row.status, row.expires_at);
      writeCache(uid, row);
    } catch (e) {
      // offline / table missing → keep the cached value (or default free if none).
      if (!cached) setTier("free", "active", null);
    }
    state.ready = true;
  }

  function setTier(tier, status, expires) {
    const changed = tier !== state.tier || status !== state.status;
    state.tier = tier || "free";
    state.status = status || "active";
    state.expires = expires || null;
    document.body.classList.toggle("is-pro", isPro());
    if (changed) document.dispatchEvent(new CustomEvent("tackt:pro-change", { detail: { pro: isPro() } }));
  }

  // ── Paywall sheet (self-injected, matches the app's bottom-sheet) ──
  function ensureSheet() {
    if (document.getElementById("paywall")) return;
    const wrap = document.createElement("div");
    wrap.id = "paywall";
    wrap.className = "sheet-wrap hidden";
    wrap.innerHTML = `
      <div class="sheet-backdrop" data-pw-close></div>
      <div class="sheet paywall-sheet">
        <div class="sheet-handle"></div>
        <div class="pw-badge">◆ TackT <b>PRO</b></div>
        <h2 id="pw-title" class="pw-title">Unlock this with Pro</h2>
        <p id="pw-blurb" class="pw-blurb"></p>
        <p class="pw-promise">Everything you use today stays free — Pro only adds extras.</p>
        <button id="pw-cta" class="btn btn-primary">Get Pro</button>
        <button data-pw-close class="btn btn-ghost">Not now</button>
      </div>`;
    document.body.appendChild(wrap);
    wrap.querySelectorAll("[data-pw-close]").forEach((b) => b.addEventListener("click", hidePaywall));
    document.getElementById("pw-cta").addEventListener("click", onCta);
  }

  let activeFeature = null;

  function showPaywall(key) {
    ensureSheet();
    activeFeature = key;
    const f = FEATURES[key] || {};
    document.getElementById("pw-title").textContent = f.name ? `Unlock ${f.name}` : "Unlock this with Pro";
    document.getElementById("pw-blurb").textContent = f.blurb || "A little extra, for when you want more.";
    document.getElementById("paywall").classList.remove("hidden");
  }
  function hidePaywall() {
    const el = document.getElementById("paywall");
    if (el) el.classList.add("hidden");
  }

  async function onCta() {
    let uid = null, email = null;
    try { const u = (await window.SB.auth.getUser()).data.user; uid = u?.id; email = u?.email; } catch (e) {}
    const launched = await window.TacktCheckout?.start({ userId: uid, email, feature: activeFeature });
    if (launched) return;                  // handed off to Stripe
    await registerInterest(uid);           // not wired yet → capture demand
  }

  // Log "I'd pay for this" so demand is visible before payments exist.
  async function registerInterest(uid) {
    try {
      if (window.SB && uid)
        await window.SB.from("wo_pro_interest").insert({ user_id: uid, feature: activeFeature });
    } catch (e) {}
    hidePaywall();
    if (window.toast) window.toast("Pro isn't live yet — we saved your spot. You'll be first to know. 💪");
  }

  // Re-load entitlement whenever auth changes (sign in / out / refresh).
  function init() {
    ensureSheet();
    if (window.SB?.auth?.onAuthStateChange) {
      window.SB.auth.onAuthStateChange(() => load());
    }
    load();
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();

  return { FEATURES, isPro, has, gate, showPaywall, hidePaywall, reload: load,
           get tier() { return state.tier; }, get ready() { return state.ready; } };
})();
