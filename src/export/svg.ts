import type {
  TLArrowShape,
  TLDefaultColorStyle,
  TLDefaultDashStyle,
  TLDefaultFontStyle,
  TLDefaultSizeStyle,
  TLFrameShape,
  TLGeoShape,
  TLNoteShape,
  TLPageId,
  TLShape,
  TLStore,
  TLTextShape
} from '@tldraw/tlschema'

import { getCurrentPageId, getShapesOnPage, readTldrawFile } from '../store/io.js'
import { getShapeBounds, richTextToPlainText } from '../store/shapes.js'

const DEFAULT_BACKGROUND = '#ffffff'
const DEFAULT_PADDING = 24

const COLOR_HEX_BY_STYLE: Record<TLDefaultColorStyle, string> = {
  black: '#1f1f1f',
  blue: '#2b6cf5',
  green: '#2f9e44',
  grey: '#6b7280',
  'light-blue': '#7da8ff',
  'light-green': '#73d08b',
  'light-red': '#ff8a8a',
  'light-violet': '#c6a4ff',
  orange: '#f08c00',
  red: '#e03131',
  violet: '#7048e8',
  yellow: '#f6c344'
}

const FONT_FAMILY_BY_STYLE: Record<TLDefaultFontStyle, string> = {
  draw: '"Comic Sans MS", "Bradley Hand", cursive',
  mono: '"Menlo", "Monaco", "Courier New", monospace',
  sans: '"Arial", "Helvetica", sans-serif',
  serif: '"Georgia", "Times New Roman", serif'
}

const FONT_SIZE_BY_STYLE: Record<TLDefaultSizeStyle, number> = {
  l: 24,
  m: 18,
  s: 14,
  xl: 30
}

const STROKE_WIDTH_BY_SIZE: Record<TLDefaultSizeStyle, number> = {
  l: 2.5,
  m: 2,
  s: 1.5,
  xl: 3
}

const DASH_ARRAY_BY_STYLE: Record<TLDefaultDashStyle, string | null> = {
  dashed: '8 6',
  dotted: '2 6',
  draw: null,
  solid: null
}

export type SvgExportOptions = {
  background?: string
  padding?: number
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function colorToHex(color: TLDefaultColorStyle | string | undefined): string {
  if (!color) {
    return COLOR_HEX_BY_STYLE.black
  }

  if (color in COLOR_HEX_BY_STYLE) {
    return COLOR_HEX_BY_STYLE[color as TLDefaultColorStyle]
  }

  return color
}

function getStrokeDashAttributes(dash: TLDefaultDashStyle | undefined): string {
  if (!dash) {
    return ''
  }

  const dashArray = DASH_ARRAY_BY_STYLE[dash]
  if (!dashArray) {
    return ''
  }

  return ` stroke-dasharray="${dashArray}"`
}

function getFillColor(
  color: TLDefaultColorStyle | string | undefined,
  fill: 'none' | 'pattern' | 'semi' | 'solid' | undefined
): string {
  if (!fill || fill === 'none') {
    return 'none'
  }

  const resolvedColor = colorToHex(color)
  if (fill === 'solid') {
    return resolvedColor
  }

  // `semi` and `pattern` both map to a translucent fill for this fast-path export.
  return `${resolvedColor}33`
}

function textToSvg(text: string, x: number, y: number, options: {
  align: 'end' | 'middle' | 'start'
  color: string
  family: string
  fontSize: number
  lineHeight: number
}): string {
  const lines = text.split('\n')
  const firstLine = lines[0] ?? ''
  const remainder = lines.slice(1)

  const tspanLines = [
    `<tspan x="${x}" y="${y}">${escapeXml(firstLine)}</tspan>`,
    ...remainder.map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? options.lineHeight : options.lineHeight}">${escapeXml(line)}</tspan>`
    )
  ]

  return `<text fill="${escapeXml(options.color)}" font-family="${escapeXml(options.family)}" font-size="${options.fontSize}" text-anchor="${options.align}">${tspanLines.join('')}</text>`
}

function renderGeoShape(shape: TLGeoShape): string {
  const stroke = colorToHex(shape.props.color)
  const fill = getFillColor(shape.props.color, shape.props.fill)
  const strokeWidth = STROKE_WIDTH_BY_SIZE[shape.props.size]
  const dash = getStrokeDashAttributes(shape.props.dash)
  const label = richTextToPlainText(shape.props.richText).trim()
  const centerX = shape.x + shape.props.w / 2
  const centerY = shape.y + shape.props.h / 2
  const fontFamily = FONT_FAMILY_BY_STYLE[shape.props.font]
  const fontSize = FONT_SIZE_BY_STYLE[shape.props.size]

  const shapeSvg =
    shape.props.geo === 'ellipse'
      ? `<ellipse cx="${centerX}" cy="${centerY}" rx="${shape.props.w / 2}" ry="${shape.props.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash} />`
      : `<rect x="${shape.x}" y="${shape.y}" width="${shape.props.w}" height="${shape.props.h}" rx="8" ry="8" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash} />`

  if (!label) {
    return shapeSvg
  }

  const labelSvg = textToSvg(label, centerX, centerY + fontSize * 0.35, {
    align: 'middle',
    color: colorToHex(shape.props.labelColor),
    family: fontFamily,
    fontSize,
    lineHeight: fontSize * 1.2
  })

  return `${shapeSvg}${labelSvg}`
}

function renderTextShape(shape: TLTextShape): string {
  const text = richTextToPlainText(shape.props.richText)
  const color = colorToHex(shape.props.color)
  const family = FONT_FAMILY_BY_STYLE[shape.props.font]
  const fontSize = FONT_SIZE_BY_STYLE[shape.props.size]

  return textToSvg(text, shape.x, shape.y + fontSize, {
    align: 'start',
    color,
    family,
    fontSize,
    lineHeight: fontSize * 1.25
  })
}

