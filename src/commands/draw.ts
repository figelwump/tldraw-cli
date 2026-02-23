import { readFile } from 'node:fs/promises'

import type { TLFrameShape, TLShape } from '@tldraw/tlschema'
import type { Command } from 'commander'
import { getIndexBelow, type IndexKey } from '@tldraw/utils'

import { addShapeToFile, type AddShapeCommandOptions } from './add.js'
import { parseDsl, type DrawInstruction } from '../dsl/parser.js'
import { getCurrentPageId, getShapesOnPage, readTldrawFile, writeTldrawFile } from '../store/io.js'
import { getShapeBounds } from '../store/shapes.js'

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

  const baseOptions: AddShapeCommandOptions = {}
  const color = toOptionalString(raw.color)
  const dash = toOptionalString(raw.dash)
  const fill = toOptionalString(raw.fill)
  const font = toOptionalString(raw.font)
  const id = toOptionalString(raw.id)
  const label = toOptionalString(raw.label)
  const size = toOptionalSize(raw.size)

  if (color) {
    baseOptions.color = color
  }

  if (dash) {
    baseOptions.dash = dash
  }

  if (fill) {
    baseOptions.fill = fill
  }

  if (font) {
    baseOptions.font = font
  }

  if (id) {
    baseOptions.id = id
  }

  if (label) {
    baseOptions.label = label
  }

  if (size) {
    baseOptions.size = size
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

const FRAME_EXPANSION_PADDING = 20

// Tolerance for center-point containment check. Shapes whose center falls
// within the frame bounds (extended by this amount on all sides) are
// considered "contained" and trigger frame expansion.
const FRAME_CONTAINMENT_TOLERANCE = 200

/**
 * Check whether a shape's center point falls within the frame's bounding box
 * (with symmetric tolerance), indicating it is "contained" by the frame.
 * This is a visual heuristic — it does NOT re-parent shapes into the frame.
 */
function isShapeContainedByFrame(shape: TLShape, frame: TLFrameShape): boolean {
  const bounds = getShapeBounds(shape)
  const centerX = bounds.x + bounds.w / 2
  const centerY = bounds.y + bounds.h / 2

  return (
    centerX >= frame.x - FRAME_CONTAINMENT_TOLERANCE &&
    centerX <= frame.x + frame.props.w + FRAME_CONTAINMENT_TOLERANCE &&
    centerY >= frame.y - FRAME_CONTAINMENT_TOLERANCE &&
    centerY <= frame.y + frame.props.h + FRAME_CONTAINMENT_TOLERANCE
  )
}

/**
 * Post-processing step: expand frames to encompass all shapes whose center
 * falls within the frame's current bounding box. Adds padding so shapes
 * don't sit flush against the frame border.
 */
async function expandFramesToFitContents(filePath: string): Promise<void> {
  const store = await readTldrawFile(filePath)
  const pageId = getCurrentPageId(store)
  const shapes = getShapesOnPage(store, pageId)

  const frames = shapes.filter((s): s is TLFrameShape => s.type === 'frame')
  if (frames.length === 0) return

  const nonFrameShapes = shapes.filter((s) => s.type !== 'frame')
  let changed = false

  for (const frame of frames) {
    const contained = nonFrameShapes.filter((s) => isShapeContainedByFrame(s, frame))
    if (contained.length === 0) continue

    // Compute the bounding box of all contained shapes
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const shape of contained) {
      const bounds = getShapeBounds(shape)
      minX = Math.min(minX, bounds.x)
      minY = Math.min(minY, bounds.y)
      maxX = Math.max(maxX, bounds.x + bounds.w)
      maxY = Math.max(maxY, bounds.y + bounds.h)
    }

    // The frame needs to encompass all children with padding
    const requiredX = minX - FRAME_EXPANSION_PADDING
    const requiredY = minY - FRAME_EXPANSION_PADDING
    const requiredRight = maxX + FRAME_EXPANSION_PADDING
    const requiredBottom = maxY + FRAME_EXPANSION_PADDING

    const newX = Math.min(frame.x, requiredX)
    const newY = Math.min(frame.y, requiredY)
    const newW = Math.max(frame.x + frame.props.w, requiredRight) - newX
    const newH = Math.max(frame.y + frame.props.h, requiredBottom) - newY

    const needsUpdate =
      newX !== frame.x ||
      newY !== frame.y ||
      newW !== frame.props.w ||
      newH !== frame.props.h

    if (needsUpdate) {
      store.put([
        {
          ...frame,
          props: { ...frame.props, h: newH, w: newW },
          x: newX,
          y: newY
        }
      ])
      changed = true
    }
  }

  if (changed) {
    await writeTldrawFile(filePath, store)
  }
}

/**
 * Post-processing step: move all frames to the bottom of the z-stack so
 * their backgrounds don't cover sibling shapes. In tldraw, frames are
 * typically behind other shapes. Without this, interleaved creation order
 * in draw instructions can leave frames on top of geo shapes, hiding them.
 */
async function reindexFramesToBottom(filePath: string): Promise<void> {
  const store = await readTldrawFile(filePath)
  const pageId = getCurrentPageId(store)
  const shapes = getShapesOnPage(store, pageId)

  const frames = shapes.filter((s): s is TLFrameShape => s.type === 'frame')
  if (frames.length === 0) return

  // Find the lowest index among all non-frame shapes
  let lowestNonFrameIndex: IndexKey | undefined
  for (const shape of shapes) {
    if (shape.type === 'frame') continue
    if (!lowestNonFrameIndex || shape.index < lowestNonFrameIndex) {
      lowestNonFrameIndex = shape.index
    }
  }

  if (!lowestNonFrameIndex) return

  // Assign frames indices below the lowest non-frame shape
  let nextFrameIndex = getIndexBelow(lowestNonFrameIndex)
  const updates: TLFrameShape[] = []

  for (const frame of frames) {
    if (frame.index >= lowestNonFrameIndex) {
      updates.push({ ...frame, index: nextFrameIndex })
      nextFrameIndex = getIndexBelow(nextFrameIndex)
    }
  }

  if (updates.length > 0) {
    store.put(updates)
    await writeTldrawFile(filePath, store)
  }
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

  // Post-process: move frames behind other shapes, then expand to fit contents
  await reindexFramesToBottom(filePath)
  await expandFramesToFitContents(filePath)

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
