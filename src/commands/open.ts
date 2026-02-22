import { spawn } from 'node:child_process'

import type { Command } from 'commander'

import { startPreviewServer, type PreviewServerHandle } from '../preview/server.js'

type OpenCommandOptions = {
  browser?: boolean
  port?: string
  readonly?: boolean
  watch?: boolean
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return 4444
  }

  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid --port "${value}". Must be an integer from 0 to 65535.`)
  }

  return port
}

async function openUrl(url: string): Promise<void> {
  const platform = process.platform

  if (platform === 'darwin') {
    const child = spawn('open', [url], { detached: true, stdio: 'ignore' })
    child.unref()
    return
  }

  if (platform === 'win32') {
    const child = spawn('cmd', ['/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    child.unref()
    return
  }

  const child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' })
  child.unref()
}

export async function startOpenSession(
  filePath: string,
  options: OpenCommandOptions = {}
): Promise<PreviewServerHandle> {
  const session = await startPreviewServer({
    filePath,
    port: parsePort(options.port),
    readonly: options.readonly,
    watch: options.watch
  })

  if (options.browser !== false) {
    try {
      await openUrl(session.url)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`Unable to open browser automatically: ${message}\n`)
      process.stderr.write(`Open this URL manually: ${session.url}\n`)
    }
  }

  return session
}

export function registerOpenCommand(program: Command): void {
  program
    .command('open')
    .description('Open a local live preview server for a .tldr file')
    .argument('<file>', 'Path to .tldr file')
    .option('--port <port>', 'Port to bind the preview server (default: 4444)')
    .option('--watch', 'Watch file changes and push updates to connected browsers')
    .option('--readonly', 'Disable browser save operations')
    .option('--no-browser', 'Do not launch a browser automatically')
    .action(async (filePath: string, options: OpenCommandOptions) => {
      const session = await startOpenSession(filePath, options)
      process.stdout.write(`${session.url}\n`)

      const shutdown = async () => {
        await session.close()
        process.exit(0)
      }

      process.once('SIGINT', () => {
        void shutdown()
      })
      process.once('SIGTERM', () => {
        void shutdown()
      })
    })
}
