import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, test } from 'vitest'

import { addShapeToFile } from '../../src/commands/add.js'
import { createFile } from '../../src/commands/create.js'
import { exportFile } from '../../src/commands/export.js'

describe('export command', () => {
  test('exports SVG output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'canvas.tldr')
    const svgPath = join(dir, 'canvas.svg')

    await createFile(filePath)
    await addShapeToFile('rect', filePath, undefined, { label: 'Header', pos: '0,0', size: '240x60' })
    await addShapeToFile('text', filePath, 'Login', { pos: '16,16' })

    const result = await exportFile(filePath, { output: svgPath })
    expect(result.format).toBe('svg')

    const svg = await readFile(svgPath, 'utf8')
    expect(svg).toContain('<svg')
    expect(svg).toContain('Header')
    expect(svg).toContain('Login')
  })

  test('exports PNG output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'canvas.tldr')
    const pngPath = join(dir, 'canvas.png')

    await createFile(filePath)
    await addShapeToFile('rect', filePath, undefined, { label: 'Card', pos: '0,0', size: '200x100' })

    const result = await exportFile(filePath, { output: pngPath, scale: '2' })
    expect(result.format).toBe('png')

    const png = await readFile(pngPath)
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.length).toBeGreaterThan(100)
  })

  test('uses explicit format when output path is omitted', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'canvas.tldr')

    await createFile(filePath)
    await addShapeToFile('note', filePath, 'Todo', { pos: '40,40' })

    const result = await exportFile(filePath, { format: 'svg' })
    expect(result.outputPath.endsWith('.svg')).toBe(true)

    const svg = await readFile(result.outputPath, 'utf8')
    expect(svg).toContain('<svg')
  })
})