function renderNoteShape(shape: TLNoteShape): string {
  const width = 220
  const height = 180
  const stroke = colorToHex(shape.props.color)
  const fill = getFillColor(shape.props.color, 'semi')
  const text = richTextToPlainText(shape.props.richText)
  const family = FONT_FAMILY_BY_STYLE[shape.props.font]
  const fontSize = FONT_SIZE_BY_STYLE[shape.props.size]

  const body = `<rect x="${shape.x}" y="${shape.y}" width="${width}" height="${height}" rx="12" ry="12" fill="${fill}" stroke="${stroke}" stroke-width="2" />`
  const label = textToSvg(text, shape.x + 16, shape.y + 24 + fontSize * 0.3, {
    align: 'start',
    color: colorToHex(shape.props.labelColor),
    family,
    fontSize,
    lineHeight: fontSize * 1.2
  })

  return `${body}${label}`
}

function renderFrameShape(shape: TLFrameShape): string {
  const stroke = colorToHex(shape.props.color)
  const body = `<rect x="${shape.x}" y="${shape.y}" width="${shape.props.w}" height="${shape.props.h}" rx="10" ry="10" fill="none" stroke="${stroke}" stroke-width="2" stroke-dasharray="10 6" />`

  if (!shape.props.name.trim()) {
    return body
  }

  const title = textToSvg(shape.props.name.trim(), shape.x + 10, shape.y + 20, {
    align: 'start',
    color: stroke,
    family: FONT_FAMILY_BY_STYLE.sans,
    fontSize: 14,
    lineHeight: 18
  })

  return `${body}${title}`
}

function renderArrowShape(shape: TLArrowShape): string {
  const stroke = colorToHex(shape.props.color)
  const strokeWidth = STROKE_WIDTH_BY_SIZE[shape.props.size]
  const dash = getStrokeDashAttributes(shape.props.dash)
  const startX = shape.x + shape.props.start.x
  const startY = shape.y + shape.props.start.y
  const endX = shape.x + shape.props.end.x
  const endY = shape.y + shape.props.end.y
  const label = richTextToPlainText(shape.props.richText).trim()

  const path = `<line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" color="${stroke}" stroke="${stroke}" stroke-width="${strokeWidth}" marker-end="url(#arrowhead)"${dash} />`

  if (!label) {
    return path
  }

  const labelX = (startX + endX) / 2
  const labelY = (startY + endY) / 2 - 6
  const labelSvg = textToSvg(label, labelX, labelY, {
    align: 'middle',
    color: colorToHex(shape.props.labelColor),
    family: FONT_FAMILY_BY_STYLE[shape.props.font],
    fontSize: FONT_SIZE_BY_STYLE[shape.props.size],
    lineHeight: FONT_SIZE_BY_STYLE[shape.props.size] * 1.2
  })

  return `${path}${labelSvg}`
}

function renderShape(shape: TLShape): string {
  switch (shape.type) {
    case 'arrow':
      return renderArrowShape(shape as TLArrowShape)
    case 'frame':
      return renderFrameShape(shape as TLFrameShape)
    case 'geo':
      return renderGeoShape(shape as TLGeoShape)
    case 'note':
      return renderNoteShape(shape as TLNoteShape)
    case 'text':
      return renderTextShape(shape as TLTextShape)
    default:
      return ''
  }
}

function getExportBounds(shapes: TLShape[], padding: number): {
  height: number
  minX: number
  minY: number
  width: number
} {
  if (shapes.length === 0) {
    return {
      height: 120,
      minX: -padding,
      minY: -padding,
      width: 200
    }
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const shape of shapes) {
    const bounds = getShapeBounds(shape)
    minX = Math.min(minX, bounds.x)
    minY = Math.min(minY, bounds.y)
    maxX = Math.max(maxX, bounds.x + bounds.w)
    maxY = Math.max(maxY, bounds.y + bounds.h)
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return {
      height: 120,
      minX: -padding,
      minY: -padding,
      width: 200
    }
  }

  return {
    height: Math.max(120, Math.ceil(maxY - minY + padding * 2)),
    minX: minX - padding,
    minY: minY - padding,
    width: Math.max(200, Math.ceil(maxX - minX + padding * 2))
  }
}

function sortShapesByIndex(shapes: TLShape[]): TLShape[] {
  return shapes.slice().sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0))
}

function getShapes(store: TLStore, pageId: TLPageId): TLShape[] {
  return sortShapesByIndex(getShapesOnPage(store, pageId))
}

export function renderStoreToSvg(store: TLStore, options: SvgExportOptions = {}): string {
  const pageId = getCurrentPageId(store)
  const shapes = getShapes(store, pageId)
  const padding = options.padding ?? DEFAULT_PADDING
  const background = options.background ?? DEFAULT_BACKGROUND
  const bounds = getExportBounds(shapes, padding)

  const shapeSvg = shapes.map((shape) => renderShape(shape)).filter((chunk) => chunk.length > 0).join('')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}" role="img" aria-label="tldraw export">`,
    '<defs>',
    '<marker id="arrowhead" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="strokeWidth">',
    '<path d="M0,0 L10,4 L0,8 z" fill="currentColor" />',
    '</marker>',
    '</defs>',
    `<rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.width}" height="${bounds.height}" fill="${escapeXml(background)}" />`,
    `<g color="${COLOR_HEX_BY_STYLE.black}">${shapeSvg}</g>`,
    '</svg>'
  ].join('')
}

export async function exportFileToSvg(filePath: string, options: SvgExportOptions = {}): Promise<string> {
  const store = await readTldrawFile(filePath)
  return renderStoreToSvg(store, options)
}
