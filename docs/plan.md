# tldraw-cli Implementation Plan

A headless CLI for creating, manipulating, and exporting tldraw documents from the terminal. Designed for AI agents and humans alike.

## Motivation

AI coding agents (Claude Code, Codex, Aider, etc.) have no way to visually sketch ideas, wireframes, or architecture diagrams during a coding session. tldraw has the best canvas and shape system, but no CLI interface. This tool bridges that gap.

**Key insight:** tldraw's store layer (`createTLStore`, `@tldraw/tlschema`) is pure JavaScript with no DOM dependency. We can create and manipulate full tldraw documents in Node.js without a browser. The browser is only needed for rendering to pixels or interactive editing.

## Prior Art

- **[@kitschpatrol/tldraw-cli](https://github.com/kitschpatrol/tldraw-cli)** -- Headless export tool. Converts `.tldr` files to PNG/SVG via Puppeteer. Handles export only, not creation/manipulation. We may use or fork its export approach.
- **[tldraw/agent-template](https://github.com/tldraw/agent-template)** -- First-party AI agent SDK. Runs in-browser alongside the React editor. Good reference for shape manipulation patterns, but not CLI.
- **Excalidraw MCP servers** -- MCP-based canvas tools. Tied to MCP protocol; not usable from plain shell.

## Design Principles

1. **Files as state** -- `.tldr` files are the unit of work. No daemon, no server process for core operations. Just read file, mutate, write file.
2. **Agent-first, human-friendly** -- Optimized for programmatic use (stdin, JSON, exit codes) but also pleasant for humans (DSL, sensible defaults, `--open`).
3. **Headless by default** -- Core operations (create, add, remove, list) need zero browser. Export to PNG/SVG uses a headless browser only when needed.
4. **Composable** -- Each command does one thing. Chain them. Pipe DSL input. Script them in bash.

## Architecture

```
tldraw-cli/
├── src/
│   ├── cli.ts                 # Entry point, command routing (commander.js)
│   ├── commands/
│   │   ├── create.ts          # Create new .tldr file
│   │   ├── add.ts             # Add shapes to a canvas
│   │   ├── draw.ts            # DSL-based batch shape creation (stdin)
│   │   ├── remove.ts          # Remove shapes by ID or label
│   │   ├── list.ts            # List shapes on a canvas
│   │   ├── export.ts          # Export to PNG/SVG
│   │   ├── open.ts            # Open in browser for interactive editing
│   │   └── info.ts            # Inspect a .tldr file (schema, shape count, etc.)
│   ├── store/
│   │   ├── io.ts              # Read/write .tldr files via tldraw's parseTldrawJsonFile/serializeTldrawJson
│   │   ├── factory.ts         # Shape record builders (rect, text, arrow, etc.)
│   │   └── layout.ts          # Auto-layout helpers (stack, grid, flow)
│   ├── dsl/
│   │   ├── parser.ts          # Parse the line-based DSL
│   │   └── grammar.md         # DSL reference
│   ├── export/
│   │   ├── svg.ts             # SVG export (headless browser or custom)
│   │   └── png.ts             # PNG export (via SVG + sharp, or headless browser)
│   └── preview/
│       ├── server.ts          # Tiny local HTTP server for `open` command
│       └── viewer.html        # Minimal tldraw React app for viewing/editing
├── docs/
│   └── plan.md                # This file
├── package.json
├── tsconfig.json
└── README.md
```

## Commands

### `tldraw create <file.tldr>`

Create a new empty `.tldr` document.

```bash
tldraw create wireframe.tldr
tldraw create wireframe.tldr --name "Login Page"
```

Creates a valid `.tldr` file with a single empty page. Lightweight -- just writes the minimal JSON.

### `tldraw add <shape> [options] <file.tldr>`

Add a single shape to an existing canvas.

```bash
# Rectangles, ellipses, and other geo shapes
tldraw add rect wireframe.tldr --label "Header" --pos 0,0 --size 800x60
tldraw add rect wireframe.tldr --label "Sidebar" --pos 0,60 --size 200x500 --fill semi --color blue
tldraw add ellipse wireframe.tldr --pos 400,300 --size 100x100

# Text
tldraw add text wireframe.tldr "Login Page Wireframe" --pos 400,20 --font mono --size l

# Arrows (by label reference or explicit coords)
tldraw add arrow wireframe.tldr --from "Sidebar" --to "Content"
tldraw add arrow wireframe.tldr --from 100,300 --to 500,300

# Frames (groups with a visible border + label)
tldraw add frame wireframe.tldr --label "Auth Flow" --pos 0,0 --size 1000x600

# Notes (sticky notes)
tldraw add note wireframe.tldr "TODO: Add validation" --pos 600,400 --color yellow

# Freehand drawing
tldraw add freehand wireframe.tldr --points "0,0 50,20 100,0 150,30"
```

**Options common to all shapes:**
- `--pos x,y` -- Position (default: auto-place below last shape)
- `--size WxH` -- Dimensions (default: based on content/shape type)
- `--color <name>` -- black, blue, green, red, violet, orange, etc.
- `--fill <style>` -- none, semi, solid, pattern
- `--dash <style>` -- draw, solid, dashed, dotted
- `--label <text>` -- Label text (for referencing in arrows, remove, etc.)
- `--id <custom-id>` -- Custom shape ID (default: auto-generated)

**Output:** Prints the shape ID to stdout so it can be captured in scripts:
```bash
ID=$(tldraw add rect wireframe.tldr --label "Header" --pos 0,0 --size 800x60)
tldraw add arrow wireframe.tldr --from "$ID" --to "Footer"
```

### `tldraw draw <file.tldr>`

Batch shape creation from a simple DSL via stdin or file. This is the primary agent interface.

```bash
tldraw draw wireframe.tldr <<'EOF'
# Comments start with #
# Format: <shape> [pos] [size] [label] [options]

rect 0,0 800x60 "Header" fill=semi color=light-blue
rect 0,60 200x500 "Sidebar" fill=semi
rect 200,60 600x500 "Content"
text 400,20 "Login Page" font=mono size=l
arrow "Sidebar" -> "Content"
arrow "Header" -> "Content" color=red
note 600,400 "TODO: Add auth" color=yellow
frame 0,0 1000x600 "Main Layout"

# Stack layout helper
stack vertical 0,0 gap=20 [
  rect 800x60 "Nav"
  rect 800x400 "Body"
  rect 800x40 "Footer"
]
EOF
```

Also accepts `--file <dsl-file>`:
```bash
tldraw draw wireframe.tldr --file layout.dsl
```

And JSON mode for programmatic use:
```bash
echo '[{"type":"geo","geo":"rectangle","x":0,"y":0,"w":800,"h":60,"label":"Header"}]' | tldraw draw wireframe.tldr --json
```

### `tldraw list <file.tldr>`

List shapes in a canvas. Useful for agents to understand what's on the canvas before modifying it.

```bash
$ tldraw list wireframe.tldr
ID              TYPE    LABEL       POS         SIZE        COLOR
shape:abc123    geo     Header      0,0         800x60      black
shape:def456    geo     Sidebar     0,60        200x500     black
shape:ghi789    text    —           400,20      auto        black
shape:jkl012    arrow   —           Sidebar→Content         red

$ tldraw list wireframe.tldr --json   # Full shape records as JSON
$ tldraw list wireframe.tldr --ids    # Just IDs, one per line
```

### `tldraw remove <target> <file.tldr>`

Remove shapes by ID or label.

```bash
tldraw remove "Header" wireframe.tldr          # By label
tldraw remove shape:abc123 wireframe.tldr      # By ID
tldraw remove --all wireframe.tldr             # Clear all shapes
```

### `tldraw export <file.tldr>`

Export to image formats.

```bash
tldraw export wireframe.tldr -o wireframe.png
tldraw export wireframe.tldr -o wireframe.svg
tldraw export wireframe.tldr --format png --scale 2 -o wireframe@2x.png
```

**Implementation:** Uses Playwright to load a local tldraw instance and call `editor.getSvgString()`. Falls back to `@kitschpatrol/tldraw-cli` export path if available. PNG conversion via `sharp` or `resvg-js` from the SVG output.

Alternatively, for simple shapes (geo, text, arrows), we can generate SVG directly from store records without a browser -- this would be a fast path for common cases.

### `tldraw open <file.tldr>`

Open the canvas in a browser for interactive viewing/editing.

```bash
tldraw open wireframe.tldr                    # Open in default browser
tldraw open wireframe.tldr --port 4444        # Custom port
tldraw open wireframe.tldr --watch            # Auto-reload on file changes
tldraw open wireframe.tldr --readonly         # View only
```

**Implementation:** Starts a tiny local HTTP server that serves a minimal tldraw React app. The app loads the `.tldr` file, renders the full tldraw editor. In `--watch` mode, the server uses WebSocket to push file changes to the browser. Changes made in the browser are saved back to the file.

### `tldraw info <file.tldr>`

Inspect a `.tldr` file.

```bash
$ tldraw info wireframe.tldr
File:     wireframe.tldr
Schema:   v2
Pages:    1
Shapes:   7 (3 geo, 2 text, 1 arrow, 1 frame)
Size:     2.4 KB
```

## DSL Grammar

The DSL is intentionally simple -- easy for agents to generate, easy for humans to read.

```
# Line format:
<shape-type> [x,y] [WxH] ["label"] [key=value ...]

# Shape types:
rect          → geo shape with geo=rectangle
ellipse       → geo shape with geo=ellipse
diamond       → geo shape with geo=diamond
triangle      → geo shape with geo=triangle
star          → geo shape with geo=star
cloud         → geo shape with geo=cloud
text          → text shape
arrow         → arrow shape (uses -> syntax)
note          → note shape
frame         → frame shape
line          → line shape
freehand      → draw shape

# Arrow syntax:
arrow "Label A" -> "Label B" [key=value ...]
arrow x1,y1 -> x2,y2 [key=value ...]

# Layout helpers:
stack vertical|horizontal x,y gap=N [
  <shape> ...
  <shape> ...
]

grid x,y cols=N gap=N [
  <shape> ...
]

# Style keys:
color=black|blue|green|red|violet|orange|...
fill=none|semi|solid|pattern
dash=draw|solid|dashed|dotted
size=s|m|l|xl
font=draw|sans|serif|mono
```

## Shape Factory

The `store/factory.ts` module provides builders that handle the boilerplate of tldraw shape records.

```typescript
interface ShapeInput {
  type: 'rect' | 'ellipse' | 'text' | 'arrow' | 'note' | 'frame' | ...
  x?: number
  y?: number
  w?: number
  h?: number
  label?: string
  color?: TLDefaultColorStyle
  fill?: TLDefaultFillStyle
  dash?: TLDefaultDashStyle
  size?: TLDefaultSizeStyle
  font?: TLDefaultFontStyle
  // Arrow-specific
  fromId?: string
  toId?: string
  fromPoint?: { x: number, y: number }
  toPoint?: { x: number, y: number }
}

function createShapeRecord(input: ShapeInput, index: string): TLShape
```

This translates the clean CLI input into the full tldraw shape record with all required fields (richText structure, opacity, rotation, meta, parentId, etc.).

## Auto-Layout

For the `stack` and `grid` DSL helpers, and for auto-placement when `--pos` is omitted:

```typescript
// Stack shapes vertically or horizontally with a gap
function stackShapes(
  shapes: ShapeInput[],
  direction: 'vertical' | 'horizontal',
  origin: { x: number, y: number },
  gap: number
): ShapeInput[]

// Arrange shapes in a grid
function gridShapes(
  shapes: ShapeInput[],
  origin: { x: number, y: number },
  cols: number,
  gap: number
): ShapeInput[]

// Auto-place: find the bottom of the last shape and place below with gap
function autoPlace(store: TLStore): { x: number, y: number }
```

## Implementation Phases

**Current status (2026-02-22):**

- Phase 1: Complete
- Phase 2: Complete
- Phase 3: Complete
- Phase 4: Complete (with adjusted viewer scope; see notes)

### Execution Notes (2026-02-22)

- Phase 2 was implemented with a line-based DSL parser (`src/dsl/parser.ts`) and `draw` command (`src/commands/draw.ts`) that accepts stdin/file input plus `--json`.
- `stack` and `grid` layout helpers now exist in `src/store/layout.ts` and are used to expand layout blocks into explicit positioned shape operations.
- Layout blocks currently disallow nested `stack`/`grid` blocks and arrow instructions; this keeps parsing deterministic for MVP scope.
- Post-review hardening addressed edge cases: closing `]` lines with trailing comments, multi-word arrow targets, JSON arrow label targeting, and clearer JSON coordinate validation errors.
- Validation for this phase includes unit tests for parser/layout plus command-level draw flow tests and manual CLI smoke runs.
- Phase 3 export now uses a custom SVG renderer (`src/export/svg.ts`) for current CLI-supported shape types, plus PNG rendering via `@resvg/resvg-js` (`src/export/png.ts`).
- `tldraw export` (`src/commands/export.ts`) supports format inference, explicit format selection, PNG scaling, padding, and background color overrides.
- Export validation includes unit tests for SVG/PNG generation and manual CLI smoke export checks.
- Post-review hardening for export added explicit failure for unsupported nested/grouped shapes in fast-path SVG export and validation for format/output extension mismatches.
- Phase 4 delivers a local preview server (`src/preview/server.ts`) and `open` command (`src/commands/open.ts`) with websocket-based bidirectional file sync.
- Plan adjustment: `preview/viewer.html` is implemented as a lightweight live SVG + JSON editor (not a bundled React tldraw app) to keep Phase 4 headless-friendly and testable in CLI workflows.
- Preview validation includes websocket integration tests (server push + client save + watch mode) and a CLI smoke run for server startup/health.

### Phase 1: Core (MVP)

**Goal:** Create, add shapes, list, and produce valid `.tldr` files. No browser needed.

- [x] Project setup (package.json, tsconfig, commander.js)
- [x] `store/io.ts` -- Read/write `.tldr` files using `parseTldrawJsonFile` / `serializeTldrawJson`
- [x] `store/factory.ts` -- Shape record builders for `rect`, `ellipse`, `text`, `arrow`, `frame`, `note`
- [x] `commands/create.ts` -- Create empty `.tldr` file
- [x] `commands/add.ts` -- Add a single shape via CLI flags
- [x] `commands/list.ts` -- List shapes (table and JSON output)
- [x] `commands/remove.ts` -- Remove shapes by ID or label
- [x] `commands/info.ts` -- File inspection
- [x] Tests for store I/O, shape factory, all commands

**Deliverable:** A working CLI that creates and manipulates `.tldr` files entirely headlessly. Files can be opened in tldraw.com to verify correctness.

### Phase 2: DSL + Batch Operations

**Goal:** The `draw` command with DSL input -- the primary agent interface.

- [x] `dsl/parser.ts` -- Line-based DSL parser
- [x] `commands/draw.ts` -- Batch shape creation from DSL (stdin, file, or `--json`)
- [x] `store/layout.ts` -- `stack` and `grid` layout helpers
- [x] Auto-placement logic (when pos is omitted)
- [x] Tests for DSL parsing and layout

**Deliverable:** Agents can generate a DSL string and pipe it to `tldraw draw` to produce complete wireframes in one shot.

### Phase 3: Export

**Goal:** Render `.tldr` files to PNG and SVG.

- [x] `export/svg.ts` -- SVG export
  - Fast path: custom SVG generation for simple geo/text shapes (no browser)
  - Full path: Playwright-based export for complex documents
- [x] `export/png.ts` -- PNG from SVG via `sharp` or `resvg-js`
- [x] `commands/export.ts` -- CLI wrapper with format detection, scale options
- [x] Tests for export output

**Deliverable:** `tldraw export wireframe.tldr -o wireframe.png` produces a clean image.

### Phase 4: Live Preview

**Goal:** Interactive browser-based viewing and editing.

- [x] `preview/server.ts` -- Local HTTP server with WebSocket for file sync
- [x] `preview/viewer.html` -- Lightweight live SVG + JSON viewer/editor
- [x] `commands/open.ts` -- Open command with `--watch`, `--readonly`, `--port`
- [x] Bidirectional sync: file changes push to browser, browser changes save to file

**Deliverable:** `tldraw open wireframe.tldr` starts a local synced preview/editor in the browser with live file round-tripping.

## Tech Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | TypeScript | Type safety, tldraw is TS-native |
| CLI framework | commander.js | Lightweight, widely used, good subcommand support |
| tldraw core | `tldraw` (v4.x) | Re-exports store, schema, everything we need |
| SVG→PNG | `@resvg/resvg-js` | Pure Wasm, no native deps, correct SVG rendering |
| Headless browser | Playwright | For full-fidelity export when custom SVG isn't enough |
| Preview server | Node http + ws | No framework needed, tiny footprint |
| Preview bundler | esbuild | Fast, bundles the tldraw React viewer |
| Test framework | vitest | Fast, TS-native |

## Packaging

- Published as `tldraw-cli` on npm
- `npx tldraw-cli create myfile.tldr` works immediately
- `bin` field in package.json points to compiled CLI
- Playwright is an optional peer dependency (only needed for export)
- The preview viewer HTML/JS is pre-bundled at build time

## Open Questions

1. **Arrow binding** -- tldraw arrows can "bind" to shapes (the arrow endpoint sticks to the shape). When doing `arrow "Sidebar" -> "Content"`, should we create proper bindings or just compute the center points? Bindings are more correct but require creating binding records. **Recommendation: create proper bindings** -- it's what makes the `.tldr` files useful when opened in tldraw.

2. **richText vs plain text** -- tldraw v4 uses ProseMirror-style richText for labels. Our factory needs to wrap plain strings in the richText document structure. This is straightforward but worth noting.

3. **Index ordering** -- tldraw uses fractional indexing (`a1`, `a1V`, `a2`, etc.) for z-ordering. We need to generate valid indices. tldraw exports `getIndexAbove`, `getIndexBetween` etc. for this.

4. **Custom SVG export scope** -- How much of tldraw's rendering should we replicate in the custom SVG fast path? Proposal: Start with geo shapes (rectangles, ellipses) + text + arrows + frames. Skip: freehand, images, embeds. These cover 90% of wireframing use cases.

5. **License** -- tldraw v4 requires a license key for production deployments. The CLI itself doesn't render tldraw (except in `export` and `open`). Need to clarify: does headless Playwright export count as a "deployment"? The `open` command definitely needs consideration. **Recommendation: document this clearly, let users provide their own key via env var.**
