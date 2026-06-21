// ════════════════════════════════════════════════════════════════
// TackT — Templates (first Pro feature)
//
// Save a focused set of moves (e.g. "Push Day") and one-tap apply it to
// filter the Log grid to just those moves. Gated behind Pro.gate('templates').
//
// Self-contained like pro.js: injects its own sheet + active chip, wires its
// own button, and reads app.js globals (STATE, sortedExercises, renderGrid,
// toast) by bare name. The ONLY app.js touch is a 1-line filter in renderGrid
// that honors window.TPL_FILTER.
// ════════════════════════════════════════════════════════════════
window.Templates = (function () {
  const $ = (id) => document.getElementById(id);
  const sb = () => window.SB;
  let TPL = [];            // [{id, name, abbrs:[...]}]
  let activeId = null;

  // ── data ──────────────────────────────────────────────────────
  async function load() {
    try {
      const { data, error } = await sb().from("wo_templates")
        .select("id,name,abbrs").order("created_at", { ascending: true });
      if (error) throw error;
      TPL = (data || []).map((t) => ({ ...t, abbrs: Array.isArray(t.abbrs) ? t.abbrs : [] }));
      localStorage.setItem("wo_templates_cache", JSON.stringify(TPL));
    } catch (e) {
      try { TPL = JSON.parse(localStorage.getItem("wo_templates_cache")) || []; } catch (_) { TPL = []; }
    }
  }

  async function save(name, abbrs) {
    let uid = null;
    try { uid = (await sb().auth.getUser()).data.user?.id || null; } catch (e) {}
    const row = { user_id: uid, name, abbrs };
    try {
      const { data, error } = await sb().from("wo_templates").insert(row).select().single();
      if (error) throw error;
      TPL.push({ id: data.id, name: data.name, abbrs: data.abbrs || [] });
    } catch (e) {
      if (window.toast) window.toast("Couldn't save — check your connection.", true);
      return false;
    }
    localStorage.setItem("wo_templates_cache", JSON.stringify(TPL));
    return true;
  }

  async function remove(id) {
    TPL = TPL.filter((t) => t.id !== id);
    localStorage.setItem("wo_templates_cache", JSON.stringify(TPL));
    if (activeId === id) clearFilter();
    try { await sb().from("wo_templates").delete().eq("id", id); } catch (e) {}
  }

  // ── grid filter ───────────────────────────────────────────────
  function applyTemplate(t) {
    window.TPL_FILTER = new Set(t.abbrs);
    activeId = t.id;
    if (typeof renderGrid === "function") renderGrid();
    showChip(t.name);
    closeSheet();
    if (window.toast) window.toast(`Showing “${t.name}” — ${t.abbrs.length} moves`);
  }
  function clearFilter() {
    window.TPL_FILTER = null;
    activeId = null;
    if (typeof renderGrid === "function") renderGrid();
    hideChip();
  }

  // ── active chip (sits above the grid) ─────────────────────────
  function ensureChip() {
    if ($("tpl-active")) return;
    const grid = $("ex-grid");
    if (!grid) return;
    const chip = document.createElement("div");
    chip.id = "tpl-active";
    chip.className = "tpl-active-chip hidden";
    chip.innerHTML = `<span class="tpl-active-name" id="tpl-active-name"></span>
      <button id="tpl-clear" class="tpl-clear">Show all ✕</button>`;
    grid.parentNode.insertBefore(chip, grid);
    $("tpl-clear").addEventListener("click", clearFilter);
  }
  function showChip(name) { ensureChip(); const c = $("tpl-active"); if (c) { $("tpl-active-name").textContent = "▤ " + name; c.classList.remove("hidden"); } }
  function hideChip() { const c = $("tpl-active"); if (c) c.classList.add("hidden"); }

  // ── sheet ─────────────────────────────────────────────────────
  function ensureSheet() {
    if ($("tpl-sheet")) return;
    const wrap = document.createElement("div");
    wrap.id = "tpl-sheet";
    wrap.className = "sheet-wrap hidden";
    wrap.innerHTML = `
      <div class="sheet-backdrop" data-tpl-close></div>
      <div class="sheet tpl-sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <h2>Templates <span class="pro-tag">◆ PRO</span></h2>
          <button class="iconbtn" data-tpl-close>✕</button>
        </div>
        <p class="tpl-intro">Save a focused set of moves — like “Push Day” — and tap it to filter your log to just those.</p>
        <div id="tpl-list" class="tpl-list"></div>
        <details class="extras tpl-new">
          <summary>+ New template</summary>
          <input id="tpl-name" class="ax-in" placeholder="Name (e.g. Push Day)" maxlength="40" />
          <div class="tpl-pick-lbl">Pick the moves:</div>
          <div id="tpl-picker" class="tpl-picker"></div>
          <button id="tpl-save" class="btn btn-primary btn-sm" style="margin:12px auto 0">Save template</button>
        </details>
      </div>`;
    document.body.appendChild(wrap);
    wrap.querySelectorAll("[data-tpl-close]").forEach((b) => b.addEventListener("click", closeSheet));
    $("tpl-save").addEventListener("click", onSave);
  }
  function closeSheet() { const s = $("tpl-sheet"); if (s) s.classList.add("hidden"); }

  function renderSheet() {
    // saved templates
    const list = $("tpl-list");
    list.innerHTML = TPL.length
      ? TPL.map((t) => `
        <div class="tpl-item${t.id === activeId ? " on" : ""}">
          <button class="tpl-apply" data-id="${t.id}">
            <b>${esc(t.name)}</b><span>${t.abbrs.length} move${t.abbrs.length === 1 ? "" : "s"}</span>
          </button>
          <button class="tpl-del" data-id="${t.id}" title="Delete">🗑</button>
        </div>`).join("")
      : `<div class="tpl-empty">No templates yet — make your first one below.</div>`;
    list.querySelectorAll(".tpl-apply").forEach((b) =>
      b.addEventListener("click", () => { const t = TPL.find((x) => x.id === b.dataset.id); if (t) applyTemplate(t); }));
    list.querySelectorAll(".tpl-del").forEach((b) =>
      b.addEventListener("click", async () => { if (confirm("Delete this template? Your logs are untouched.")) { await remove(b.dataset.id); renderSheet(); } }));

    // move picker (from the dictionary)
    const moves = (typeof sortedExercises === "function") ? sortedExercises() : (window.STATE?.exercises || []);
    $("tpl-picker").innerHTML = moves.map((e) => `
      <label class="tpl-pick">
        <input type="checkbox" value="${esc(e.abbr)}" />
        <span class="tpl-pick-name">${esc(e.name)}</span><span class="tpl-pick-ab">${esc(e.abbr)}</span>
      </label>`).join("");
  }

  async function onSave() {
    const name = ($("tpl-name").value || "").trim();
    if (!name) return window.toast && window.toast("Name your template first.", true);
    const abbrs = [...$("tpl-picker").querySelectorAll("input:checked")].map((i) => i.value);
    if (!abbrs.length) return window.toast && window.toast("Pick at least one move.", true);
    const btn = $("tpl-save"); btn.disabled = true; btn.textContent = "Saving…";
    const ok = await save(name, abbrs);
    btn.disabled = false; btn.textContent = "Save template";
    if (ok) { $("tpl-name").value = ""; renderSheet(); if (window.toast) window.toast(`Saved “${name}” ✓`); }
  }

  // ── entry point (gated) ───────────────────────────────────────
  async function open() {
    if (!window.Pro || !Pro.gate("templates")) return; // free → paywall, pro → proceed
    ensureSheet();
    await load();
    renderSheet();
    $("tpl-sheet").classList.remove("hidden");
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function init() {
    const btn = $("btn-templates");
    if (btn) btn.addEventListener("click", open);
    ensureChip();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { open, applyTemplate, clearFilter };
})();
