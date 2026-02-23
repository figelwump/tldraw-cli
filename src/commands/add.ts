import type { TLArrowBinding, TLPageId, TLShape, TLShapeId } from '@tldraw/tlschema'
import { createBindingId } from '@tldraw/tlschema'
import { getIndexAbove, type IndexKey } from '@tldraw/utils'
import type { Command } from 'commander'

import {
  parseColor,
  parseDash,
  parseFill,
  parseFont,
  parsePosition,
  parsePositionOrNull,
  parseShapeSize,
  parseSize
} from './parsers.js'
import { createShapeRecord } from '../store/factory.js'
import { autoPlace } from '../store/layout.js'
import { getCurrentPageId, getShapesOnPage, readTldrawFile, writeTldrawFile } from '../store/io.js'
import { getShapeBorderPoint, getShapeCenter, getShapeLabel } from '../store/shapes.js'
import { estimateLabelDimensions } from '../store/text.js'

const SUPPORTED_SHAPES = ['arrow', 'ellipse', 'frame', 'note', 'rect', 'text'] as const
type SupportedShape = (typeof SUPPORTED_SHAPES)[number]

const DEFAULT_DIMENSIONS_BY_SHAPE = {
  ellipse: { h: 120, w: 120 },
  frame: { h: 260, w: 460 },
  rect: { h: 120, w: 220 },
  text: { h: 40, w: 280 }
} as const
const DIMENSION_PATTERN = /^\s*\d+(\.\d+)?x\d+(\.\d+)?\s*$/i

export type AddShapeCommandOptions = {
  color?: string
  dash?: string
  dimensions?: string
  fill?: string
  font?: string
  from?: string
  id?: string
  label?: string
  pos?: string
  size?: string
  to?: string
}

function isSupportedShape(value: string): value is SupportedShape {
  return SUPPORTED_SHAPES.includes(value as SupportedShape)
}

function getNextIndex(shapes: TLShape[]): IndexKey {
  let topIndex: IndexKey | undefined

  for (const shape of shapes) {
    if (!topIndex || shape.index > topIndex) {
      topIndex = shape.index
    }
  }

  return getIndexAbove(topIndex)
}

function resolveSizeOptions(options: AddShapeCommandOptions): {
  dimensions: { h: number; w: number } | null
  sizeStyle: ReturnType<typeof parseShapeSize> | null
} {
  let dimensions: { h: number; w: number } | null = null
  let sizeStyle: ReturnType<typeof parseShapeSize> | null = null

  if (options.dimensions) {
    dimensions = parseSize(options.dimensions)
  }

  if (options.size) {
    const sizeValue = options.size.trim()

    if (DIMENSION_PATTERN.test(sizeValue)) {
      dimensions = parseSize(sizeValue)
    } else if (sizeValue.toLowerCase().includes('x')) {
      throw new Error(`Invalid --size "${options.size}". Use WxH or one of s,m,l,xl.`)
    } else {
      sizeStyle = parseShapeSize(sizeValue)
    }
  }

  return { dimensions, sizeStyle }
}

type ArrowTargetResult = {
  point: { x: number; y: number }
  shape?: TLShape
}

function resolveArrowTarget(target: string, shapes: TLShape[]): ArrowTargetResult {
  const pointTarget = parsePositionOrNull(target)

  if (pointTarget) {
    return { point: pointTarget }
  }

  const byId = shapes.find((shape) => shape.id === target)
  if (byId) {
    return { point: getShapeCenter(byId), shape: byId }
  }

  const byLabel = shapes.find((shape) => getShapeLabel(shape) === target)
  if (byLabel) {
    return { point: getShapeCenter(byLabel), shape: byLabel }
  }

  throw new Error(`Unable to resolve arrow target "${target}" to a coordinate or shape`)
}

