import type {
  TLArrowShape,
  TLFrameShape,
  TLGeoShape,
  TLNoteShape,
  TLRichText,
  TLShape,
  TLShapeId,
  TLTextShape
} from '@tldraw/tlschema'

type RichTextNode = {
  content?: RichTextNode[]
  text?: string
  type: string
}

const NOTE_DIMENSIONS_BY_SIZE = {
  l: { h: 240, w: 280 },
  m: { h: 180, w: 220 },
  s: { h: 140, w: 180 },
  xl: { h: 300, w: 340 }
} as const

const TEXT_LINE_HEIGHT_BY_SIZE = {
  l: 36,
  m: 28,
  s: 22,
  xl: 44
} as const

function richTextNodeToPlainText(node: RichTextNode): string {
  if (node.type === 'text') {
    return node.text ?? ''
  }

  if (!node.content || node.content.length === 0) {
    return ''
  }

  return node.content.map((child) => richTextNodeToPlainText(child)).join('')
}

export function richTextToPlainText(richText: TLRichText): string {
  const root = richText as unknown as RichTextNode

  if (!root.content || root.content.length === 0) {
    return ''
  }

  const lines = root.content
    .map((paragraph) => richTextNodeToPlainText(paragraph).trim())
    .filter((line) => line.length > 0)

  return lines.join('\n')
}

function getShapeSize(shape: TLShape): { h: number; w: number } | null {
  if (shape.type === 'geo') {
    const geoShape = shape as TLGeoShape
    return { h: geoShape.props.h, w: geoShape.props.w }
  }

  if (shape.type === 'frame') {
    const frameShape = shape as TLFrameShape
    return { h: frameShape.props.h, w: frameShape.props.w }
  }

  if (shape.type === 'text') {
    const textShape = shape as TLTextShape
    const lineCount = Math.max(1, richTextToPlainText(textShape.props.richText).split('\n').length)
    const lineHeight = TEXT_LINE_HEIGHT_BY_SIZE[textShape.props.size]
    return { h: lineCount * lineHeight, w: Math.max(40, textShape.props.w) }
  }

  if (shape.type === 'note') {
    const noteShape = shape as TLNoteShape
    const dimensions = NOTE_DIMENSIONS_BY_SIZE[noteShape.props.size]
    return dimensions
  }

  if (shape.type === 'arrow') {
    const arrowShape = shape as TLArrowShape
    const width = Math.abs(arrowShape.props.end.x - arrowShape.props.start.x)
    const height = Math.abs(arrowShape.props.end.y - arrowShape.props.start.y)
    return { h: Math.max(1, height), w: Math.max(1, width) }
  }

  return null
}

export function getShapeBounds(shape: TLShape): { h: number; w: number; x: number; y: number } {
  if (shape.type === 'arrow') {
    const arrowShape = shape as TLArrowShape
    const startX = arrowShape.x + arrowShape.props.start.x
    const startY = arrowShape.y + arrowShape.props.start.y
    const endX = arrowShape.x + arrowShape.props.end.x
    const endY = arrowShape.y + arrowShape.props.end.y
    const x = Math.min(startX, endX)
    const y = Math.min(startY, endY)
    const w = Math.abs(endX - startX)
    const h = Math.abs(endY - startY)
    return { h, w, x, y }
  }

  const size = getShapeSize(shape)

  if (!size) {
    return { h: 0, w: 0, x: shape.x, y: shape.y }
  }

  return { ...size, x: shape.x, y: shape.y }
}

export function getShapeCenter(shape: TLShape): { x: number; y: number } {
  const bounds = getShapeBounds(shape)
  return {
    x: bounds.x + bounds.w / 2,
    y: bounds.y + bounds.h / 2
  }
}

export function getShapeLabel(shape: TLShape): string | null {
  if (shape.type === 'frame') {
    const frameShape = shape as TLFrameShape
    return frameShape.props.name.trim() || null
  }

  if (
    shape.type === 'geo' ||
    shape.type === 'note' ||
    shape.type === 'text' ||
    shape.type === 'arrow'
  ) {
    const richText = (shape as TLGeoShape | TLNoteShape | TLTextShape | TLArrowShape).props.richText
    const text = richTextToPlainText(richText).trim()
    return text.length > 0 ? text : null
  }

  return null
}

export function getShapeColor(shape: TLShape): string | null {
  if ('color' in shape.props && typeof shape.props.color === 'string') {
    return shape.props.color
  }

  return null
}

export function isShapeId(value: string): value is TLShapeId {
  return value.startsWith('shape:')
}
