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
  let tocOpen = true;

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
    if (editing) {
      toast("save or cancel edit first");
      return;
    }
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
    if (editing) {
      toast("save or cancel edit first");
      return;
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
    if (editing) return;
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

  function renderShelf() {
    editing = false;
    dirty = false;
    hint.textContent = "shelf · pick a cloth book";
    setKeys("N new · click to open");
    const books = lib.notebooks || [];
    stage.innerHTML =
      `<div class="pn-shelf">` +
      `<h1 class="pn-shelf-title">Pocket notebooks</h1>` +
      `<div class="pn-shelf-sub">MYPOCKET</div>` +
      `<div class="pn-shelf-row" id="shelfRow">` +
      books
        .map((nb) => {
          const n = pagesOf(nb).length;
          // modest bulk: 1 page = hairline; denser books thicken slowly (cap ~30)
          const fill = Math.max(0.04, Math.min(1, (n - 1) / 30 + 0.04));
          const labelTilt = ((n * 3 + String(nb.id || "").length) % 7) * 0.12 - 0.35;
          return (
            `<div class="pn-book-wrap">` +
            `<button type="button" class="pn-book cloth-${esc(
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
        })
        .join("") +
      `<button type="button" class="pn-book pn-book-new" id="btnNewNb">+ NEW</button>` +
      `</div></div>`;

    stage.querySelectorAll(".pn-book[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => openBook(btn.getAttribute("data-id")));
    });
    stage.querySelectorAll(".pn-book-gear").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openBookMeta(btn.getAttribute("data-edit"));
      });
    });
    $("btnNewNb").onclick = () => newNotebook();
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
      await persist();
      toast("new notebook");
      openBook(nb.id);
    } catch (e) {
      toast("save failed");
      console.error(e);
    }
  }

  function openBook(id) {
    const nb = notebook(id);
    if (!nb) return;
    openId = id;
    pageIdx = 0;
    editing = false;
    dirty = false;
    renderOpen();
  }

  function closeBook() {
    if (editing && dirty) {
      if (!confirm("Leave without saving this page?")) return;
    }
    openId = null;
    editing = false;
    dirty = false;
    renderShelf();
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
      : "open book · TOC · marks · reorder";
    setKeys(
      editing
        ? "Ctrl+S save · Esc cancel"
        : "← → · T toc · B mark · Alt↑↓ reorder · E edit · N page · Esc shelf"
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
              `<button type="button" class="pn-toc-item" data-i="${i}" ${
                editing ? "disabled" : ""
              }>` +
              `<span class="pn-toc-mark ${mk ? "mark-" + esc(mk) : "is-empty"}" aria-hidden="true"></span>` +
              `<span class="pn-toc-n">${i + 1}</span>` +
              `<span class="pn-toc-dots" aria-hidden="true"></span>` +
              `<span class="pn-toc-t ${t ? "" : "is-blank"}">${esc(
                t || "untitled"
              )}</span>` +
              `</button>` +
              `<span class="pn-toc-move">` +
              `<button type="button" class="pn-toc-up" data-i="${i}" title="Move up" ${
                editing || i === 0 ? "disabled" : ""
              }>↑</button>` +
              `<button type="button" class="pn-toc-dn" data-i="${i}" title="Move down" ${
                editing || i >= n - 1 ? "disabled" : ""
              }>↓</button>` +
              `</span>` +
              `</div>`
            );
          })
          .join("") +
        `</div></div></aside>`
      : "";

    const markBar =
      !editing
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

    stage.innerHTML =
      `<div class="pn-open">` +
      `<div class="pn-open-head">` +
      `<button type="button" class="pn-open-back" id="btnShelf">← SHELF</button>` +
      `<h2 class="pn-open-title" id="btnBookMeta" title="Rename & cover">${esc(
        nb.title
      )}</h2>` +
      `<button type="button" class="pn-open-back" id="btnBookGear" title="Rename & cover">✎</button>` +
      `<button type="button" class="pn-open-back" id="btnToc" title="Table of contents">` +
      (tocOpen ? "TOC ·" : "TOC") +
      `</button>` +
      `<span class="pn-open-meta">${n} page${n === 1 ? "" : "s"}</span>` +
      `</div>` +
      /* open cover shell — grounds floating paper in cloth + beading */
      `<div class="pn-cover cloth-${esc(cloth)}">` +
      `<div class="pn-cover-bead" aria-hidden="true"></div>` +
      `<div class="pn-cover-band">` +
      `<span class="pn-cover-band-title" id="btnCoverTitle" title="Rename & cover">${esc(
        nb.title || "untitled"
      )}</span>` +
      `<span class="pn-cover-band-meta">${n} pg</span>` +
      `</div>` +
      `<div class="pn-cover-well">` +
      `<div class="pn-spread">` +
      tocHtml +
      `<button type="button" class="pn-nav" id="btnPrev" ${
        pageIdx <= 0 || editing ? "disabled" : ""
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
      `<div class="pn-page-num">PAGE ${pageIdx + 1} / ${n}</div>` +
      `<h3 class="pn-page-title" id="pageTitle" ${
        editing ? 'contenteditable="true" spellcheck="true"' : ""
      }>${esc(pg.title || "")}</h3>` +
      (editing
        ? `<div class="pn-page-body pn-page-body-edit" id="pageBody" contenteditable="true" spellcheck="true">${esc(
            pg.body || ""
          )}</div>` +
          `<div class="pn-md-hint mono"># ** ++ \` - [ ] @</div>`
        : `<div class="pn-page-body pn-page-body-md" id="pageBody">${
            (pg.body || "").trim()
              ? renderMarkdown(pg.body)
              : `<span class="pn-blank">blank page · E to write</span>`
          }</div>`) +
      `</div>` +
      markBar +
      `<div class="pn-edit-bar">` +
      (editing
        ? `<button type="button" class="primary" id="btnSavePage">SAVE</button>` +
          `<button type="button" id="btnCancelEdit">CANCEL</button>`
        : `<button type="button" id="btnEdit">E · EDIT</button>` +
          `<button type="button" id="btnMark" title="Cycle bookmark color">B · MARK</button>` +
          `<button type="button" id="btnNewPage">+ PAGE</button>`) +
      `</div>` +
      `</article>` +
      `<button type="button" class="pn-nav" id="btnNext" ${
        pageIdx >= n - 1 || editing ? "disabled" : ""
      } aria-label="Next page">›</button>` +
      `</div>` +
      `</div>` +
      `<div class="pn-cover-bead pn-cover-bead-bot" aria-hidden="true"></div>` +
      `</div>` +
      `<div class="pn-scrub">` +
      `<span class="pn-scrub-label">${pageIdx + 1}</span>` +
      `<input type="range" id="scrub" min="0" max="${Math.max(
        0,
        n - 1
      )}" value="${pageIdx}" ${editing ? "disabled" : ""} />` +
      `<span class="pn-scrub-label">${n}</span>` +
      `</div></div>`;

    $("btnShelf").onclick = () => closeBook();
    const openMeta = () => {
      if (editing) {
        toast("save or cancel edit first");
        return;
      }
      openBookMeta(openId);
    };
    if ($("btnBookMeta")) $("btnBookMeta").onclick = openMeta;
    if ($("btnBookGear")) $("btnBookGear").onclick = openMeta;
    if ($("btnCoverTitle")) $("btnCoverTitle").onclick = openMeta;
    if ($("btnToc"))
      $("btnToc").onclick = () => {
        if (editing) return;
        tocOpen = !tocOpen;
        renderOpen();
      };
    $("btnPrev").onclick = () => {
      if (!editing && pageIdx > 0) {
        pageIdx--;
        renderOpen();
      }
    };
    $("btnNext").onclick = () => {
      if (!editing && pageIdx < n - 1) {
        pageIdx++;
        renderOpen();
      }
    };
    const scrub = $("scrub");
    if (scrub) {
      scrub.oninput = () => {
        if (editing) return;
        pageIdx = Number(scrub.value) || 0;
        renderOpen();
      };
    }
    stage.querySelectorAll(".pn-toc-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (editing) return;
        pageIdx = Number(btn.getAttribute("data-i")) || 0;
        renderOpen();
      });
    });
    stage.querySelectorAll(".pn-toc-up").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const i = Number(btn.getAttribute("data-i"));
        if (!Number.isNaN(i) && i > 0) movePage(i, i - 1);
      });
    });
    stage.querySelectorAll(".pn-toc-dn").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const i = Number(btn.getAttribute("data-i"));
        if (!Number.isNaN(i)) movePage(i, i + 1);
      });
    });
    stage.querySelectorAll(".pn-mark-swatch, .pn-mark-clear").forEach((btn) => {
      btn.addEventListener("click", () => {
        setMark(btn.getAttribute("data-mark") || "");
      });
    });
    if ($("btnEdit")) $("btnEdit").onclick = () => startEdit();
    if ($("btnSavePage")) $("btnSavePage").onclick = () => savePage();
    if ($("btnCancelEdit")) $("btnCancelEdit").onclick = () => cancelEdit();
    if ($("btnNewPage")) $("btnNewPage").onclick = () => newPage();
    if ($("btnMark")) $("btnMark").onclick = () => cycleMark();

    // toggle task boxes without entering edit
    if (!editing) {
      stage.querySelectorAll(".pn-check-input").forEach((cb) => {
        cb.addEventListener("change", (ev) => {
          ev.preventDefault();
          const li = Number(cb.getAttribute("data-line"));
          if (!Number.isNaN(li)) toggleCheckboxLine(li);
        });
      });
    }

    if (editing) {
      const titleEl = $("pageTitle");
      const bodyEl = $("pageBody");
      const markDirty = () => {
        dirty = true;
      };
      if (titleEl) {
        titleEl.addEventListener("input", markDirty);
        titleEl.focus();
      }
      if (bodyEl) bodyEl.addEventListener("input", markDirty);
    }
  }

  function startEdit() {
    editing = true;
    dirty = false;
    renderOpen();
  }

  function cancelEdit() {
    if (dirty && !confirm("Discard edits?")) return;
    editing = false;
    dirty = false;
    renderOpen();
  }

  async function savePage() {
    const nb = notebook(openId);
    if (!nb) return;
    const pages = pagesOf(nb);
    const pg = pages[pageIdx];
    if (!pg) return;
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
      toast("page saved");
      renderOpen();
    } catch (e) {
      toast("save failed");
      console.error(e);
    }
  }

  async function newPage() {
    if (editing) {
      toast("save or cancel edit first");
      return;
    }
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
      startEdit();
    } catch (e) {
      toast("save failed");
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
      if (pageIdx > 0) {
        pageIdx--;
        renderOpen();
      }
      return;
    }
    if (ev.key === "ArrowRight" || ev.key === "PageDown") {
      ev.preventDefault();
      const nb = notebook(openId);
      const n = pagesOf(nb || { pages: [] }).length;
      if (pageIdx < n - 1) {
        pageIdx++;
        renderOpen();
      }
    }
  });

  load()
    .then(() => render())
    .catch((e) => {
      console.error(e);
      stage.innerHTML =
        '<div class="pn-empty">Could not open the pocket library.</div>';
    });
})();
