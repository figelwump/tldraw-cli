import { watch as fsWatch } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { fileURLToPath } from 'node:url'

import WebSocket, { WebSocketServer } from 'ws'

type PreviewDocument = {
  records: Array<Record<string, unknown>>
  schema: Record<string, unknown>
  tldrawFileFormatVersion: number
}

type PreviewServerConfig = {
  filePath: string
  port: number
  readonly?: boolean
  watch?: boolean
}

export type PreviewServerHandle = {
  close: () => Promise<void>
  port: number
  url: string
}

type ServerToClientMessage =
  | {
      document: PreviewDocument
      readonly: boolean
      type: 'document'
    }
  | {
      message: string
      type: 'error'
    }
  | {
      type: 'saved'
    }

type ClientToServerMessage =
  | {
      document: unknown
      type: 'save'
    }
  | {
      type: 'ping'
    }

type PreviewSocket = WebSocket

const VIEWER_HTML_PATH_CANDIDATES = [
  fileURLToPath(new URL('./viewer.html', import.meta.url)),
  fileURLToPath(new URL('../../src/preview/viewer.html', import.meta.url))
]

const TLDRAW_BUNDLE_PATH_CANDIDATES = [
  fileURLToPath(new URL('./tldraw-bundle.js', import.meta.url)),
  fileURLToPath(new URL('../../dist/preview/tldraw-bundle.js', import.meta.url))
]

// Resolve tldraw.css from the tldraw package root in node_modules.
// The CSS lives at the package root, not in dist-esm/.
function findTldrawCssPath(): string {
  try {
    const tldrawEntry = import.meta.resolve('tldraw')
    // Walk up from dist-esm/index.mjs to the package root
    const tldrawPkgDir = fileURLToPath(new URL('..', tldrawEntry))
    return `${tldrawPkgDir}/tldraw.css`
  } catch {
    return fileURLToPath(new URL('../../node_modules/tldraw/tldraw.css', import.meta.url))
  }
}

function ensureObject(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message)
  }
}

function toPreviewDocument(value: unknown): PreviewDocument {
  ensureObject(value, 'Preview message must be an object')

  const records = value.records
  const schema = value.schema
  const version = value.tldrawFileFormatVersion

  if (!Array.isArray(records)) {
    throw new Error('Invalid preview document: records must be an array')
  }

  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error('Invalid preview document: schema must be an object')
  }

  if (typeof version !== 'number' || !Number.isInteger(version) || version <= 0) {
    throw new Error('Invalid preview document: tldrawFileFormatVersion must be a positive integer')
  }

  return {
    records: records as Array<Record<string, unknown>>,
    schema: schema as Record<string, unknown>,
    tldrawFileFormatVersion: version
  }
}

async function readPreviewDocument(filePath: string): Promise<PreviewDocument> {
  const raw = await readFile(filePath, 'utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`File is not valid JSON: ${filePath}`)
  }

  return toPreviewDocument(parsed)
}

function parseClientMessage(raw: string): ClientToServerMessage {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Preview message is not valid JSON')
  }

  ensureObject(parsed, 'Preview message must be an object')
  const type = parsed.type

  if (type === 'ping') {
    return { type: 'ping' }
  }

  if (type === 'save') {
    return {
      document: parsed.document,
      type: 'save'
    }
  }

  throw new Error('Unsupported preview message type')
}

function sendMessage(ws: PreviewSocket, message: ServerToClientMessage): void {
  if (ws.readyState !== ws.OPEN) {
    return
  }

  ws.send(JSON.stringify(message))
}

function renderViewerHtml(template: string, config: { readonly: boolean }): string {
  const script = `<script>window.__TLDRAW_PREVIEW_CONFIG__=${JSON.stringify(config)};</script>`
  return template.replace('<!--__TLDRAW_PREVIEW_CONFIG__-->', script)
}

async function readViewerTemplate(): Promise<string> {
  for (const candidate of VIEWER_HTML_PATH_CANDIDATES) {
    try {
      return await readFile(candidate, 'utf8')
    } catch {
      // Try next candidate.
    }
  }

  throw new Error('Unable to locate preview/viewer.html template file')
}

