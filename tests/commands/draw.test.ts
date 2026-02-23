import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import type { TLArrowBinding, TLFrameShape, TLGeoShape } from '@tldraw/tlschema'
import { describe, expect, test } from 'vitest'

import { createFile } from '../../src/commands/create.js'
import { drawFromDsl, drawFromJson } from '../../src/commands/draw.js'
import { listShapes, toShapeListRows } from '../../src/commands/list.js'
import { readTldrawFile } from '../../src/store/io.js'

describe('draw command', () => {
  test('draws a DSL document and resolves arrow labels', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'draw-dsl.tldr')

    await createFile(filePath)

    const ids = await drawFromDsl(
      filePath,
      `
        rect 0,0 300x60 "Header"
        rect 0,100 300x200 "Content"
        arrow "Header" -> "Content"
      `
    )

    expect(ids).toHaveLength(3)

    const shapes = await listShapes(filePath)
    const rows = toShapeListRows(shapes)
    expect(rows).toHaveLength(3)
    expect(rows.find((row) => row.label === 'Header')?.type).toBe('geo')
    expect(rows.find((row) => row.label === 'Content')?.type).toBe('geo')
    expect(rows.find((row) => row.type === 'arrow')).toBeDefined()
  })

  test('draws stack and grid layouts from DSL', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'draw-layouts.tldr')

    await createFile(filePath)

    await drawFromDsl(
      filePath,
      `
        stack vertical 10,20 gap=10 [
          rect 100x20 "S1"
          rect 100x20 "S2"
        ]

        grid 200,20 cols=2 gap=10 [
          rect 50x20 "G1"
          rect 80x20 "G2"
          rect 60x20 "G3"
        ]
      `
    )

    const rows = toShapeListRows(await listShapes(filePath))
    expect(rows.find((row) => row.label === 'S1')?.pos).toBe('10,20')
    expect(rows.find((row) => row.label === 'S2')?.pos).toBe('10,50')
    expect(rows.find((row) => row.label === 'G1')?.pos).toBe('200,20')
    expect(rows.find((row) => row.label === 'G2')?.pos).toBe('270,20')
    expect(rows.find((row) => row.label === 'G3')?.pos).toBe('200,50')
  })

  test('accepts JSON input in TL-like format', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'draw-json.tldr')

    await createFile(filePath)

    await drawFromJson(
      filePath,
      JSON.stringify([
        {
          geo: 'rectangle',
          h: 60,
          label: 'Header',
          type: 'geo',
          w: 300,
          x: 0,
          y: 0
        },
        {
          text: 'Page Title',
          type: 'text',
          x: 10,
          y: 10
        }
      ])
    )

    const rows = toShapeListRows(await listShapes(filePath))
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.label === 'Header')).toBeDefined()
    expect(rows.find((row) => row.type === 'text')?.label).toBe('Page Title')
  })

  test('supports JSON arrows that target labels', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'draw-json-arrow.tldr')

    await createFile(filePath)

    await drawFromJson(
      filePath,
      JSON.stringify([
        { h: 40, label: 'Header', shape: 'rect', w: 240, x: 0, y: 0 },
        { h: 120, label: 'Body', shape: 'rect', w: 240, x: 0, y: 100 },
        { from: 'Header', shape: 'arrow', to: 'Body' }
      ])
    )

    const rows = toShapeListRows(await listShapes(filePath))
    expect(rows.find((row) => row.type === 'arrow')).toBeDefined()
  })

  test('rejects partial coordinate geometry in JSON mode', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'draw-json-invalid.tldr')

    await createFile(filePath)

    await expect(
      drawFromJson(filePath, JSON.stringify([{ shape: 'rect', w: 200, x: 0, y: 0 }]))
    ).rejects.toThrow('must provide both w and h')
  })

  test('auto-sizes rect to fit long label text', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'draw-autosize.tldr')

    await createFile(filePath)

    await drawFromDsl(
      filePath,
      'rect 0,0 "This is a very long label that should cause the shape to expand beyond its default width"'
    )

    const shapes = await listShapes(filePath)
    const rect = shapes.find((s) => s.type === 'geo') as TLGeoShape | undefined
    expect(rect).toBeDefined()
    // Default rect width is 220; this label should force it wider
    expect(rect!.props.w).toBeGreaterThan(220)
  })

  test('preserves explicit dimensions when label already fits', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'draw-explicit-dims.tldr')

    await createFile(filePath)

    // Explicit 300x100 — large enough that "Short" label won't trigger expansion
    await drawFromDsl(filePath, 'rect 0,0 300x100 "Short"')

    const shapes = await listShapes(filePath)
    const rect = shapes.find((s) => s.type === 'geo') as TLGeoShape | undefined
    expect(rect).toBeDefined()
    expect(rect!.props.w).toBe(300)
    expect(rect!.props.h).toBe(100)
  })

  test('auto-sizes ellipse to fit long label text', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'draw-autosize-ellipse.tldr')

    await createFile(filePath)

    await drawFromDsl(
      filePath,
      'ellipse 0,0 "This is a very long label that should cause the ellipse to expand beyond default"'
    )

    const shapes = await listShapes(filePath)
    const ellipse = shapes.find((s) => s.type === 'geo') as TLGeoShape | undefined
    expect(ellipse).toBeDefined()
    // Default ellipse is 120x120; this label should force it wider
    expect(ellipse!.props.w).toBeGreaterThan(120)
  })

  test('expands frame to encompass contained shapes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'draw-frame-expand.tldr')

    await createFile(filePath)

    // Frame is 400x200, but children extend to x=500+
    await drawFromDsl(
      filePath,
      `
        frame 0,0 400x200 "Legend"
        rect 20,40 "Complete" color=green fill=solid
        rect 250,40 "In Progress" color=blue
        rect 480,40 "Blocked" color=red
      `
    )

    const shapes = await listShapes(filePath)
    const frame = shapes.find((s) => s.type === 'frame') as TLFrameShape | undefined
    expect(frame).toBeDefined()
    // The frame should have expanded to encompass the rightmost rect
    expect(frame!.props.w).toBeGreaterThan(400)
  })

  test('does not expand frame for shapes far outside it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'draw-frame-no-expand.tldr')

    await createFile(filePath)

    // Shape is placed at (0, 1000) — far outside the (500,500 200x100) frame
    await drawFromDsl(
      filePath,
      `
        frame 500,500 200x100 "Isolated"
        rect 0,0 "Distant"
      `
    )

    const shapes = await listShapes(filePath)
    const frame = shapes.find((s) => s.type === 'frame') as TLFrameShape | undefined
    expect(frame).toBeDefined()
    // Frame should NOT have expanded
    expect(frame!.props.w).toBe(200)
    expect(frame!.props.h).toBe(100)
  })

  test('creates arrow bindings when arrow targets shapes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'draw-arrow-bindings.tldr')

    await createFile(filePath)

    const ids = await drawFromDsl(
      filePath,
      `
        rect 0,0 200x80 "Source"
        rect 0,200 200x80 "Target"
        arrow "Source" -> "Target"
      `
    )

    const arrowId = ids[2]
    const store = await readTldrawFile(filePath)
    const bindings = store
      .allRecords()
      .filter((r): r is TLArrowBinding => r.typeName === 'binding' && r.type === 'arrow')

    // Should have two bindings: one for start, one for end
    expect(bindings).toHaveLength(2)

    const startBinding = bindings.find((b) => b.props.terminal === 'start')
    const endBinding = bindings.find((b) => b.props.terminal === 'end')

    expect(startBinding).toBeDefined()
    expect(startBinding!.fromId).toBe(arrowId)
    expect(startBinding!.props.isExact).toBe(false)
    expect(startBinding!.props.isPrecise).toBe(false)
    expect(startBinding!.props.snap).toBe('none')

    expect(endBinding).toBeDefined()
    expect(endBinding!.fromId).toBe(arrowId)
    expect(endBinding!.props.isExact).toBe(false)
    expect(endBinding!.props.isPrecise).toBe(false)
    expect(endBinding!.props.snap).toBe('none')

    // Start binding should point to "Source", end binding to "Target"
    const shapes = await listShapes(filePath)
    const sourceId = ids[0]
    const targetId = ids[1]
    const geoShapeIds = shapes.filter((s) => s.type === 'geo').map((s) => s.id)
    expect(geoShapeIds).toHaveLength(2)
    expect(startBinding!.toId).toBe(sourceId)
    expect(endBinding!.toId).toBe(targetId)
  })

  test('creates one binding for mixed arrow target (shape + coordinate)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'draw-arrow-mixed.tldr')

    await createFile(filePath)

    await drawFromDsl(
      filePath,
      `
        rect 0,0 200x80 "Source"
        arrow "Source" -> 300,300
      `
    )

    const store = await readTldrawFile(filePath)
    const bindings = store
      .allRecords()
      .filter((r): r is TLArrowBinding => r.typeName === 'binding' && r.type === 'arrow')

    // Only the shape-targeted end (start) should have a binding
    expect(bindings).toHaveLength(1)
    expect(bindings[0].props.terminal).toBe('start')
  })

  test('does not create bindings for coordinate-based arrows', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'draw-arrow-no-bindings.tldr')

    await createFile(filePath)

    await drawFromDsl(
      filePath,
      'arrow 0,0 -> 200,200'
    )

    const store = await readTldrawFile(filePath)
    const bindings = store
      .allRecords()
      .filter((r) => r.typeName === 'binding')

    expect(bindings).toHaveLength(0)
  })
})
