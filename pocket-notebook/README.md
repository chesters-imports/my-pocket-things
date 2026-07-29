```
=================================================
  MY POCKET THINGS · POCKET NOTEBOOK
  CO.MYPT-002-NOTES · multi-notebook pocket
=================================================
```

**My Pocket Notebook** — shelf of cloth books, open a book, scrub pages, **E** to edit.  
Not chapbook. Not a terminal. Work brain + field notes.

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
| **E** | — | edit page |
| **T** | — | toggle table of contents |
| **B** | — | cycle page bookmark color |
| **Alt+↑ / Alt+↓** | — | reorder current page |
| **← →** | — | flip pages |
| **Ctrl+S** | — | save edit |
| **Esc** | — | cancel edit / back to shelf |

**Notebook settings** (name, whisper, cloth cover): **✎** on the shelf (hover) or open-book title / ✎. Stickers on covers — later (PNG + drag idea parked).

TOC also has **↑ / ↓** per row. Hover the page for color swatches (or **B**). Ribbon appears on the page edge; dots show in the TOC. Field: `page.mark` = `""` \| `hot` \| `brass` \| `forest` \| `navy` \| `sand`.

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

### Data

`prod/notes_sys/data/library.json` — operator-owned.

Seeded from DOS **Daily Tracker** (betsoft office folio) + empty **Field Notes**.

### DCO

`sdk-import-station/paper/dc/ROM REQUESTS/FK-DC-req-my-pocket-things-sku-002-notebook-RMPTNB-10dc24.fk.json`
