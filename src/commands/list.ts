import type { Command } from 'commander'
import type { TLShape } from '@tldraw/tlschema'

import { getCurrentPageId, getShapesOnPage, readTldrawFile } from '../store/io.js'
import { getShapeBounds, getShapeColor, getShapeLabel } from '../store/shapes.js'

export type ListCommandOptions = {
  ids?: boolean
  json?: boolean
}

export type ShapeListRow = {
  color: string
  id: string
  label: string
  pos: string
  size: string
  type: string
}

function formatSize(shape: TLShape): string {
  if (shape.type === 'text') {
    return 'auto'
  }

  const bounds = getShapeBounds(shape)
  return `${Math.round(bounds.w)}x${Math.round(bounds.h)}`
}

export function toShapeListRows(shapes: TLShape[]): ShapeListRow[] {
  return shapes
    .slice()
    .sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0))
    .map((shape) => ({
      color: getShapeColor(shape) ?? '—',
      id: shape.id,
      label: getShapeLabel(shape) ?? '—',
      pos: `${Math.round(shape.x)},${Math.round(shape.y)}`,
      size: formatSize(shape),
      type: shape.type
    }))
}

export function formatShapeTable(rows: ShapeListRow[]): string {
  if (rows.length === 0) {
    return 'No shapes'
  }

  const headers: ShapeListRow = {
    color: 'COLOR',
    id: 'ID',
    label: 'LABEL',
    pos: 'POS',
    size: 'SIZE',
    type: 'TYPE'
  }

  const columns: Array<keyof ShapeListRow> = ['id', 'type', 'label', 'pos', 'size', 'color']
  const columnWidths = Object.fromEntries(
    columns.map((column) => {
      const maxDataWidth = Math.max(...rows.map((row) => row[column].length), headers[column].length)
      return [column, maxDataWidth]
    })
  ) as Record<keyof ShapeListRow, number>

  const formatRow = (row: ShapeListRow) =>
    columns.map((column) => row[column].padEnd(columnWidths[column])).join('  ')

  return [formatRow(headers), ...rows.map((row) => formatRow(row))].join('\n')
}

export async function listShapes(filePath: string): Promise<TLShape[]> {
  const store = await readTldrawFile(filePath)
  const pageId = getCurrentPageId(store)
  return getShapesOnPage(store, pageId)
}

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List shapes in a .tldr document')
    .argument('<file>', 'Path to .tldr file')
    .option('--json', 'Output full shape records as JSON')
    .option('--ids', 'Output only shape IDs')
    .action(async (file: string, options: ListCommandOptions) => {
      const shapes = await listShapes(file)

      if (options.json) {
        process.stdout.write(`${JSON.stringify(shapes, null, 2)}\n`)
        return
      }

      if (options.ids) {
        process.stdout.write(`${shapes.map((shape) => shape.id).join('\n')}${shapes.length > 0 ? '\n' : ''}`)
        return
      }

      const table = formatShapeTable(toShapeListRows(shapes))
      process.stdout.write(`${table}\n`)
    })
}
