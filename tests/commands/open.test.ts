import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, test } from 'vitest'
import { WebSocket } from 'ws'

import { createFile } from '../../src/commands/create.js'
import { startOpenSession } from '../../src/commands/open.js'

type OpenMessage =
  | { type: 'document'; readonly: boolean; document: unknown; svg: string }
  | { type: 'saved' }
  | { type: 'error'; message: string }

function openWebSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.once('open', () => resolve(ws))
    ws.once('error', (error) => reject(error))
  })
}

function waitForOpenMessage(
  ws: WebSocket,
  predicate: (message: OpenMessage) => boolean
): Promise<OpenMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out waiting for websocket message'))
    }, 5000)

    const onMessage = (payload: Buffer) => {
      let parsed: OpenMessage
      try {
        parsed = JSON.parse(payload.toString('utf8')) as OpenMessage
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

describe('open command', () => {
  test('starts a readonly preview session', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tldraw-cli-'))
    const filePath = join(dir, 'readonly-preview.tldr')
    await createFile(filePath)

    const session = await startOpenSession(filePath, {
      browser: false,
      port: '0',
      readonly: true
    })

    try {
      const ws = await openWebSocket(`${session.url.replace('http', 'ws')}/ws`)
      try {
        const initial = await waitForOpenMessage(ws, (message) => message.type === 'document')
        expect(initial.type).toBe('document')
        if (initial.type !== 'document') {
          throw new Error('Expected initial document message')
        }

        expect(initial.readonly).toBe(true)

        ws.send(
          JSON.stringify({
            document: initial.document,
            type: 'save'
          })
        )

        const error = await waitForOpenMessage(ws, (message) => message.type === 'error')
        expect(error.type).toBe('error')
        if (error.type !== 'error') {
          throw new Error('Expected readonly error message')
        }

        expect(error.message).toContain('readonly')
      } finally {
        ws.close()
      }
    } finally {
      await session.close()
    }
  })
})
