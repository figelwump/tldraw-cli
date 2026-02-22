---
name: tldraw
description: Create and iterate visual canvases with the tldraw CLI for UI/UX and architecture work, with live preview updates.
---

# tldraw Skill

Use this skill when the user wants visual thinking artifacts such as wireframes, flows, journey maps, or architecture diagrams.

## Session Conventions

- Use `.tldraw/` at the repo root as the canvas workspace.
- Create `.tldraw/` first if it does not exist.
- Create a new `.tldr` file per session using a timestamped name like `.tldraw/session-YYYYMMDD-HHMMSS-<topic>.tldr`.
- If the user supplies a file path/name, use it instead.
- For iterative work in the same session, keep updating the same session file unless the user asks for a new one.

## Workflow

1. Ensure `.tldraw/` exists and create the session file with `tldraw create <file>`.
2. Start or reuse live preview in the background so work can continue (for example, `tldraw open <file> --watch --no-browser` as a background process).
3. Capture the preview URL from stdout and share it with the user.
4. Draw in small increments:
   - use `tldraw draw` for bulk structure
   - use `tldraw add/remove` for precise updates
5. Keep labels stable and unique so references (especially arrows and edits) remain reliable.
6. Validate after each meaningful change with `tldraw list` (and `tldraw info` when useful).
7. Summarize what changed and what the diagram now communicates.

## Command Reference

| Command | Usage |
|---------|-------|
| `create` | `tldraw create <file>` |
| `draw` | `tldraw draw <file>` from stdin, or `tldraw draw <file> --file <dsl-file>`, or `tldraw draw <file> --json` |
| `add` | `tldraw add <shape> <file> [content] [--pos x,y] [--size WxH]` |
| `remove` | `tldraw remove <id-or-label> <file>` or `tldraw remove --all <file>` |
| `list` | `tldraw list <file> [--json | --ids]` |
| `info` | `tldraw info <file>` |
| `export` | `tldraw export <file> [-o out.svg|out.png] [--format png|svg] [--scale 2]` |
| `open` | `tldraw open <file> [--watch] [--readonly] [--port <n>] [--no-browser]` |

## DSL Quick Reference

- Shapes: `rect`, `ellipse`, `text`, `note`, `arrow`, `frame`
- Base line: `<shape> [x,y] [WxH] ["label"] [key=value ...]`
- Arrow line: `arrow "Source Label" -> "Target Label" [key=value ...]`
- Style keys: `color=...`, `fill=none|semi|solid|pattern`, `dash=draw|solid|dashed|dotted`, `font=draw|sans|serif|mono`
- Layout blocks:
  - `stack vertical|horizontal <x,y> gap=<n> [ ... ]`
  - `grid <x,y> cols=<n> gap=<n> [ ... ]`
- Current parser constraints:
  - no nested layout blocks
  - no arrows inside `stack` or `grid`

## Diagram Guidelines

- Begin with simple primitives (`rect`, `ellipse`, `text`, `note`, `arrow`, `frame`) before stylistic detail.
- Prefer `stack` / `grid` in DSL for consistent spacing.
- Use concise semantic labels (e.g. `Auth API`, `Session Store`, `Checkout Form`).
- For alternatives, create clearly separated frames rather than overloading one canvas section.

## Gotchas

- Keep labels unique to avoid ambiguous arrow targets and edits.
- `remove` label matching is exact; use `tldraw list` to verify label text first.
- Fast-path SVG export currently fails for nested/grouped shapes; keep shapes as direct page children if export is required.

## Example

```bash
SESSION_FILE=".tldraw/session-$(date +%Y%m%d-%H%M%S)-auth-flow.tldr"
tldraw create "$SESSION_FILE"
tldraw draw "$SESSION_FILE" <<'EOF'
frame 0,0 1100x700 "Auth Flow"
rect 80,120 260x120 "Sign In"
rect 420,120 260x120 "Auth API"
rect 760,120 260x120 "User DB"
arrow "Sign In" -> "Auth API"
arrow "Auth API" -> "User DB"
EOF
```

## Expected Handoff

Return these items after drawing work:

- session file path
- preview URL (or reopen command)
- concise change summary of what was added/updated
- optional export paths (`.svg` / `.png`) when requested
