import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'

import type { Command } from 'commander'

import { writePngFile } from '../export/png.js'
import { exportFileToSvg } from '../export/svg.js'

type ExportFormat = 'png' | 'svg'

export type ExportCommandOptions = {
  background?: string
  format?: string
  output?: string
  padding?: string
  scale?: string
}

export type ExportResult = {
  format: ExportFormat
  outputPath: string
}

function parseScale(value: string | undefined): number {
  if (!value) {
    return 1
  }

  const scale = Number(value)
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`Invalid --scale "${value}". Must be a positive number.`)
  }

  return scale
}

function parsePadding(value: string | undefined): number {
  if (!value) {
    return 24
  }

  const padding = Number(value)
  if (!Number.isFinite(padding) || padding < 0) {
    throw new Error(`Invalid --padding "${value}". Must be zero or greater.`)
  }

  return padding
}

function normalizeFormat(value: string): ExportFormat {
  const normalized = value.toLowerCase()
  if (normalized === 'png' || normalized === 'svg') {
    return normalized
  }

  throw new Error(`Unsupported export format "${value}". Use png or svg.`)
}

function inferFormatFromPath(outputPath: string | undefined): ExportFormat | null {
  if (!outputPath) {
    return null
  }

  const extension = extname(outputPath).toLowerCase()
  if (extension === '.png') {
    return 'png'
  }

  if (extension === '.svg') {
    return 'svg'
  }

  return null
}

function resolveExportTarget(filePath: string, options: ExportCommandOptions): ExportResult {
  const inferredFormat = inferFormatFromPath(options.output)
  const explicitFormat = options.format ? normalizeFormat(options.format) : null

  if (explicitFormat && inferredFormat && explicitFormat !== inferredFormat) {
    throw new Error(
      `Output extension does not match format: --format ${explicitFormat} with output "${options.output}".`
    )
  }

  const format = explicitFormat ?? inferredFormat ?? 'png'

  const outputPath = options.output
    ? resolve(options.output)
    : resolve(dirname(filePath), `${basename(filePath, extname(filePath))}.${format}`)

  return {
    format,
    outputPath
  }
}

export async function exportFile(
  filePath: string,
  options: ExportCommandOptions = {}
): Promise<ExportResult> {
  const target = resolveExportTarget(filePath, options)
  const scale = parseScale(options.scale)
  const padding = parsePadding(options.padding)
  const svg = await exportFileToSvg(filePath, {
    ...(options.background ? { background: options.background } : {}),
    padding
  })

  await mkdir(dirname(target.outputPath), { recursive: true })

  if (target.format === 'svg') {
    await writeFile(target.outputPath, `${svg}\n`, 'utf8')
  } else {
    await writePngFile(target.outputPath, svg, { scale })
  }

  return target
}

export function registerExportCommand(program: Command): void {
  program
    .command('export')
    .description('Export a .tldr file to SVG or PNG')
    .argument('<file>', 'Path to .tldr file')
    .option('-o, --output <file>', 'Output file path (.svg or .png)')
    .option('--format <format>', 'Export format (png|svg)')
    .option('--scale <value>', 'PNG scale factor (default: 1)')
    .option('--padding <px>', 'Canvas padding around shapes (default: 24)')
    .option('--background <css-color>', 'Background color for export (default: white)')
    .action(async (filePath: string, options: ExportCommandOptions) => {
      const result = await exportFile(filePath, options)
      process.stdout.write(`${result.outputPath}\n`)
    })
}
