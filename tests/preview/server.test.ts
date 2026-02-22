import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, test } from 'vitest'
import { WebSocket } from 'ws'

import { addShapeToFile } from '../../src/commands/add.js'
import { createFile } from '../../src/commands/create.js'
import { startPreviewServer } from '../../src/preview/server.js'

type PreviewDocumentMessage = {
  document: {
    records: Array<Record<string, unknown>>
    schema: Record<string, unknown>
    tldrawFileFormatVersion: number
  }
  readonly: boolean
  svg: string
  type: 'document'
}

type PreviewMessage = PreviewDocumentMessage | { type: 'error'; message: string } | { type: 'saved' }

function openWebSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.once('open', () => resolve(ws))
    ws.once('error', (error) => reject(error))
  })
}

function waitForMessage(
  ws: WebSocket,
  predicate: (message: PreviewMessage) => boolean,
  timeoutMs = 5000
): Promise<PreviewMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out waiting for preview websocket message'))
    }, timeoutMs)

    const onMessage = (payload: Buffer) => {
      let parsed: PreviewMessage
      try {
        parsed = JSON.parse(payload.toString('utf8')) as PreviewMessage
      } catch {
        return
      }

      if (!predicate(parsed)) {
        return
      }

      cleanup()
      resolve(parsed)
    }

    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }

    const cleanup = () => {
      clearTimeout(timeout)
      ws.off('message', onMessage)
      ws.off('error', onError)
    }

    ws.on('message', onMessage)
    ws.on('error', onError)
  })
}

function getDocumentRecord(document: PreviewDocumentMessage['document']): Record<string, unknown> | null {
  return (
    document.records.find((record) => record.typeName === 'document' && record.id === 'document:document') ??
    null
  )
}

describe('preview server', () => {
  test('serves health endpoint and websocket document payload', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'preview.tldr')
    await createFile(filePath)

    const server = await startPreviewServer({ filePath, port: 0 })

    try {
      const health = await fetch(`${server.url}/health`)
      expect(health.ok).toBe(true)
      expect(await health.json()).toEqual({ ok: true })

      const ws = await openWebSocket(`${server.url.replace('http', 'ws')}/ws`)
      try {
        const message = await waitForMessage(ws, (payload) => payload.type === 'document')
        expect(message.type).toBe('document')
        if (message.type !== 'document') {
          throw new Error('Unexpected message type')
        }

        expect(message.document.tldrawFileFormatVersion).toBe(1)
        expect(message.svg).toContain('<svg')
      } finally {
        ws.close()
      }
    } finally {
      await server.close()
    }
  })

  test('persists client save and broadcasts updates to peers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'sync-save.tldr')
    await createFile(filePath)

    const server = await startPreviewServer({ filePath, port: 0 })
    try {
      const wsA = await openWebSocket(`${server.url.replace('http', 'ws')}/ws`)
      const wsB = await openWebSocket(`${server.url.replace('http', 'ws')}/ws`)

      try {
        const initialA = await waitForMessage(wsA, (payload) => payload.type === 'document')
        await waitForMessage(wsB, (payload) => payload.type === 'document')

        if (initialA.type !== 'document') {
          throw new Error('Expected initial document message')
        }

        const editedDocument = JSON.parse(JSON.stringify(initialA.document)) as PreviewDocumentMessage['document']
        const documentRecord = getDocumentRecord(editedDocument)
        if (!documentRecord) {
          throw new Error('Missing document record in preview payload')
        }

        documentRecord.name = 'Edited from websocket'

        const savedPromise = waitForMessage(wsA, (payload) => payload.type === 'saved')
        const broadcastPromise = waitForMessage(
          wsB,
          (payload) =>
            payload.type === 'document' &&
            getDocumentRecord(payload.document)?.name === 'Edited from websocket'
        )

        wsA.send(
          JSON.stringify({
            document: editedDocument,
            type: 'save'
          })
        )

        await savedPromise
        const broadcast = await broadcastPromise

        expect(broadcast.type).toBe('document')

        const filePayload = JSON.parse(await readFile(filePath, 'utf8')) as PreviewDocumentMessage['document']
        expect(getDocumentRecord(filePayload)?.name).toBe('Edited from websocket')
      } finally {
        wsA.close()
        wsB.close()
      }
    } finally {
      await server.close()
    }
  }, 10000)

  test('pushes file-change updates when watch mode is enabled', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'watch-mode.tldr')
    await createFile(filePath)

    const server = await startPreviewServer({ filePath, port: 0, watch: true })
    try {
      const ws = await openWebSocket(`${server.url.replace('http', 'ws')}/ws`)
      try {
        const initial = await waitForMessage(ws, (payload) => payload.type === 'document')
        if (initial.type !== 'document') {
          throw new Error('Expected initial document message')
        }

        const initialShapeCount = initial.document.records.filter(
          (record) => record.typeName === 'shape'
        ).length

        await addShapeToFile('rect', filePath, undefined, { label: 'Watched', pos: '0,0', size: '100x60' })

        const updated = await waitForMessage(
          ws,
          (payload) =>
            payload.type === 'document' &&
            payload.document.records.filter((record) => record.typeName === 'shape').length >
              initialShapeCount
        )

        expect(updated.type).toBe('document')
      } finally {
        ws.close()
      }
    } finally {
      await server.close()
    }
  })
})
