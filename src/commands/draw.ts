import { readFile } from 'node:fs/promises'

import type { Command } from 'commander'

import { addShapeToFile, type AddShapeCommandOptions } from './add.js'
import { parseDsl, type DrawInstruction } from '../dsl/parser.js'

type DrawCommandOptions = {
  file?: string
  json?: boolean
}

type JsonShapeInput = Record<string, unknown>

type NormalizedJsonInstruction = {
  content?: string
  options: AddShapeCommandOptions
  shape: DrawInstruction['shape']
}

function ensureObject(value: unknown, message: string): asserts value is JsonShapeInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message)
  }
}

function toNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${label}`)
  }

  return value
}

function toArrowTargetString(value: unknown, label: string): string {
  if (typeof value === 'string') {
    const target = value.trim()
    if (target.length === 0) {
      throw new Error(`Invalid ${label}`)
    }

    return target
  }

  if (Array.isArray(value) && value.length === 2) {
    const x = toNumber(value[0], `${label}.x`)
    const y = toNumber(value[1], `${label}.y`)
    return `${x},${y}`
  }

  ensureObject(value, `Invalid ${label}`)
  const x = toNumber(value.x, `${label}.x`)
  const y = toNumber(value.y, `${label}.y`)
  return `${x},${y}`
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  return undefined
}

function toOptionalSize(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }

  return undefined
}

function toShapeAndGeo(input: JsonShapeInput): {
  geo?: string
  shape?: string
  type?: string
} {
  const shape = typeof input.shape === 'string' ? input.shape : undefined
  const type = typeof input.type === 'string' ? input.type : undefined
  const geo = typeof input.geo === 'string' ? input.geo : undefined

  return {
    ...(geo ? { geo } : {}),
    ...(shape ? { shape } : {}),
    ...(type ? { type } : {})
  }
}

function normalizeJsonInstruction(raw: unknown, index: number): NormalizedJsonInstruction {
  ensureObject(raw, `Instruction at index ${index} must be an object`)

  const descriptor = toShapeAndGeo(raw)
  const content = toOptionalString(raw.content) ?? toOptionalString(raw.text)

  const baseOptions: AddShapeCommandOptions = {
    ...(toOptionalString(raw.color) ? { color: toOptionalString(raw.color) } : {}),
    ...(toOptionalString(raw.dash) ? { dash: toOptionalString(raw.dash) } : {}),
    ...(toOptionalString(raw.fill) ? { fill: toOptionalString(raw.fill) } : {}),
    ...(toOptionalString(raw.font) ? { font: toOptionalString(raw.font) } : {}),
    ...(toOptionalString(raw.id) ? { id: toOptionalString(raw.id) } : {}),
    ...(toOptionalString(raw.label) ? { label: toOptionalString(raw.label) } : {}),
    ...(toOptionalSize(raw.size) ? { size: toOptionalSize(raw.size) } : {})
  }

  const applyGeometry = (options: AddShapeCommandOptions): AddShapeCommandOptions => {
    const hasX = typeof raw.x === 'number'
    const hasY = typeof raw.y === 'number'
    const hasW = typeof raw.w === 'number'
    const hasH = typeof raw.h === 'number'

    if (hasX !== hasY) {
      throw new Error(`Instruction at index ${index} must provide both x and y`)
    }

    if (hasW !== hasH) {
      throw new Error(`Instruction at index ${index} must provide both w and h`)
    }

    const hasPosition = hasX && hasY
    const hasDimensions = hasW && hasH

    return {
      ...options,
      ...(hasPosition
        ? {
            pos: `${toNumber(raw.x, `instruction[${index}].x`)},${toNumber(raw.y, `instruction[${index}].y`)}`
          }
        : {}),
      ...(hasDimensions
        ? {
            size: `${toNumber(raw.w, `instruction[${index}].w`)}x${toNumber(raw.h, `instruction[${index}].h`)}`
          }
        : {})
    }
  }

  if (descriptor.shape) {
    const shape = descriptor.shape
    if (shape !== 'arrow' && shape !== 'ellipse' && shape !== 'frame' && shape !== 'note' && shape !== 'rect' && shape !== 'text') {
      throw new Error(`Unsupported shape "${shape}" at instruction index ${index}`)
    }

    if (shape === 'arrow') {
      if (!('from' in raw) || !('to' in raw)) {
        throw new Error(`Arrow instruction at index ${index} is missing "from" or "to"`)
      }

      return {
        ...(content ? { content } : {}),
        options: {
          ...baseOptions,
          from: toArrowTargetString(raw.from, `instruction[${index}].from`),
          to: toArrowTargetString(raw.to, `instruction[${index}].to`)
        },
        shape
      }
    }

    return {
      ...(content ? { content } : {}),
      options: applyGeometry(baseOptions),
      shape
    }
  }

  if (descriptor.type === 'geo') {
    const geo = descriptor.geo
    const shape = geo === 'ellipse' ? 'ellipse' : geo === 'rectangle' ? 'rect' : undefined
    if (!shape) {
      throw new Error(`Unsupported geo style "${geo ?? ''}" at instruction index ${index}`)
    }

    return {
      ...(content ? { content } : {}),
      options: applyGeometry(baseOptions),
      shape
    }
  }

  if (descriptor.type === 'text' || descriptor.type === 'note' || descriptor.type === 'frame') {
    return {
      ...(content ? { content } : {}),
      options: applyGeometry(baseOptions),
      shape: descriptor.type
    }
  }

  if (descriptor.type === 'arrow') {
    if (!('from' in raw) || !('to' in raw)) {
      throw new Error(`Arrow instruction at index ${index} is missing "from" or "to"`)
    }

    return {
      ...(content ? { content } : {}),
      options: {
        ...baseOptions,
        from: toArrowTargetString(raw.from, `instruction[${index}].from`),
        to: toArrowTargetString(raw.to, `instruction[${index}].to`)
      },
      shape: 'arrow'
    }
  }

  throw new Error(`Instruction at index ${index} is missing a supported shape/type`)
}

function parseJsonInstructions(json: string): DrawInstruction[] {
  let parsed: unknown

  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid JSON input for draw --json')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('draw --json expects an array of shape instructions')
  }

  return parsed.map((raw, index) => normalizeJsonInstruction(raw, index))
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []

  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  return Buffer.concat(chunks).toString('utf8')
}

async function readDrawInput(options: DrawCommandOptions): Promise<string> {
  if (options.file) {
    return readFile(options.file, 'utf8')
  }

  if (process.stdin.isTTY) {
    throw new Error('draw requires stdin input or --file <path>')
  }

  const input = await readStdin()
  if (input.trim().length === 0) {
    throw new Error('draw input is empty')
  }

  return input
}

export async function applyDrawInstructions(
  filePath: string,
  instructions: DrawInstruction[]
): Promise<string[]> {
  const ids: string[] = []

  for (const instruction of instructions) {
    const id = await addShapeToFile(
      instruction.shape,
      filePath,
      instruction.content,
      instruction.options
    )
    ids.push(id)
  }

  return ids
}

export async function drawFromDsl(filePath: string, source: string): Promise<string[]> {
  const instructions = parseDsl(source)
  return applyDrawInstructions(filePath, instructions)
}

export async function drawFromJson(filePath: string, source: string): Promise<string[]> {
  const instructions = parseJsonInstructions(source)
  return applyDrawInstructions(filePath, instructions)
}

export function registerDrawCommand(program: Command): void {
  program
    .command('draw')
    .description('Draw shapes from DSL (stdin or --file) or JSON instruction input')
    .argument('<file>', 'Path to .tldr file')
    .option('--file <path>', 'Read draw input from a file instead of stdin')
    .option('--json', 'Interpret input as JSON shape instructions')
    .action(async (filePath: string, options: DrawCommandOptions) => {
      const input = await readDrawInput(options)
      const ids = options.json ? await drawFromJson(filePath, input) : await drawFromDsl(filePath, input)

      if (ids.length > 0) {
        process.stdout.write(`${ids.join('\n')}\n`)
      }
    })
}
