import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, test } from 'vitest'

import {
  createEmptyStore,
  getCurrentPageId,
  getShapesOnPage,
  readTldrawFile,
  writeTldrawFile
} from '../../src/store/io.js'

describe('store/io', () => {
  test('creates and reads canonical .tldr files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'canvas.tldr')

    const { store } = createEmptyStore('Test Canvas')
    await writeTldrawFile(filePath, store)

    const json = JSON.parse(await readFile(filePath, 'utf8'))
    expect(json.tldrawFileFormatVersion).toBe(1)
    expect(Array.isArray(json.records)).toBe(true)

    const loaded = await readTldrawFile(filePath)
    const pageId = getCurrentPageId(loaded)
    expect(getShapesOnPage(loaded, pageId)).toHaveLength(0)
  })

  test('rejects non-tldraw JSON files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'broken.tldr')

    await writeFile(filePath, JSON.stringify({ foo: 'bar' }), 'utf8')

    await expect(readTldrawFile(filePath)).rejects.toThrow('tldrawFileFormatVersion')
  })
})
