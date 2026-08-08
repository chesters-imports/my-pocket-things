```
=================================================
  MY POCKET THINGS · POCKET NOTEBOOK
  CO.MYPT-002-NOTES · multi-notebook pocket
=================================================
```

**My Pocket Notebook** — shelf of cloth books (the nice house for little notebooks), open a book, scrub pages, **E** to edit source, **view renders**.  
Not chapbook. Not a terminal. Work brain + field notes + lore books.  
**MYPOCKET** house chrome. Wider paper than the first cut.

### Run

```bat
cd C:\ALICE_BOX\my-pocket-things\pocket-notebook\prod
run-notes.bat
```

- Deck Host · port **43165**
- Browser: `run-notes-browser.bat` → http://127.0.0.1:43165/

### Keys

| Key | Shelf | Open book |
|-----|--------|-----------|
| **N** | new notebook | new page |
| **− PAGE** | — | remove current page (not last; confirm) |
| **E** | — | edit page (or **double-click** title / body) |
| **T** | — | toggle table of contents |
| **B** | — | cycle page bookmark color |
| **Alt+↑ / Alt+↓** | — | reorder current page |
| **← →** | — | flip pages |
| **Ctrl+S** | — | save edit |
| **Esc** | — | cancel edit / back to shelf |

**Notebook settings** (name, whisper, cloth cover): **✎** on the shelf (hover) or open-book title / ✎. Stickers on covers — later (PNG + drag idea parked).

TOC also has **↑ / ↓** per row. Hover the page for color swatches (or **B**). Ribbon appears on the page edge; dots show in the TOC. Field: `page.mark` = `""` \| `hot` \| `brass` \| `forest` \| `navy` \| `sand`.

### Session (localStorage · place-keepers)

`pn-session-v1`:

- **Per notebook:** last page + scroll (open from shelf → back where you were *in that book*)
- **App cold start:** if you left mid-book, reopen that book (and its place)
- **← SHELF:** desk shows shelf; each book still remembers its own page/scroll
- TOC open/closed remembered globally for now

Later: real ribbon bookmarks; for now the place-keeper *is* the soft bookmark.

### Spell (soft vs off)

WebView2 “add to dictionary” is flaky. Notebook does:

| Mode | Behavior |
|------|----------|
| **SOFT** (default) | Browser spell on; squiggles are **pale paper-ink waves**, not loud red |
| **OFF** | No spellcheck — for slug / SKU / format-dense pages |

While editing: **SPELL · SOFT/OFF** button (remembered in localStorage).  
True pocket word-list (ignore “AIDM” forever) is later — native dictionary can’t take our list.

### Pocket markdown (read mode)

Type in **E**dit (plain source); view renders:

| | |
|--|--|
| Headers | `#` `##` `###` |
| Bold | `**text**` |
| Underline | `++text++` |
| Inline code | `` `code` `` |
| Code block | ` ``` ` fences |
| Checkboxes | `- [ ]` / `- [x]` (click to toggle without edit) |
| Mentions | `@Name` (cough pink · visual only, no link) |

### Data (human packs)

Each notebook is a **`.bok`** on disk — **in `safe_box`**, not inside system code:

```text
prod/
  notes_sys/          ← code (html/js/css/server) only
  safe_box/
    books/
      bsg-daily-tracker.bok/
        book.md
        pages/001-….md
    shelf.json        ← last-opened ids only
```

House layout (same as sopr / lore-box): **object saves live in safe_box**.  
Ritual for next box: never park operator data under `*_sys/`.

Edit still: **E** → type markdown → save → **see printed page**. Not always-raw (that felt like VS Code).

Seeded from DOS **Daily Tracker** (betsoft office folio) + empty **Field Notes**.

### DCO

`sdk-import-station/paper/dc/ROM REQUESTS/FK-DC-req-my-pocket-things-sku-002-notebook-RMPTNB-10dc24.fk.json`
