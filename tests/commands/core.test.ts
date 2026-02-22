import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, test } from 'vitest'

import { addShapeToFile } from '../../src/commands/add.js'
import { createFile } from '../../src/commands/create.js'
import { inspectFile } from '../../src/commands/info.js'
import { listShapes, toShapeListRows } from '../../src/commands/list.js'
import { removeShapesFromFile, resolveRemoveInvocation } from '../../src/commands/remove.js'

describe('command flows', () => {
  test('create -> add -> list -> remove -> info', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'flow.tldr')

    await createFile(filePath, { name: 'Flow Test' })

    const headerId = await addShapeToFile('rect', filePath, undefined, {
      label: 'Header',
      pos: '0,0',
      size: '800x60'
    })

    await addShapeToFile('rect', filePath, undefined, {
      label: 'Content',
      pos: '0,90',
      size: '800x400'
    })

    const arrowId = await addShapeToFile('arrow', filePath, undefined, {
      from: 'Header',
      to: 'Content'
    })

    const listed = await listShapes(filePath)
    const rows = toShapeListRows(listed)
    expect(rows).toHaveLength(3)
    expect(rows.find((row) => row.id === headerId)?.label).toBe('Header')
    expect(rows.find((row) => row.id === arrowId)?.type).toBe('arrow')

    const removed = await removeShapesFromFile(filePath, 'Header')
    expect(removed).toEqual([headerId])

    const info = await inspectFile(filePath)
    expect(info.shapes).toBe(2)
    expect(info.shapeTypeCounts.geo).toBe(1)
    expect(info.shapeTypeCounts.arrow).toBe(1)
  })

  test('remove --all flow removes every shape', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'remove-all.tldr')

    await createFile(filePath)
    await addShapeToFile('note', filePath, 'Todo item', { pos: '10,10' })
    await addShapeToFile('text', filePath, 'Title', { pos: '10,100' })

    const removed = await removeShapesFromFile(filePath, undefined, { all: true })
    expect(removed).toHaveLength(2)

    const remaining = await listShapes(filePath)
    expect(remaining).toHaveLength(0)
  })

  test('rejects ambiguous remove --all invocation with extra target', () => {
    expect(() => resolveRemoveInvocation('Header', 'canvas.tldr', { all: true })).toThrow(
      'When using --all'
    )
  })

  test('rejects malformed --size values that look like dimensions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'bad-size.tldr')

    await createFile(filePath)
    await expect(addShapeToFile('rect', filePath, undefined, { size: '10x' })).rejects.toThrow(
      'Invalid --size'
    )
  })
})
