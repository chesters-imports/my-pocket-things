/* My Pocket Notebook · CO.MYPT-002-NOTES */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const stage = $("stage");
  const hint = $("hint");
  const keys = $("keys");

  /** @type {any} */
  let lib = { notebooks: [] };
  /** @type {string | null} */
  let openId = null;
  let pageIdx = 0;
  let editing = false;
  let dirty = false;
  /** where to put the caret when entering edit: "title" | "body" */
  let editFocus = "title";
  let tocOpen = true;
  /** 'soft' = spellcheck on + pale squiggles; 'off' = no browser spell (slug / format pages) */
  let spellMode = "soft";
  try {
    const sp = localStorage.getItem("pn-spell-mode");
    if (sp === "off" || sp === "soft") spellMode = sp;
  } catch (e) {
    /* ignore */
  }

  /**
   * Session · localStorage pn-session-v1
   * openId: book you were inside when the app closed (null = shelf)
   * books[id]: last page + scroll for that notebook (ribbon / place-keeper)
   */
  const SESSION_KEY = "pn-session-v1";
  /** @type {{ scroll?: number }|null} */
  let pendingRestore = null;
  let scrollSaveTimer = 0;

  function readSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return {};
      const j = JSON.parse(raw);
      if (!j || typeof j !== "object") return {};
      if (!j.books || typeof j.books !== "object") j.books = {};
      return j;
    } catch (e) {
      return { books: {} };
    }
  }

  function writeSession(patch) {
    try {
      const cur = readSession();
      const next = Object.assign({}, cur, patch, { t: Date.now() });
      if (patch.books) {
        next.books = Object.assign({}, cur.books || {}, patch.books);
      } else if (!next.books) {
        next.books = cur.books || {};
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } catch (e) {
      /* ignore */
    }
  }

  function bookPlace(id) {
    const books = readSession().books || {};
    const p = books[id];
    if (!p || typeof p !== "object") return { pageIdx: 0, scroll: 0 };
    return {
      pageIdx: Number(p.pageIdx) || 0,
      scroll: Number(p.scroll) || 0,
    };
  }

  function saveSessionNow() {
    const body = $("pageBody");
    const scroll =
      openId && body && typeof body.scrollTop === "number" ? body.scrollTop : 0;
    const patch = {
      openId: openId,
      tocOpen: tocOpen,
    };
    if (openId) {
      patch.books = {
        [openId]: { pageIdx: pageIdx, scroll: scroll },
      };
    }
    writeSession(patch);
  }

  function scheduleSaveSession() {
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(saveSessionNow, 120);
  }

  let scrollUiTimer = 0;
  function bindPageScrollSave() {
    const body = $("pageBody");
    if (!body || !openId) return;
    body.addEventListener(
      "scroll",
      () => {
        scheduleSaveSession();
        /* spool bar only while scrolling */
        body.classList.add("is-scrolling");
        body.classList.remove("is-scroll-fade");
        clearTimeout(scrollUiTimer);
        scrollUiTimer = setTimeout(() => {
          body.classList.add("is-scroll-fade");
          clearTimeout(scrollUiTimer);
          scrollUiTimer = setTimeout(() => {
            body.classList.remove("is-scrolling");
            body.classList.remove("is-scroll-fade");
          }, 320);
        }, 550);
      },
      { passive: true }
    );
  }

  function applyPendingScroll() {
    if (pendingRestore == null || pendingRestore.scroll == null) return;
    const y = Number(pendingRestore.scroll) || 0;
    pendingRestore = null;
    const body = $("pageBody");
    if (!body) return;
    requestAnimationFrame(() => {
      body.scrollTop = y;
      scheduleSaveSession();
    });
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.hidden = true;
    }, 2000);
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Pocket markdown (read mode):
   * # ## ### headers · **bold** · ++underline++ · `code` · ``` blocks ·
   * - [ ] / - [x] checkboxes · @names (visual only)
   * Edit mode is still plain source.
   */
  function renderMdInline(raw) {
    let s = esc(raw);
    // code first so we don't format inside
    s = s.replace(/`([^`]+)`/g, '<code class="pn-code">$1</code>');
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\+\+(.+?)\+\+/g, "<u>$1</u>");
    // links
    s = s.replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a class="pn-link" href="$2" target="_blank" rel="noopener">$1</a>'
    );
    // @mentions — visual only (cough pink). Park tags so we don't match inside HTML.
    const tagSlots = [];
    s = s.replace(/<[^>]+>/g, (m) => {
      tagSlots.push(m);
      return `\u0000T${tagSlots.length - 1}\u0000`;
    });
    s = s.replace(
      /(^|[\s([{])@([A-Za-z][A-Za-z0-9._-]{0,40})/g,
      '$1<span class="pn-at">@$2</span>'
    );
    s = s.replace(/\u0000T(\d+)\u0000/g, (_, i) => tagSlots[Number(i)]);
    return s;
  }

  function renderMarkdown(src) {
    // Notebook, not blog / not CommonMark nanny:
    // - one Enter → one visible line
    // - N blank lines → N empty rows (never collapse double space to one)
    // - no “pretty” stripping before headers/lists
    const text = String(src ?? "");
    if (!text.trim()) return "";
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let i = 0;
    let inCode = false;
    let codeBuf = [];

    while (i < lines.length) {
      const line = lines[i];
      if (line.trim().startsWith("```")) {
        if (inCode) {
          out.push(
            `<pre class="pn-codeblock"><code>${esc(codeBuf.join("\n"))}</code></pre>`
          );
          codeBuf = [];
          inCode = false;
        } else {
          inCode = true;
        }
        i++;
        continue;
      }
      if (inCode) {
        codeBuf.push(line);
        i++;
        continue;
      }

      // checkbox list item
      const cb = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
      if (cb) {
        const checked = cb[1].toLowerCase() === "x";
        const label = renderMdInline(cb[2]);
        out.push(
          `<label class="pn-check">` +
            `<input type="checkbox" class="pn-check-input" data-line="${i}" ${
              checked ? "checked" : ""
            } />` +
            `<span class="pn-check-label">${label}</span>` +
            `</label>`
        );
        i++;
        continue;
      }

      // headers
      const h = line.match(/^(#{1,3})\s+(.+)$/);
      if (h) {
        const lvl = h[1].length;
        out.push(
          `<h${lvl + 1} class="pn-md-h pn-md-h${lvl}">${renderMdInline(
            h[2]
          )}</h${lvl + 1}>`
        );
        i++;
        continue;
      }

      // plain / blank — 1:1 with source lines (trim only trailing spaces on text)
      const body = line.trimEnd();
      if (body === "") {
        out.push(`<div class="pn-md-blank" aria-hidden="true"></div>`);
      } else {
        out.push(`<div class="pn-md-line">${renderMdInline(body)}</div>`);
      }
      i++;
    }
    if (inCode) {
      out.push(
        `<pre class="pn-codeblock"><code>${esc(codeBuf.join("\n"))}</code></pre>`
      );
    }
    return out.join("");
  }

  function toggleCheckboxLine(lineIdx) {
    const nb = notebook(openId);
    if (!nb) return;
    const pages = pagesOf(nb);
    const pg = pages[pageIdx];
    if (!pg) return;
    const lines = String(pg.body || "").replace(/\r\n/g, "\n").split("\n");
    if (lineIdx < 0 || lineIdx >= lines.length) return;
    const line = lines[lineIdx];
    const m = line.match(/^(\s*[-*]\s+)\[([ xX])\](\s+.*)$/);
    if (!m) return;
    const on = m[2].toLowerCase() === "x";
    lines[lineIdx] = `${m[1]}[${on ? " " : "x"}]${m[3]}`;
    pg.body = lines.join("\n");
    pg.updated = Math.floor(Date.now() / 1000);
    nb.pages = pages;
    nb.updated = pg.updated;
    persist()
      .then(() => {
        // refresh only body render if not editing
        if (!editing) renderOpen();
      })
      .catch((e) => {
        console.error(e);
        toast("checkbox save failed");
      });
  }

  function uid(prefix) {
    return (
      prefix +
      "-" +
      Math.random().toString(36).slice(2, 8) +
      Date.now().toString(36).slice(-3)
    );
  }

  function clothClass(c) {
    const ok = ["oxblood", "forest", "navy", "sand"];
    return ok.includes(c) ? c : "oxblood";
  }

  function whisperTitle(nb, n) {
    const w = (nb.whisper || nb.title || "").trim();
    return w ? `${w} · ${n} pages` : `${n} pages`;
  }

  /** Page ribbon colors (bookmark tabs). Empty = no mark. */
  const MARKS = ["", "hot", "brass", "forest", "navy", "sand"];

  function markClass(m) {
    return MARKS.includes(m) ? m : "";
  }

  function notebook(id) {
    return (lib.notebooks || []).find((n) => n.id === id) || null;
  }

  function pagesOf(nb) {
    return (nb.pages || [])
      .slice()
      .sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  function renumber(pages) {
    pages.forEach((p, i) => {
      p.position = i + 1;
    });
    return pages;
  }

  async function movePage(fromIdx, toIdx) {
    if (!(await confirmLeavePaper())) return;
    const nb = notebook(openId);
    if (!nb) return;
    const pages = pagesOf(nb);
    if (
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= pages.length ||
      toIdx >= pages.length ||
      fromIdx === toIdx
    )
      return;
    const [row] = pages.splice(fromIdx, 1);
    pages.splice(toIdx, 0, row);
    renumber(pages);
    nb.pages = pages;
    nb.updated = Math.floor(Date.now() / 1000);
    pageIdx = toIdx;
    try {
      await persist();
      renderOpen();
    } catch (e) {
      console.error(e);
      toast("reorder failed");
    }
  }

  async function cycleMark() {
    if (editing && dirty) {
      if (!(await confirmLeavePaper())) return;
    } else if (editing) {
      editing = false;
      dirty = false;
    }
    const nb = notebook(openId);
    if (!nb) return;
    const pages = pagesOf(nb);
    const pg = pages[pageIdx];
    if (!pg) return;
    const cur = markClass(pg.mark);
    const i = MARKS.indexOf(cur);
    pg.mark = MARKS[(i + 1) % MARKS.length];
    pg.updated = Math.floor(Date.now() / 1000);
    nb.pages = pages;
    nb.updated = pg.updated;
    try {
      await persist();
      renderOpen();
    } catch (e) {
      console.error(e);
      toast("bookmark failed");
    }
  }

  async function setMark(mark) {
    if (editing && dirty) {
      if (!(await confirmLeavePaper())) return;
    } else if (editing) {
      editing = false;
      dirty = false;
    }
    const nb = notebook(openId);
    if (!nb) return;
    const pages = pagesOf(nb);
    const pg = pages[pageIdx];
    if (!pg) return;
    const next = markClass(mark);
    pg.mark = next === pg.mark ? "" : next;
    pg.updated = Math.floor(Date.now() / 1000);
    nb.pages = pages;
    nb.updated = pg.updated;
    try {
      await persist();
      renderOpen();
    } catch (e) {
      console.error(e);
      toast("bookmark failed");
    }
  }

  async function load() {
    const r = await fetch("/api/library", { cache: "no-store" });
    const j = await r.json();
    if (!j.ok) throw new Error("library fail");
    lib = j.library || j;
    if (!Array.isArray(lib.notebooks)) lib.notebooks = [];
  }

  async function persist() {
    const r = await fetch("/api/library", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ library: lib }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "save fail");
    if (j.library) lib = j.library;
  }

  function setKeys(text) {
    keys.textContent = text;
  }

  function render() {
    if (openId) renderOpen();
    else renderShelf();
  }

  function bookCoverHtml(nb, opts) {
    opts = opts || {};
    const large = !!opts.large;
    const n = pagesOf(nb).length;
    const fill = Math.max(0.04, Math.min(1, (n - 1) / 30 + 0.04));
    const labelTilt = ((n * 3 + String(nb.id || "").length) % 7) * 0.12 - 0.35;
    const wrapCls = large ? "pn-book-wrap is-recent" : "pn-book-wrap";
    return (
      `<div class="${wrapCls}">` +
      `<button type="button" class="pn-book ${large ? "is-recent-book" : ""} cloth-${esc(
        clothClass(nb.cloth)
      )}" data-id="${esc(nb.id)}" title="${esc(whisperTitle(nb, n))}" style="--pg-fill: ${fill}; --pg-n: ${n};">` +
      `<span class="pn-book-block" aria-hidden="true">` +
      `<span class="pn-book-pages"></span>` +
      `<span class="pn-book-spine"></span>` +
      `</span>` +
      `<span class="pn-book-plate" aria-hidden="true" style="--label-tilt: ${labelTilt.toFixed(2)}deg;">` +
      `<span class="pn-book-title">${esc(nb.title || "untitled")}</span>` +
      `<span class="pn-book-count">${n} page${n === 1 ? "" : "s"}</span>` +
      `</span>` +
      `</button>` +
      `<button type="button" class="pn-book-gear" data-edit="${esc(
        nb.id
      )}" title="Name & cover">✎</button>` +
      `</div>`
    );
  }

  const SHELF_ORDER_KEY = "pn-shelf-order-v1";

  function readShelfOrder() {
    try {
      const a = JSON.parse(localStorage.getItem(SHELF_ORDER_KEY) || "[]");
      return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
    } catch (e) {
      return [];
    }
  }

  function writeShelfOrder(ids) {
    try {
      localStorage.setItem(SHELF_ORDER_KEY, JSON.stringify(ids));
    } catch (e) {
      /* ignore */
    }
  }

  /** Library spines in your order (drag-drop); new books append. */
  function orderedBooks() {
    const books = lib.notebooks || [];
    const byId = {};
    books.forEach((nb) => {
      if (nb && nb.id) byId[nb.id] = nb;
    });
    const out = [];
    const seen = {};
    readShelfOrder().forEach((id) => {
      if (byId[id] && !seen[id]) {
        out.push(byId[id]);
        seen[id] = true;
      }
    });
    books.forEach((nb) => {
      if (nb && nb.id && !seen[nb.id]) {
        out.push(nb);
        seen[nb.id] = true;
      }
    });
    return out;
  }

  function bookSpineHtml(nb) {
    const n = pagesOf(nb).length;
    const title = (nb.title || "untitled").trim() || "untitled";
    const short =
      title.length > 22 ? title.slice(0, 20).toUpperCase() + "…" : title.toUpperCase();
    return (
      `<div class="pn-spine-wrap" draggable="true" data-spine-id="${esc(nb.id)}">` +
      `<button type="button" class="pn-spine cloth-${esc(
        clothClass(nb.cloth)
      )}" data-id="${esc(nb.id)}" title="${esc(
        whisperTitle(nb, n) + " · drag to rearrange"
      )}">` +
      `<span class="pn-spine-label">${esc(short)}</span>` +
      `</button>` +
      `<button type="button" class="pn-book-gear pn-spine-gear" data-edit="${esc(
        nb.id
      )}" title="Name & cover">✎</button>` +
      `</div>`
    );
  }

  function recentNotebooks(books, maxN) {
    maxN = maxN || 4;
    const byId = {};
    books.forEach((nb) => {
      if (nb && nb.id) byId[nb.id] = nb;
    });
    const lo = Array.isArray(lib.lastOpened) ? lib.lastOpened : [];
    const out = [];
    const seen = {};
    lo.forEach((id) => {
      if (out.length >= maxN) return;
      if (byId[id] && !seen[id]) {
        out.push(byId[id]);
        seen[id] = true;
      }
    });
    books.forEach((nb) => {
      if (out.length >= maxN) return;
      if (nb && nb.id && !seen[nb.id]) {
        out.push(nb);
        seen[nb.id] = true;
      }
    });
    return out;
  }

  function bindSpineDrag(bay) {
    if (!bay) return;
    let dragId = null;
    let suppressClick = false;
    const clearDrop = () => {
      bay.querySelectorAll(".pn-spine-wrap.is-drop").forEach((w) => {
        w.classList.remove("is-drop");
      });
    };
    bay.querySelectorAll(".pn-spine-wrap[data-spine-id]").forEach((wrap) => {
      wrap.addEventListener("dragstart", (ev) => {
        dragId = wrap.getAttribute("data-spine-id");
        wrap.classList.add("is-dragging");
        try {
          ev.dataTransfer.setData("text/plain", dragId || "");
          ev.dataTransfer.effectAllowed = "move";
        } catch (e) {
          /* ignore */
        }
      });
      wrap.addEventListener("dragend", () => {
        wrap.classList.remove("is-dragging");
        clearDrop();
        dragId = null;
        suppressClick = true;
        setTimeout(() => {
          suppressClick = false;
        }, 40);
      });
      wrap.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        if (!dragId || wrap.getAttribute("data-spine-id") === dragId) return;
        clearDrop();
        wrap.classList.add("is-drop");
      });
      wrap.addEventListener("drop", (ev) => {
        ev.preventDefault();
        const targetId = wrap.getAttribute("data-spine-id");
        if (!dragId || !targetId || dragId === targetId) return;
        const ids = orderedBooks().map((b) => b.id);
        const from = ids.indexOf(dragId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(from, 1);
        ids.splice(to, 0, dragId);
        writeShelfOrder(ids);
        renderShelf();
      });
    });
    bay.querySelectorAll(".pn-spine[data-id]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        if (suppressClick) {
          ev.preventDefault();
          return;
        }
        openBook(btn.getAttribute("data-id"));
      });
    });
  }

  function renderShelf() {
    editing = false;
    dirty = false;
    hint.textContent = "last opened · library spines · drag to arrange";
    setKeys("N new · click open · drag spines");
    const books = orderedBooks();
    // IDA04: max 3 large recents; + NEW lives on spine shelf
    const recents = recentNotebooks(books, 3);
    const recentHtml = recents.length
      ? recents.map((nb) => bookCoverHtml(nb, { large: true })).join("")
      : `<div class="pn-shelf-empty">No notebooks yet — + NEW on the shelf below</div>`;
    // Chunk spines onto real shelf planks (sit ON the lip, not over it)
    const PER_SHELF = 12;
    const chunks = [];
    for (let i = 0; i < books.length; i += PER_SHELF) {
      chunks.push(books.slice(i, i + PER_SHELF));
    }
    if (!chunks.length) chunks.push([]);
    const shelvesHtml = chunks
      .map((chunk, si) => {
        const last = si === chunks.length - 1;
        return (
          `<div class="pn-spine-plank" data-plank="${si}">` +
          `<div class="pn-spine-rail" data-rail="${si}">` +
          chunk.map((nb) => bookSpineHtml(nb)).join("") +
          (last
            ? `<button type="button" class="pn-spine-new" id="btnNewNb" title="New notebook">+ NEW</button>`
            : "") +
          `</div>` +
          `<div class="pn-spine-lip" aria-hidden="true"></div>` +
          `</div>`
        );
      })
      .join("");

    stage.innerHTML =
      `<div class="pn-shelf">` +
      `<div class="pn-zone-lab">Last opened</div>` +
      `<div class="pn-shelf-row pn-shelf-recents" id="shelfRecents">` +
      recentHtml +
      `</div>` +
      `<div class="pn-zone-lab pn-zone-lab-shelf">Library · spines · drag</div>` +
      `<div class="pn-spine-bay" id="spineBay" aria-label="Library shelves">` +
      shelvesHtml +
      `</div>` +
      `</div>`;

    stage.querySelectorAll(".pn-book[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => openBook(btn.getAttribute("data-id")));
    });
    stage.querySelectorAll(".pn-book-gear").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openBookMeta(btn.getAttribute("data-edit"));
      });
    });
    // drag across the whole bay (all planks)
    bindSpineDrag($("spineBay"));
    const newBtn = $("btnNewNb");
    if (newBtn) newBtn.onclick = () => newNotebook();
  }

  /** Rename + cloth cover (stickers later) */
  function openBookMeta(id) {
    const nb = notebook(id);
    if (!nb) return;
    const cloths = ["oxblood", "forest", "navy", "sand"];
    const cur = clothClass(nb.cloth);
    const overlay = document.createElement("div");
    overlay.className = "pn-meta";
    overlay.innerHTML =
      `<div class="pn-meta-card" role="dialog" aria-label="Notebook settings">` +
      `<div class="pn-meta-h">Notebook</div>` +
      `<label class="pn-meta-lab">Name` +
      `<input type="text" class="pn-meta-input" id="metaTitle" value="${esc(
        nb.title || ""
      )}" maxlength="80" autocomplete="off" />` +
      `</label>` +
      `<label class="pn-meta-lab">Whisper <span class="pn-meta-opt">(shelf hint)</span>` +
      `<input type="text" class="pn-meta-input" id="metaWhisper" value="${esc(
        nb.whisper || ""
      )}" maxlength="120" autocomplete="off" />` +
      `</label>` +
      `<div class="pn-meta-lab">Cloth cover</div>` +
      `<div class="pn-meta-cloths" id="metaCloths">` +
      cloths
        .map(
          (c) =>
            `<button type="button" class="pn-meta-cloth cloth-${c} ${
              c === cur ? "is-on" : ""
            }" data-cloth="${c}" title="${c}"></button>`
        )
        .join("") +
      `</div>` +
      `<p class="pn-meta-note">Stickers later — PNG on the cover, drag around. Not yet.</p>` +
      `<div class="pn-meta-actions">` +
      `<button type="button" class="primary" id="metaSave">SAVE</button>` +
      `<button type="button" id="metaCancel">CANCEL</button>` +
      `</div></div>`;
    document.body.appendChild(overlay);

    let pick = cur;
    overlay.querySelectorAll(".pn-meta-cloth").forEach((b) => {
      b.addEventListener("click", () => {
        pick = b.getAttribute("data-cloth");
        overlay.querySelectorAll(".pn-meta-cloth").forEach((x) => {
          x.classList.toggle("is-on", x === b);
        });
      });
    });
    const close = () => overlay.remove();
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) close();
    });
    $("metaCancel").onclick = close;
    $("metaSave").onclick = async () => {
      const title = ($("metaTitle").value || "").trim();
      if (!title) {
        toast("needs a name");
        return;
      }
      nb.title = title;
      nb.whisper = ($("metaWhisper").value || "").trim();
      nb.cloth = clothClass(pick);
      nb.updated = Math.floor(Date.now() / 1000);
      try {
        await persist();
        close();
        toast("notebook updated");
        render();
      } catch (e) {
        console.error(e);
        toast("save failed");
      }
    };
    setTimeout(() => {
      const inp = $("metaTitle");
      if (inp) {
        inp.focus();
        inp.select();
      }
    }, 0);
  }

  async function newNotebook() {
    const title = prompt("Notebook name", "Scratch");
    if (title == null || !String(title).trim()) return;
    const cloths = ["oxblood", "forest", "navy", "sand"];
    const now = Math.floor(Date.now() / 1000);
    const nb = {
      id: uid("nb"),
      title: String(title).trim(),
      whisper: "",
      cloth: cloths[lib.notebooks.length % cloths.length],
      created: now,
      updated: now,
      pages: [
        {
          id: uid("pg"),
          position: 1,
          title: "",
          body: "",
          mark: "",
          updated: now,
        },
      ],
    };
    lib.notebooks.push(nb);
    try {
      const ids = orderedBooks().map((b) => b.id);
      if (!ids.includes(nb.id)) {
        ids.push(nb.id);
        writeShelfOrder(ids);
      }
      await persist();
      toast("new notebook");
      openBook(nb.id);
    } catch (e) {
      toast("save failed");
      console.error(e);
    }
  }

  function touchLastOpened(id) {
    if (!lib || !id) return;
    let lo = Array.isArray(lib.lastOpened) ? lib.lastOpened.slice() : [];
    lo = lo.filter((x) => x && x !== id);
    lo.unshift(id);
    lib.lastOpened = lo.slice(0, 8);
  }

  function openBook(id, opts) {
    opts = opts || {};
    const nb = notebook(id);
    if (!nb) return;
    openId = id;
    const pages = pagesOf(nb);
    // Per-book place: last page/scroll inside this notebook (shelf open or cold start)
    const place = bookPlace(id);
    let wantPage =
      opts.pageIdx != null && opts.pageIdx >= 0 ? opts.pageIdx : place.pageIdx;
    pageIdx = Math.min(
      Math.max(0, wantPage),
      Math.max(0, pages.length - 1)
    );
    const wantScroll =
      opts.scroll != null ? opts.scroll : place.scroll != null ? place.scroll : 0;
    editing = false;
    dirty = false;
    touchLastOpened(id);
    persist().catch(() => {});
    pendingRestore = { scroll: Number(wantScroll) || 0 };
    renderOpen();
    saveSessionNow();
  }

  async function closeBook() {
    if (!(await confirmLeavePaper())) return;
    // Keep books[id] place; only leave the desk (openId null = shelf)
    saveSessionNow();
    openId = null;
    editing = false;
    dirty = false;
    writeSession({ openId: null, tocOpen: tocOpen });
    renderShelf();
  }

  /**
   * Library slip (cute modal) — not window.confirm.
   * returns "ok" | "cancel" (and optional third later)
   */
  function librarySlip(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "pn-slip";
      overlay.innerHTML =
        `<div class="pn-slip-card" role="dialog" aria-modal="true" aria-label="${esc(
          opts.title || "Library"
        )}">` +
        `<div class="pn-slip-stamp">${esc(opts.stamp || "LIBRARY DESK")}</div>` +
        `<div class="pn-slip-h">${esc(opts.title || "A moment")}</div>` +
        `<p class="pn-slip-body">${esc(
          opts.body || ""
        )}</p>` +
        `<div class="pn-slip-actions">` +
        `<button type="button" id="slipCancel">${esc(
          opts.cancelLabel || "Stay"
        )}</button>` +
        `<button type="button" class="primary" id="slipOk">${esc(
          opts.okLabel || "Continue"
        )}</button>` +
        `</div></div>`;
      document.body.appendChild(overlay);
      const onKey = (ev) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          done(false);
        } else if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          done(true);
        }
      };
      const done = (val) => {
        document.removeEventListener("keydown", onKey, true);
        overlay.remove();
        resolve(val);
      };
      overlay.querySelector("#slipOk").onclick = () => done(true);
      overlay.querySelector("#slipCancel").onclick = () => done(false);
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) done(false);
      });
      document.addEventListener("keydown", onKey, true);
      setTimeout(() => {
        const b = overlay.querySelector("#slipOk");
        if (b) b.focus();
      }, 0);
    });
  }

  /**
   * Leaving the page while editing — wet ink?
   * Save & go · Stay writing
   */
  async function confirmLeavePaper() {
    if (!editing) return true;
    if (dirty) {
      const ok = await librarySlip({
        stamp: "PAPERS, PLEASE",
        title: "Wet ink",
        body:
          "This paper still has wet ink.\n\nSave it before you leave the page — or stay and keep writing.",
        okLabel: "Save & go",
        cancelLabel: "Stay writing",
      });
      if (!ok) return false;
      const saved = await savePage({ skipRender: true });
      if (!saved) return false;
    }
    editing = false;
    dirty = false;
    return true;
  }

  async function goToPage(i) {
    const n = pagesOf(notebook(openId) || { pages: [] }).length;
    if (i < 0 || i >= n) return;
    if (i === pageIdx && !editing) return;
    if (!(await confirmLeavePaper())) return;
    pageIdx = i;
    pendingRestore = null;
    editing = false;
    dirty = false;
    renderOpen();
    saveSessionNow();
  }

  function renderOpen() {
    const nb = notebook(openId);
    if (!nb) {
      openId = null;
      renderShelf();
      return;
    }
    const pages = pagesOf(nb);
    if (!pages.length) {
      pages.push({
        id: uid("pg"),
        position: 1,
        title: "",
        body: "",
        mark: "",
        updated: Math.floor(Date.now() / 1000),
      });
      nb.pages = pages;
    }
    if (pageIdx < 0) pageIdx = 0;
    if (pageIdx >= pages.length) pageIdx = pages.length - 1;
    const pg = pages[pageIdx];
    const n = pages.length;

    const curMark = markClass(pg.mark);

    hint.textContent = editing
      ? "editing · Ctrl+S save · Esc cancel"
      : "double-click or E · B bookmark · ← → pages";
    setKeys(
      editing
        ? "Ctrl+S · Esc cancel · B mark"
        : "← → · T toc · B mark · E edit · N page · Esc shelf"
    );

    const tocHtml = tocOpen
      ? `<aside class="pn-toc cloth-${esc(clothClass(nb.cloth))}" aria-label="Table of contents">` +
        `<div class="pn-toc-spine" aria-hidden="true"></div>` +
        `<div class="pn-toc-paper">` +
        `<div class="pn-toc-h">` +
        `<span class="pn-toc-h-title">Contents</span>` +
        `<span class="pn-toc-h-sub">${n} leaf${n === 1 ? "" : "s"} · ↑↓</span>` +
        `</div>` +
        `<div class="pn-toc-list" id="tocList">` +
        pages
          .map((p, i) => {
            const t = (p.title || "").trim();
            const mk = markClass(p.mark);
            return (
              `<div class="pn-toc-row ${i === pageIdx ? "is-on" : ""}" data-i="${i}">` +
              `<button type="button" class="pn-toc-item" data-i="${i}" title="${esc(
                t || "untitled"
              )}">` +
              `<span class="pn-toc-mark ${mk ? "mark-" + esc(mk) : "is-empty"}" aria-hidden="true"></span>` +
              `<span class="pn-toc-n">${i + 1}</span>` +
              `<span class="pn-toc-t ${t ? "" : "is-blank"}">${esc(
                t || "untitled"
              )}</span>` +
              `</button>` +
              `<span class="pn-toc-move">` +
              `<button type="button" class="pn-toc-up" data-i="${i}" title="Move up" ${
                i === 0 ? "disabled" : ""
              }>↑</button>` +
              `<button type="button" class="pn-toc-dn" data-i="${i}" title="Move down" ${
                i >= n - 1 ? "disabled" : ""
              }>↓</button>` +
              `</span>` +
              `</div>`
            );
          })
          .join("") +
        `</div></div></aside>`
      : "";

    /* color dots only while editing — B still cycles in read mode */
    const markBar = editing
      ? `<div class="pn-marks" role="group" aria-label="Page bookmark">` +
        MARKS.filter(Boolean)
          .map(
            (m) =>
              `<button type="button" class="pn-mark-swatch mark-${esc(m)} ${
                curMark === m ? "is-on" : ""
              }" data-mark="${esc(m)}" title="Bookmark ${esc(m)}"></button>`
          )
          .join("") +
        `<button type="button" class="pn-mark-clear ${
          !curMark ? "is-on" : ""
        }" data-mark="" title="Clear bookmark">×</button>` +
        `</div>`
      : "";

    const cloth = clothClass(nb.cloth);

    // CHG05: drop dual chrome header — cover band is title; ← SHELF by scrub
    stage.innerHTML =
      `<div class="pn-open">` +
      `<div class="pn-cover cloth-${esc(cloth)}">` +
      `<div class="pn-cover-bead" aria-hidden="true"></div>` +
      `<div class="pn-cover-band">` +
      `<span class="pn-cover-band-title" id="btnCoverTitle" title="Rename & cover">${esc(
        nb.title || "untitled"
      )}</span>` +
      `<button type="button" class="pn-cover-band-btn" id="btnBookGear" title="Rename & cover">✎</button>` +
      `<button type="button" class="pn-cover-band-btn" id="btnToc" title="Table of contents">` +
      (tocOpen ? "TOC ·" : "TOC") +
      `</button>` +
      `<span class="pn-cover-band-meta">${n} pg</span>` +
      `</div>` +
      `<div class="pn-cover-well">` +
      `<div class="pn-spread">` +
      tocHtml +
      `<button type="button" class="pn-nav" id="btnPrev" ${
        pageIdx <= 0 ? "disabled" : ""
      } aria-label="Previous page">‹</button>` +
      `<article class="pn-page ${editing ? "is-edit" : ""} ${
        curMark ? "has-mark mark-" + esc(curMark) : ""
      }" id="page">` +
      `<span class="pn-page-gutter" aria-hidden="true"></span>` +
      (curMark
        ? `<span class="pn-ribbon mark-${esc(
            curMark
          )}" title="Bookmark · B to cycle" aria-hidden="true"></span>`
        : "") +
      `<div class="pn-page-inner">` +
      `<div class="pn-page-rail">` +
      `<h3 class="pn-page-title" id="pageTitle" ${
        editing
          ? `contenteditable="true" spellcheck="${
              spellMode === "soft" ? "true" : "false"
            }"`
          : ""
      }>${esc(pg.title || "")}</h3>` +
      `<div class="pn-page-num">PAGE ${pageIdx + 1} / ${n}</div>` +
      `</div>` +
      (editing
        ? `<div class="pn-page-body pn-page-body-edit pn-spell-${esc(
            spellMode
          )}" id="pageBody" contenteditable="true" spellcheck="${
            spellMode === "soft" ? "true" : "false"
          }">${esc(pg.body || "")}</div>` +
          `<div class="pn-md-hint mono"># ** ++ \` - [ ] @ · spell ${esc(
            spellMode
          )} · B bookmark · Ctrl+S</div>`
        : `<div class="pn-page-body pn-page-body-md" id="pageBody">${
            (pg.body || "").trim()
              ? renderMarkdown(pg.body)
              : `<span class="pn-blank">blank page · double-click or E</span>`
          }</div>`) +
      `</div>` +
      (editing
        ? markBar +
          `<div class="pn-edit-bar is-on">` +
          `<button type="button" class="primary" id="btnSavePage">SAVE</button>` +
          `<button type="button" id="btnCancelEdit">CANCEL</button>` +
          `<button type="button" id="btnSpell" title="Soft pale errors, or off for slug-heavy pages">SPELL · ${
            spellMode === "soft" ? "SOFT" : "OFF"
          }</button>` +
          `<button type="button" id="btnNewPage">+ PAGE</button>` +
          `<button type="button" id="btnDelPage" title="Remove this page from the book">− PAGE</button>` +
          `</div>`
        : "") +
      `</article>` +
      `<button type="button" class="pn-nav" id="btnNext" ${
        pageIdx >= n - 1 ? "disabled" : ""
      } aria-label="Next page">›</button>` +
      `</div>` +
      `</div>` +
      `<div class="pn-cover-bead pn-cover-bead-bot" aria-hidden="true"></div>` +
      `</div>` +
      `<div class="pn-scrub">` +
      `<button type="button" class="pn-scrub-shelf" id="btnShelf" title="Back to shelf">← SHELF</button>` +
      `<span class="pn-scrub-label">${pageIdx + 1}</span>` +
      `<input type="range" id="scrub" min="0" max="${Math.max(
        0,
        n - 1
      )}" value="${pageIdx}" />` +
      `<span class="pn-scrub-label">${n}</span>` +
      `</div></div>`;

    $("btnShelf").onclick = () => closeBook();
    const openMeta = async () => {
      if (!(await confirmLeavePaper())) return;
      editing = false;
      dirty = false;
      openBookMeta(openId);
    };
    if ($("btnBookGear")) $("btnBookGear").onclick = openMeta;
    if ($("btnCoverTitle")) $("btnCoverTitle").onclick = openMeta;
    if ($("btnToc"))
      $("btnToc").onclick = async () => {
        if (editing && dirty) {
          if (!(await confirmLeavePaper())) return;
          renderOpen();
          return;
        }
        tocOpen = !tocOpen;
        saveSessionNow();
        renderOpen();
      };
    $("btnPrev").onclick = () => {
      if (pageIdx > 0) goToPage(pageIdx - 1);
    };
    $("btnNext").onclick = () => {
      if (pageIdx < n - 1) goToPage(pageIdx + 1);
    };
    const scrub = $("scrub");
    if (scrub) {
      scrub.onchange = () => {
        goToPage(Number(scrub.value) || 0);
      };
    }
    stage.querySelectorAll(".pn-toc-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        goToPage(Number(btn.getAttribute("data-i")) || 0);
      });
    });
    stage.querySelectorAll(".pn-toc-up").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        if (!(await confirmLeavePaper())) return;
        const i = Number(btn.getAttribute("data-i"));
        if (!Number.isNaN(i) && i > 0) movePage(i, i - 1);
      });
    });
    stage.querySelectorAll(".pn-toc-dn").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        if (!(await confirmLeavePaper())) return;
        const i = Number(btn.getAttribute("data-i"));
        if (!Number.isNaN(i)) movePage(i, i + 1);
      });
    });
    stage.querySelectorAll(".pn-mark-swatch, .pn-mark-clear").forEach((btn) => {
      btn.addEventListener("click", () => {
        setMark(btn.getAttribute("data-mark") || "");
      });
    });
    if ($("btnSavePage")) $("btnSavePage").onclick = () => savePage();
    if ($("btnCancelEdit")) $("btnCancelEdit").onclick = () => cancelEdit();
    if ($("btnSpell")) $("btnSpell").onclick = () => toggleSpellMode();
    if ($("btnNewPage")) $("btnNewPage").onclick = () => newPage();
    if ($("btnDelPage")) $("btnDelPage").onclick = () => deletePage();

    // toggle task boxes without entering edit
    if (!editing) {
      stage.querySelectorAll(".pn-check-input").forEach((cb) => {
        cb.addEventListener("change", (ev) => {
          ev.preventDefault();
          const li = Number(cb.getAttribute("data-line"));
          if (!Number.isNaN(li)) toggleCheckboxLine(li);
        });
      });
      // double-click title → edit title; body → edit body
      const pageBody = $("pageBody");
      const pageTitle = $("pageTitle");
      if (pageBody)
        pageBody.addEventListener("dblclick", (ev) => {
          if (ev.target && ev.target.closest && ev.target.closest("a, input, button, label"))
            return;
          ev.preventDefault();
          startEdit("body");
        });
      if (pageTitle)
        pageTitle.addEventListener("dblclick", (ev) => {
          ev.preventDefault();
          startEdit("title");
        });
    }

    if (editing) {
      const titleEl = $("pageTitle");
      const bodyEl = $("pageBody");
      const markDirty = () => {
        dirty = true;
      };
      if (titleEl) titleEl.addEventListener("input", markDirty);
      if (bodyEl) bodyEl.addEventListener("input", markDirty);
      const focusEl = editFocus === "body" ? bodyEl : titleEl;
      if (focusEl) {
        focusEl.focus();
        try {
          if (editFocus === "body" && bodyEl) {
            const range = document.createRange();
            range.selectNodeContents(bodyEl);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          } else if (titleEl) {
            const range = document.createRange();
            range.selectNodeContents(titleEl);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
        } catch (e) {
          /* ignore caret */
        }
      }
    }

    bindPageScrollSave();
    applyPendingScroll();
    if (openId) scheduleSaveSession();
  }

  function startEdit(focus) {
    editing = true;
    dirty = false;
    editFocus = focus === "body" ? "body" : "title";
    renderOpen();
  }

  function toggleSpellMode() {
    spellMode = spellMode === "soft" ? "off" : "soft";
    try {
      localStorage.setItem("pn-spell-mode", spellMode);
    } catch (e) {
      /* ignore */
    }
    // re-apply without full re-render if possible
    const body = $("pageBody");
    const title = $("pageTitle");
    const on = spellMode === "soft";
    if (body && body.isContentEditable) {
      body.spellcheck = on;
      body.setAttribute("spellcheck", on ? "true" : "false");
      body.classList.toggle("pn-spell-soft", on);
      body.classList.toggle("pn-spell-off", !on);
    }
    if (title && title.isContentEditable) {
      title.spellcheck = on;
      title.setAttribute("spellcheck", on ? "true" : "false");
    }
    const btn = $("btnSpell");
    if (btn) btn.textContent = "SPELL · " + (on ? "SOFT" : "OFF");
    const hint = document.querySelector(".pn-md-hint");
    if (hint)
      hint.textContent =
        "# ** ++ ` - [ ] @ · spell " +
        spellMode +
        " (pale squiggle · off for slugs)";
    toast(on ? "spell soft · pale marks" : "spell off · slug / format mode");
  }

  async function cancelEdit() {
    if (dirty) {
      const ok = await librarySlip({
        stamp: "LIBRARY DESK",
        title: "Discard wet ink?",
        body: "Throw away the changes on this paper and return to the printed page?",
        okLabel: "Discard",
        cancelLabel: "Keep writing",
      });
      if (!ok) return;
    }
    editing = false;
    dirty = false;
    renderOpen();
  }

  async function savePage(opts) {
    opts = opts || {};
    const nb = notebook(openId);
    if (!nb) return false;
    const pages = pagesOf(nb);
    const pg = pages[pageIdx];
    if (!pg) return false;
    const titleEl = $("pageTitle");
    const bodyEl = $("pageBody");
    pg.title = titleEl ? titleEl.innerText.replace(/\n/g, " ").trim() : pg.title;
    // textContent loses blank lines less than innerText for plain notes; use innerText
    pg.body = bodyEl ? bodyEl.innerText.replace(/\u00a0/g, " ") : pg.body;
    pg.updated = Math.floor(Date.now() / 1000);
    nb.pages = pages;
    nb.updated = pg.updated;
    try {
      await persist();
      editing = false;
      dirty = false;
      if (!opts.silent) toast("page saved");
      if (!opts.skipRender) renderOpen();
      return true;
    } catch (e) {
      toast("save failed");
      console.error(e);
      return false;
    }
  }

  async function newPage() {
    if (!(await confirmLeavePaper())) return;
    const nb = notebook(openId);
    if (!nb) return;
    const pages = pagesOf(nb);
    const now = Math.floor(Date.now() / 1000);
    pages.push({
      id: uid("pg"),
      position: pages.length + 1,
      title: "",
      body: "",
      mark: "",
      updated: now,
    });
    renumber(pages);
    nb.pages = pages;
    nb.updated = now;
    try {
      await persist();
      pageIdx = pages.length - 1;
      toast("new page");
      saveSessionNow();
      startEdit();
    } catch (e) {
      toast("save failed");
      console.error(e);
    }
  }

  async function deletePage() {
    if (!(await confirmLeavePaper())) return;
    const nb = notebook(openId);
    if (!nb) return;
    const pages = pagesOf(nb);
    if (pages.length <= 1) {
      toast("last page stays · empty it or burn the book");
      return;
    }
    const pg = pages[pageIdx];
    const label = (pg && (pg.title || "").trim()) || "this page";
    const ok = await librarySlip({
      stamp: "LIBRARY DESK",
      title: "Remove a leaf?",
      body:
        "Take “" +
        label +
        "” out of the book?\n\nIt leaves the .bok. No putting it back from the bin.",
      okLabel: "Remove leaf",
      cancelLabel: "Keep it",
    });
    if (!ok) return;
    pages.splice(pageIdx, 1);
    renumber(pages);
    nb.pages = pages;
    nb.updated = Math.floor(Date.now() / 1000);
    if (pageIdx >= pages.length) pageIdx = pages.length - 1;
    try {
      await persist();
      pendingRestore = null;
      toast("page removed");
      saveSessionNow();
      renderOpen();
    } catch (e) {
      toast("remove failed");
      console.error(e);
    }
  }

  document.addEventListener("keydown", (ev) => {
    const tag = (ev.target && ev.target.tagName) || "";
    const inField =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      (ev.target && ev.target.isContentEditable);

    if (ev.key === "Escape") {
      if (editing) {
        ev.preventDefault();
        cancelEdit();
        return;
      }
      if (openId) {
        ev.preventDefault();
        closeBook();
      }
      return;
    }

    if (editing) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        savePage();
      }
      return;
    }

    if (inField) return;

    if (!openId) {
      if (ev.key.toLowerCase() === "n") {
        ev.preventDefault();
        newNotebook();
      }
      return;
    }

    if (ev.key.toLowerCase() === "e") {
      ev.preventDefault();
      startEdit();
      return;
    }
    if (ev.key.toLowerCase() === "t") {
      ev.preventDefault();
      tocOpen = !tocOpen;
      renderOpen();
      return;
    }
    if (ev.key.toLowerCase() === "n") {
      ev.preventDefault();
      newPage();
      return;
    }
    if (ev.key.toLowerCase() === "b") {
      ev.preventDefault();
      cycleMark();
      return;
    }
    // Alt+↑ / Alt+↓ — reorder current page
    if (ev.altKey && (ev.key === "ArrowUp" || ev.key === "ArrowDown")) {
      ev.preventDefault();
      if (ev.key === "ArrowUp" && pageIdx > 0) movePage(pageIdx, pageIdx - 1);
      else if (ev.key === "ArrowDown") {
        const nb = notebook(openId);
        const n = pagesOf(nb || { pages: [] }).length;
        if (pageIdx < n - 1) movePage(pageIdx, pageIdx + 1);
      }
      return;
    }
    if (ev.key === "ArrowLeft" || ev.key === "PageUp") {
      ev.preventDefault();
      if (pageIdx > 0) goToPage(pageIdx - 1);
      return;
    }
    if (ev.key === "ArrowRight" || ev.key === "PageDown") {
      ev.preventDefault();
      const nb = notebook(openId);
      const n = pagesOf(nb || { pages: [] }).length;
      if (pageIdx < n - 1) goToPage(pageIdx + 1);
    }
  });

  load()
    .then(() => {
      const sess = readSession();
      if (typeof sess.tocOpen === "boolean") tocOpen = sess.tocOpen;
      // App closed while inside a book → return to that book (its place via books[id])
      if (sess.openId && notebook(sess.openId)) {
        openBook(sess.openId);
        return;
      }
      render();
    })
    .catch((e) => {
      console.error(e);
      stage.innerHTML =
        '<div class="pn-empty">Could not open the pocket library.</div>';
    });
})();
