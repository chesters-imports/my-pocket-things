/* My Pocket Chapbook · CO.MYPT-001-CHAPS */
(() => {
  "use strict";

  /** @type {any} */
  let lib = null;
  let saveTimer = null;
  let view = "pool";
  let openBookId = null;
  let openPoemId = null;
  let pickSectionId = null;
  let dragPoemId = null;
  let dragFromSectionId = null;

  const $ = (id) => document.getElementById(id);

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.hidden = true;
    }, 1400);
  }

  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function nextChip() {
    const n = lib.poem_seq || 1;
    lib.poem_seq = n + 1;
    return `MYPT-P-${String(n).padStart(5, "0")}`;
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function todayYMD() {
    return new Date().toISOString().slice(0, 10);
  }

  async function load() {
    const r = await fetch("/api/library", { cache: "no-store" });
    if (!r.ok) throw new Error("load failed");
    lib = await r.json();
    if (!lib.poems) lib.poems = [];
    if (!lib.chapbooks) lib.chapbooks = [];
    if (!lib.poem_seq) lib.poem_seq = 1;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }

  async function saveNow() {
    try {
      const r = await fetch("/api/library", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lib),
      });
      if (!r.ok) throw new Error("save failed");
      toast("saved");
    } catch (e) {
      console.error(e);
      toast("save error");
    }
  }

  function poemById(id) {
    return (lib.poems || []).find((p) => p.id === id);
  }

  function bookById(id) {
    return (lib.chapbooks || []).find((b) => b.id === id);
  }

  function setView(name) {
    view = name;
    $("viewPool").hidden = name !== "pool";
    $("viewBooks").hidden = name !== "books";
    $("viewEditor").hidden = name !== "editor";
    $("tabPool").classList.toggle("is-on", name === "pool");
    $("tabBooks").classList.toggle("is-on", name === "books");
    $("tabEditor").hidden = name !== "editor";
    $("tabEditor").classList.toggle("is-on", name === "editor");
    render();
  }

  function preview(text, n) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (t.length <= n) return t;
    return t.slice(0, n) + "…";
  }

  /* ── pool ─────────────────────────────────────────────── */
  function renderPool() {
    const q = ($("poolSearch").value || "").trim().toLowerCase();
    const showArch = $("poolShowArchived").checked;
    const list = $("poolList");
    list.innerHTML = "";
    let poems = (lib.poems || []).slice();
    if (!showArch) poems = poems.filter((p) => !p.archived);
    if (q) {
      poems = poems.filter((p) => {
        const blob = [
          p.title,
          p.author,
          p.chip,
          p.body,
          (p.tags || []).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      });
    }
    poems.sort((a, b) =>
      String(a.title || "").localeCompare(String(b.title || ""))
    );
    if (!poems.length) {
      list.innerHTML =
        '<div class="pc-empty">no poems yet · + POEM · or import later by hand</div>';
      return;
    }
    poems.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pc-poem-row" + (p.archived ? " is-archived" : "");
      const tags = (p.tags || []).join(" · ");
      btn.innerHTML = `<span class="pc-poem-id"></span><span><div class="pc-poem-name"></div><div class="pc-poem-sub"></div></span><span class="pc-poem-tags"></span>`;
      btn.querySelector(".pc-poem-id").textContent = p.chip || p.id;
      btn.querySelector(".pc-poem-name").textContent = p.title || "(untitled)";
      btn.querySelector(".pc-poem-sub").textContent = [
        p.author || "—",
        p.created ? p.created.slice(0, 10) : "",
        p.archived ? "archived" : "",
      ]
        .filter(Boolean)
        .join(" · ");
      btn.querySelector(".pc-poem-tags").textContent = tags;
      btn.addEventListener("click", () => openPoemModal(p.id));
      list.appendChild(btn);
    });
  }

  function newPoem() {
    const id = uid("poem");
    const chip = nextChip();
    const p = {
      id,
      chip,
      title: "",
      body: "",
      author: "operator",
      tags: [],
      notes: "",
      created: todayYMD(),
      updated: nowISO(),
      archived: false,
      revs: [],
    };
    lib.poems.push(p);
    scheduleSave();
    openPoemModal(id);
  }

  function openPoemModal(id) {
    const p = poemById(id);
    if (!p) return;
    openPoemId = id;
    $("poemChip").textContent = p.chip || id;
    $("poemTitle").value = p.title || "";
    $("poemAuthor").value = p.author || "";
    $("poemCreated").value = (p.created || "").slice(0, 10);
    $("poemTags").value = (p.tags || []).join(", ");
    $("poemBody").value = p.body || "";
    $("poemMeta").textContent = p.updated
      ? `updated ${p.updated.slice(0, 19)} · revs ${(p.revs || []).length}`
      : "";
    $("poemArchive").hidden = !!p.archived;
    $("poemUnarchive").hidden = !p.archived;
    $("poemModal").hidden = false;
  }

  function closePoemModal() {
    $("poemModal").hidden = true;
    openPoemId = null;
  }

  function savePoemModal() {
    const p = poemById(openPoemId);
    if (!p) return;
    const next = {
      title: $("poemTitle").value,
      body: $("poemBody").value,
      author: $("poemAuthor").value.trim() || "operator",
      tags: $("poemTags")
        .value.split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      created: $("poemCreated").value.trim() || p.created || todayYMD(),
    };
    // rev history
    if (!p.revs) p.revs = [];
    if (
      p.title !== next.title ||
      p.body !== next.body ||
      p.author !== next.author
    ) {
      p.revs.push({
        at: nowISO(),
        title: p.title,
        body: p.body,
        author: p.author,
      });
      if (p.revs.length > 40) p.revs = p.revs.slice(-40);
    }
    Object.assign(p, next);
    p.updated = nowISO();
    scheduleSave();
    closePoemModal();
    render();
    toast("poem saved");
  }

  /* ── books list ───────────────────────────────────────── */
  function renderBooks() {
    const list = $("bookList");
    list.innerHTML = "";
    const books = lib.chapbooks || [];
    if (!books.length) {
      list.innerHTML = '<div class="pc-empty">no chapbooks · + CHAPBOOK</div>';
      return;
    }
    books.forEach((b) => {
      const n = (b.sections || []).reduce(
        (a, s) => a + (s.poem_ids || []).length,
        0
      );
      const secs = (b.sections || []).length;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pc-book-card";
      btn.innerHTML = `<div class="pc-book-card-title"></div><div class="pc-book-card-meta"></div>`;
      btn.querySelector(".pc-book-card-title").textContent = b.title || "(book)";
      const st = b.status === "complete" ? "complete" : "in progress";
      const stClass =
        b.status === "complete" ? "pc-status-complete" : "pc-status-progress";
      btn.querySelector(".pc-book-card-meta").innerHTML = `<span class="${stClass}">${st}</span> · ${secs} section(s) · ${n} sheet(s)`;
      btn.addEventListener("click", () => openBook(b.id));
      list.appendChild(btn);
    });
  }

  function newBook() {
    const id = uid("chap");
    lib.chapbooks.push({
      id,
      title: "untitled chapbook",
      status: "in_progress",
      notes: "",
      sections: [{ id: uid("sec"), title: "I", poem_ids: [] }],
    });
    scheduleSave();
    openBook(id);
  }

  function openBook(id) {
    openBookId = id;
    setView("editor");
  }

  /* ── editor ───────────────────────────────────────────── */
  function renderEditor() {
    const b = bookById(openBookId);
    if (!b) {
      setView("books");
      return;
    }
    if (!b.sections) b.sections = [{ id: uid("sec"), title: "I", poem_ids: [] }];
    $("bookTitle").value = b.title || "";
    $("bookStatus").value =
      b.status === "complete" ? "complete" : "in_progress";

    const root = $("editorRoot");
    root.innerHTML = "";

    b.sections.forEach((sec, sIdx) => {
      const wrap = document.createElement("div");
      wrap.className = "pc-section";
      wrap.dataset.sectionId = sec.id;

      const head = document.createElement("div");
      head.className = "pc-section-head";
      const titleIn = document.createElement("input");
      titleIn.className = "pc-section-title";
      titleIn.value = sec.title || "";
      titleIn.placeholder = "section title";
      titleIn.addEventListener("change", () => {
        sec.title = titleIn.value;
        scheduleSave();
      });
      head.appendChild(titleIn);

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "pc-btn pc-btn-accent";
      addBtn.textContent = "+ POEM";
      addBtn.addEventListener("click", () => openPick(sec.id));
      head.appendChild(addBtn);

      if (b.sections.length > 1) {
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "pc-btn pc-btn-ghost";
        rm.textContent = "remove section";
        rm.addEventListener("click", () => {
          if (!confirm("Remove section? Poems stay in pool.")) return;
          b.sections = b.sections.filter((s) => s.id !== sec.id);
          scheduleSave();
          renderEditor();
        });
        head.appendChild(rm);
      }
      wrap.appendChild(head);

      const sheets = document.createElement("div");
      sheets.className = "pc-sheets";
      sheets.dataset.sectionId = sec.id;

      // drop on empty area
      sheets.addEventListener("dragover", (ev) => {
        ev.preventDefault();
      });
      sheets.addEventListener("drop", (ev) => {
        ev.preventDefault();
        handleDrop(sec.id, null);
      });

      const ids = sec.poem_ids || [];
      if (!ids.length) {
        const hint = document.createElement("div");
        hint.className = "pc-drop-hint";
        hint.textContent = "empty section · + POEM or drop a sheet here";
        sheets.appendChild(hint);
      } else {
        ids.forEach((pid, i) => {
          const poem = poemById(pid);
          const sheet = document.createElement("div");
          sheet.className = "pc-sheet";
          sheet.draggable = true;
          sheet.dataset.poemId = pid;
          sheet.dataset.sectionId = sec.id;

          sheet.addEventListener("dragstart", (ev) => {
            dragPoemId = pid;
            dragFromSectionId = sec.id;
            sheet.classList.add("is-dragging");
            try {
              ev.dataTransfer.setData("text/plain", pid);
              ev.dataTransfer.effectAllowed = "move";
            } catch (_) {}
          });
          sheet.addEventListener("dragend", () => {
            sheet.classList.remove("is-dragging");
            dragPoemId = null;
            dragFromSectionId = null;
          });
          sheet.addEventListener("dragover", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
          });
          sheet.addEventListener("drop", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            handleDrop(sec.id, pid);
          });

          // pen-friendly pointer reorder: long-press free drag within section
          bindSheetPointerDrag(sheet, sec, pid);

          const num = document.createElement("div");
          num.className = "pc-sheet-num";
          num.textContent = `${sIdx + 1}.${i + 1}`;
          sheet.appendChild(num);

          const x = document.createElement("button");
          x.type = "button";
          x.className = "pc-sheet-x";
          x.textContent = "×";
          x.title = "remove from chapbook";
          x.addEventListener("click", (ev) => {
            ev.stopPropagation();
            sec.poem_ids = (sec.poem_ids || []).filter((id) => id !== pid);
            scheduleSave();
            renderEditor();
          });
          sheet.appendChild(x);

          const t = document.createElement("div");
          t.className = "pc-sheet-title";
          t.textContent = poem ? poem.title || "(untitled)" : "(missing)";
          sheet.appendChild(t);

          const body = document.createElement("div");
          body.className = "pc-sheet-body";
          body.textContent = poem ? poem.body || "" : "";
          sheet.appendChild(body);

          sheet.addEventListener("dblclick", () => {
            if (poem) openPoemModal(poem.id);
          });

          sheets.appendChild(sheet);
        });
      }
      wrap.appendChild(sheets);
      root.appendChild(wrap);
    });
  }

  function handleDrop(toSectionId, beforePoemId) {
    const b = bookById(openBookId);
    if (!b || !dragPoemId) return;
    const poemId = dragPoemId;
    const fromId = dragFromSectionId;

    // remove from all sections first
    (b.sections || []).forEach((s) => {
      s.poem_ids = (s.poem_ids || []).filter((id) => id !== poemId);
    });

    const toSec = (b.sections || []).find((s) => s.id === toSectionId);
    if (!toSec) return;
    if (!toSec.poem_ids) toSec.poem_ids = [];
    if (beforePoemId && toSec.poem_ids.includes(beforePoemId)) {
      const idx = toSec.poem_ids.indexOf(beforePoemId);
      toSec.poem_ids.splice(idx, 0, poemId);
    } else {
      toSec.poem_ids.push(poemId);
    }
    dragPoemId = null;
    dragFromSectionId = null;
    scheduleSave();
    renderEditor();
  }

  /** Pointer drag for Wacom / mouse — reorder within section by horizontal insert */
  function bindSheetPointerDrag(sheet, sec, poemId) {
    let active = null;
    sheet.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest(".pc-sheet-x")) return;
      if (ev.button !== 0 && ev.pointerType === "mouse") return;
      // don't steal double-click open — only drag after move
      active = {
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        moved: false,
      };
    });
    sheet.addEventListener("pointermove", (ev) => {
      if (!active || active.pointerId !== ev.pointerId) return;
      const dx = Math.abs(ev.clientX - active.startX);
      const dy = Math.abs(ev.clientY - active.startY);
      if (!active.moved && dx + dy > 8) {
        active.moved = true;
        dragPoemId = poemId;
        dragFromSectionId = sec.id;
        sheet.classList.add("is-dragging");
        try {
          sheet.setPointerCapture(ev.pointerId);
        } catch (_) {}
      }
    });
    sheet.addEventListener("pointerup", (ev) => {
      if (!active || active.pointerId !== ev.pointerId) return;
      if (active.moved && dragPoemId) {
        // find sheet under point
        sheet.classList.remove("is-dragging");
        sheet.style.visibility = "hidden";
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        sheet.style.visibility = "";
        const targetSheet = el && el.closest(".pc-sheet");
        const targetZone = el && el.closest(".pc-sheets");
        if (targetSheet && targetSheet.dataset.poemId !== poemId) {
          handleDrop(
            targetSheet.dataset.sectionId,
            targetSheet.dataset.poemId
          );
        } else if (targetZone) {
          handleDrop(targetZone.dataset.sectionId, null);
        } else {
          dragPoemId = null;
          dragFromSectionId = null;
          renderEditor();
        }
      }
      active = null;
    });
    sheet.addEventListener("pointercancel", () => {
      sheet.classList.remove("is-dragging");
      active = null;
      dragPoemId = null;
      dragFromSectionId = null;
    });
  }

  function openPick(sectionId) {
    pickSectionId = sectionId;
    const list = $("pickList");
    list.innerHTML = "";
    const poems = (lib.poems || []).filter((p) => !p.archived);
    if (!poems.length) {
      list.innerHTML = '<div class="pc-empty">pool empty · make poems first</div>';
    } else {
      poems
        .slice()
        .sort((a, b) =>
          String(a.title || "").localeCompare(String(b.title || ""))
        )
        .forEach((p) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "pc-pick-item";
          btn.innerHTML = `<span></span><small></small>`;
          btn.querySelector("span").textContent = p.title || "(untitled)";
          btn.querySelector("small").textContent = `${p.chip || ""} · ${
            p.author || ""
          }`;
          btn.addEventListener("click", () => {
            const b = bookById(openBookId);
            const sec = (b.sections || []).find((s) => s.id === pickSectionId);
            if (!sec) return;
            if (!sec.poem_ids) sec.poem_ids = [];
            if (!sec.poem_ids.includes(p.id)) sec.poem_ids.push(p.id);
            scheduleSave();
            $("pickModal").hidden = true;
            renderEditor();
          });
          list.appendChild(btn);
        });
    }
    $("pickModal").hidden = false;
  }

  function render() {
    if (!lib) return;
    if (view === "pool") renderPool();
    else if (view === "books") renderBooks();
    else if (view === "editor") renderEditor();
  }

  async function boot() {
    $("tabPool").addEventListener("click", () => setView("pool"));
    $("tabBooks").addEventListener("click", () => setView("books"));
    $("btnNewPoem").addEventListener("click", newPoem);
    $("btnNewBook").addEventListener("click", newBook);
    $("poolSearch").addEventListener("input", () => renderPool());
    $("poolShowArchived").addEventListener("change", () => renderPool());
    $("poemClose").addEventListener("click", closePoemModal);
    $("poemSave").addEventListener("click", savePoemModal);
    $("poemArchive").addEventListener("click", () => {
      const p = poemById(openPoemId);
      if (!p) return;
      p.archived = true;
      p.updated = nowISO();
      scheduleSave();
      closePoemModal();
      render();
    });
    $("poemUnarchive").addEventListener("click", () => {
      const p = poemById(openPoemId);
      if (!p) return;
      p.archived = false;
      p.updated = nowISO();
      scheduleSave();
      closePoemModal();
      render();
    });
    $("btnBackBooks").addEventListener("click", () => setView("books"));
    $("bookTitle").addEventListener("change", () => {
      const b = bookById(openBookId);
      if (!b) return;
      b.title = $("bookTitle").value;
      scheduleSave();
    });
    $("bookStatus").addEventListener("change", () => {
      const b = bookById(openBookId);
      if (!b) return;
      b.status = $("bookStatus").value;
      scheduleSave();
      toast(b.status);
    });
    $("btnAddSection").addEventListener("click", () => {
      const b = bookById(openBookId);
      if (!b) return;
      if (!b.sections) b.sections = [];
      const n = b.sections.length + 1;
      b.sections.push({
        id: uid("sec"),
        title: String(n),
        poem_ids: [],
      });
      scheduleSave();
      renderEditor();
    });
    $("btnAddFromPool").addEventListener("click", () => {
      const b = bookById(openBookId);
      if (!b || !b.sections || !b.sections.length) return;
      openPick(b.sections[0].id);
    });
    $("pickClose").addEventListener("click", () => {
      $("pickModal").hidden = true;
    });

    try {
      await load();
    } catch (e) {
      console.error(e);
      toast("failed to load library");
      return;
    }
    setView("pool");
  }

  boot();
})();