function resolvePosition(
  options: AddShapeCommandOptions,
  filePath: string,
  shapes: TLShape[],
  pageId: TLPageId,
  store: Awaited<ReturnType<typeof readTldrawFile>>
) {
  if (options.pos) {
    return parsePosition(options.pos)
  }

  if (shapes.length === 0) {
    return { x: 0, y: 0 }
  }

  try {
    return autoPlace(store, pageId)
  } catch {
    throw new Error(`Unable to auto-place shape in ${filePath}; pass --pos x,y`)
  }
}

function resolveShapeType(shape: string): SupportedShape {
  if (!isSupportedShape(shape)) {
    throw new Error(`Unsupported shape "${shape}". Supported: ${SUPPORTED_SHAPES.join(', ')}`)
  }

  return shape
}

export async function addShapeToFile(
  shape: string,
  filePath: string,
  content: string | undefined,
  options: AddShapeCommandOptions = {}
): Promise<TLShapeId> {
  const shapeType = resolveShapeType(shape)
  const store = await readTldrawFile(filePath)
  const pageId = getCurrentPageId(store)
  const shapes = getShapesOnPage(store, pageId)
  const position = resolvePosition(options, filePath, shapes, pageId, store)
  const index = getNextIndex(shapes)
  const { dimensions, sizeStyle } = resolveSizeOptions(options)

  const sharedStyle = {
    index,
    pageId,
    x: position.x,
    y: position.y,
    ...(options.color ? { color: parseColor(options.color) } : {}),
    ...(options.dash ? { dash: parseDash(options.dash) } : {}),
    ...(options.fill ? { fill: parseFill(options.fill) } : {}),
    ...(options.font ? { font: parseFont(options.font) } : {}),
    ...(options.id ? { id: options.id } : {}),
    ...(sizeStyle ? { size: sizeStyle } : {})
  }

  // Auto-expand dimensions to fit label text, ensuring shapes are always
  // at least big enough for their label content.
  function expandForLabel(
    baseDimensions: { h: number; w: number },
    label: string | undefined
  ): { h: number; w: number } {
    if (!label) return baseDimensions
    const labelDims = estimateLabelDimensions(label, sizeStyle ?? undefined, options.font)
    return {
      h: Math.max(baseDimensions.h, labelDims.h),
      w: Math.max(baseDimensions.w, labelDims.w)
    }
  }

  // Resolve arrow targets upfront so we can reuse them for both
  // shape creation and binding creation.
  let fromTarget: ArrowTargetResult | undefined
  let toTarget: ArrowTargetResult | undefined

  if (shapeType === 'arrow') {
    if (!options.from || !options.to) {
      throw new Error('Arrow shapes require both --from and --to')
    }
    fromTarget = resolveArrowTarget(options.from, shapes)
    toTarget = resolveArrowTarget(options.to, shapes)
  }

  const shapeRecord = (() => {
    if (shapeType === 'rect') {
      const shapeDimensions = expandForLabel(
        dimensions ?? DEFAULT_DIMENSIONS_BY_SHAPE.rect,
        options.label
      )
      return createShapeRecord({
        ...sharedStyle,
        geo: 'rectangle',
        h: shapeDimensions.h,
        ...(options.label ? { label: options.label } : {}),
        type: 'geo',
        w: shapeDimensions.w
      })
    }

    if (shapeType === 'ellipse') {
      const shapeDimensions = expandForLabel(
        dimensions ?? DEFAULT_DIMENSIONS_BY_SHAPE.ellipse,
        options.label
      )
      return createShapeRecord({
        ...sharedStyle,
        geo: 'ellipse',
        h: shapeDimensions.h,
        ...(options.label ? { label: options.label } : {}),
        type: 'geo',
        w: shapeDimensions.w
      })
    }

    if (shapeType === 'text') {
      const textContent = content ?? options.label ?? ''
      const shapeDimensions = dimensions ?? DEFAULT_DIMENSIONS_BY_SHAPE.text
      return createShapeRecord({
        ...sharedStyle,
        autoSize: !dimensions,
        text: textContent,
        type: 'text',
        w: shapeDimensions.w
      })
    }

    if (shapeType === 'frame') {
      const shapeDimensions = dimensions ?? DEFAULT_DIMENSIONS_BY_SHAPE.frame
      return createShapeRecord({
        ...sharedStyle,
        h: shapeDimensions.h,
        name: options.label ?? content ?? 'Frame',
        type: 'frame',
        w: shapeDimensions.w
      })
    }

    if (shapeType === 'note') {
      return createShapeRecord({
        ...sharedStyle,
        text: content ?? options.label ?? '',
        type: 'note'
      })
    }

    // Arrow — fromTarget/toTarget are guaranteed set above.
    // Use border intersection points so the arrow's stored coordinates
    // already avoid crossing through shapes. The bindings created below
    // handle dynamic re-routing when tldraw's editor is running; these
    // border points serve as the static fallback for initial render and
    // non-interactive contexts (e.g., SVG export).
    const arrowLabel = options.label ?? content
    const fromPoint = fromTarget!.shape
      ? getShapeBorderPoint(fromTarget!.shape, toTarget!.point)
      : fromTarget!.point
    const toPoint = toTarget!.shape
      ? getShapeBorderPoint(toTarget!.shape, fromTarget!.point)
      : toTarget!.point
    return createShapeRecord({
      ...sharedStyle,
      fromPoint,
      ...(arrowLabel ? { label: arrowLabel } : {}),
      toPoint,
      type: 'arrow'
    })
  })()

  store.put([shapeRecord])

  // Create TLArrowBinding records so tldraw routes arrows to shape borders
  // instead of through shape centers. Only created when the arrow targets
  // a shape (not raw coordinates).
  if (fromTarget || toTarget) {
    const bindings: TLArrowBinding[] = []

    if (fromTarget?.shape) {
      bindings.push({
        id: createBindingId(),
        type: 'arrow',
        typeName: 'binding',
        fromId: shapeRecord.id,
        toId: fromTarget.shape.id,
        meta: {},
        props: {
          terminal: 'start',
          normalizedAnchor: { x: 0.5, y: 0.5 },
          isExact: false,
          isPrecise: false,
          snap: 'none' as const
        }
      })
    }

    if (toTarget?.shape) {
      bindings.push({
        id: createBindingId(),
        type: 'arrow',
        typeName: 'binding',
        fromId: shapeRecord.id,
        toId: toTarget.shape.id,
        meta: {},
        props: {
          terminal: 'end',
          normalizedAnchor: { x: 0.5, y: 0.5 },
          isExact: false,
          isPrecise: false,
          snap: 'none' as const
        }
      })
    }

    if (bindings.length > 0) {
      store.put(bindings)
    }
  }

  await writeTldrawFile(filePath, store)

  return shapeRecord.id
}

export function registerAddCommand(program: Command): void {
  program
    .command('add')
    .description('Add a shape to an existing .tldr document')
    .argument('<shape>', 'Shape type: rect, ellipse, text, arrow, frame, note')
    .argument('<file>', 'Path to .tldr file')
    .argument('[content]', 'Optional content string (text / note / arrow label)')
    .option('--pos <x,y>', 'Position of the shape (x,y)')
    .option('--size <value>', 'Shape dimensions (WxH) or style size (s|m|l|xl)')
    .option('--dimensions <WxH>', 'Shape dimensions')
    .option('--color <name>', 'Shape color')
    .option('--fill <style>', 'Fill style')
    .option('--dash <style>', 'Dash style')
    .option('--font <style>', 'Font style')
    .option('--label <text>', 'Shape label text')
    .option('--id <id>', 'Custom shape id')
    .option('--from <target>', 'Arrow start target (x,y | shape id | label)')
    .option('--to <target>', 'Arrow end target (x,y | shape id | label)')
    .action(
      async (shape: string, file: string, content: string | undefined, options: AddShapeCommandOptions) => {
        const id = await addShapeToFile(shape, file, content, options)
        process.stdout.write(`${id}\n`)
      }
    )
}
