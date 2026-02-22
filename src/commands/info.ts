import { stat } from 'node:fs/promises'

import type { Command } from 'commander'

import { getPages, getShapesOnPage, readTldrawFile } from '../store/io.js'

export type FileInfo = {
  filePath: string
  pages: number
  schemaVersion: number
  shapeTypeCounts: Record<string, number>
  shapes: number
  sizeBytes: number
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const kb = bytes / 1024
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`
  }

  return `${(kb / 1024).toFixed(1)} MB`
}

export function formatInfo(info: FileInfo): string {
  const shapeBreakdown =
    Object.entries(info.shapeTypeCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([shapeType, count]) => `${count} ${shapeType}`)
      .join(', ') || 'none'

  return [
    `File:     ${info.filePath}`,
    `Schema:   v${info.schemaVersion}`,
    `Pages:    ${info.pages}`,
    `Shapes:   ${info.shapes} (${shapeBreakdown})`,
    `Size:     ${formatBytes(info.sizeBytes)}`
  ].join('\n')
}

export async function inspectFile(filePath: string): Promise<FileInfo> {
  const store = await readTldrawFile(filePath)
  const pages = getPages(store)
  const shapes = pages.flatMap((page) => getShapesOnPage(store, page.id))
  const shapeTypeCounts: Record<string, number> = {}

  for (const shape of shapes) {
    shapeTypeCounts[shape.type] = (shapeTypeCounts[shape.type] ?? 0) + 1
  }

  const fileStats = await stat(filePath)
  const schema = store.schema.serialize()

  return {
    filePath,
    pages: pages.length,
    schemaVersion: schema.schemaVersion,
    shapeTypeCounts,
    shapes: shapes.length,
    sizeBytes: fileStats.size
  }
}

export function registerInfoCommand(program: Command): void {
  program
    .command('info')
    .description('Inspect a .tldr file')
    .argument('<file>', 'Path to .tldr file')
    .action(async (file: string) => {
      const info = await inspectFile(file)
      process.stdout.write(`${formatInfo(info)}\n`)
    })
}