async function readStaticFile(candidates: string[]): Promise<Buffer> {
  for (const candidate of candidates) {
    try {
      return await readFile(candidate)
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(`Unable to locate static file (tried: ${candidates.join(', ')})`)
}

export async function startPreviewServer(config: PreviewServerConfig): Promise<PreviewServerHandle> {
  const viewerTemplate = await readViewerTemplate()
  const tldrawBundle = await readStaticFile(TLDRAW_BUNDLE_PATH_CANDIDATES)
  const tldrawCss = await readFile(findTldrawCssPath())
  const readonly = config.readonly ?? false
  const watchFile = config.watch ?? false
  const clients = new Set<PreviewSocket>()
  const sockets = new Set<Socket>()
  let publishQueue: Promise<void> = Promise.resolve()
  let lastSelfWriteAt = 0

  const publishDocument = async (exclude?: PreviewSocket) => {
    const runPublish = async () => {
      const document = await readPreviewDocument(config.filePath)
      const message: ServerToClientMessage = {
        document,
        readonly,
        type: 'document'
      }

      for (const client of clients) {
        if (client !== exclude) {
          sendMessage(client, message)
        }
      }
    }

    publishQueue = publishQueue.then(runPublish, runPublish)
    await publishQueue
  }

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const requestUrl = request.url ?? '/'

    if (requestUrl === '/' || requestUrl.startsWith('/?')) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(renderViewerHtml(viewerTemplate, { readonly }))
      return
    }

    if (requestUrl === '/tldraw-bundle.js') {
      response.writeHead(200, {
        'cache-control': 'public, max-age=31536000, immutable',
        'content-type': 'application/javascript; charset=utf-8'
      })
      response.end(tldrawBundle)
      return
    }

    if (requestUrl === '/tldraw.css') {
      response.writeHead(200, {
        'cache-control': 'public, max-age=31536000, immutable',
        'content-type': 'text/css; charset=utf-8'
      })
      response.end(tldrawCss)
      return
    }

    if (requestUrl === '/health') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ ok: true }))
      return
    }

    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
  })

  const wsServer = new WebSocketServer({ noServer: true })

  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => {
      sockets.delete(socket)
    })
  })

  server.on('upgrade', (request, socket, head) => {
    const requestUrl = request.url ?? ''
    if (!requestUrl.startsWith('/ws')) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }

    wsServer.handleUpgrade(request, socket, head, (ws: PreviewSocket) => {
      wsServer.emit('connection', ws, request)
    })
  })

  wsServer.on('connection', async (ws: PreviewSocket) => {
    clients.add(ws)

    ws.on('close', () => {
      clients.delete(ws)
    })

    ws.on('error', () => {
      clients.delete(ws)
    })

    ws.on('message', async (payload: WebSocket.RawData) => {
      try {
        const message = parseClientMessage(String(payload))

        if (message.type === 'ping') {
          return
        }

        if (readonly) {
          sendMessage(ws, {
            message: 'Preview is in readonly mode; save operations are disabled.',
            type: 'error'
          })
          return
        }

        const document = toPreviewDocument(message.document)
        lastSelfWriteAt = Date.now()
        await writeFile(config.filePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
        await publishDocument(ws)
        sendMessage(ws, { type: 'saved' })
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error)
        sendMessage(ws, { message: messageText, type: 'error' })
      }
    })

    try {
      const document = await readPreviewDocument(config.filePath)
      sendMessage(ws, {
        document,
        readonly,
        type: 'document'
      })
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error)
      sendMessage(ws, { message: messageText, type: 'error' })
    }
  })

  const watcher = watchFile
    ? fsWatch(config.filePath, { persistent: false }, async (event) => {
        if (event !== 'change' && event !== 'rename') {
          return
        }

        if (Date.now() - lastSelfWriteAt < 300) {
          return
        }

        try {
          await publishDocument()
        } catch {
          // Ignore transient read/parse failures while the file is being written.
        }
      })
    : null

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.port, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine preview server address')
  }

  const port = address.port
  const url = `http://127.0.0.1:${port}`

  return {
    close: async () => {
      watcher?.close()
      wsServer.clients.forEach((client: PreviewSocket) => {
        try {
          client.close()
        } catch {
          // Ignore close errors.
        }
      })

      for (const socket of sockets) {
        socket.destroy()
      }

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      })
    },
    port,
    url
  }
}
