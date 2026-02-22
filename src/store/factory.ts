import {
  createShapeId,
  toRichText,
  type TLArrowShape,
  type TLArrowShapeArrowheadStyle,
  type TLDefaultColorStyle,
  type TLDefaultDashStyle,
  type TLDefaultFillStyle,
  type TLDefaultFontStyle,
  type TLDefaultSizeStyle,
  type TLFrameShape,
  type TLGeoShape,
  type TLGeoShapeGeoStyle,
  type TLNoteShape,
  type TLPageId,
  type TLShape,
  type TLShapeId,
  type TLTextShape
} from '@tldraw/tlschema'
import type { IndexKey, JsonObject } from '@tldraw/utils'

const DEFAULT_ARROWHEAD_END: TLArrowShapeArrowheadStyle = 'arrow'
const DEFAULT_ARROWHEAD_START: TLArrowShapeArrowheadStyle = 'none'
const DEFAULT_COLOR: TLDefaultColorStyle = 'black'
const DEFAULT_DASH: TLDefaultDashStyle = 'draw'
const DEFAULT_FILL: TLDefaultFillStyle = 'none'
const DEFAULT_FONT: TLDefaultFontStyle = 'draw'
const DEFAULT_GEO_LABEL_COLOR: TLDefaultColorStyle = 'black'
const DEFAULT_SIZE: TLDefaultSizeStyle = 'm'

type FactoryBaseInput = {
  color?: TLDefaultColorStyle | undefined
  dash?: TLDefaultDashStyle | undefined
  fill?: TLDefaultFillStyle | undefined
  font?: TLDefaultFontStyle | undefined
  id?: string | undefined
  index: IndexKey
  isLocked?: boolean | undefined
  label?: string | undefined
  meta?: JsonObject | undefined
  opacity?: number | undefined
  pageId: TLPageId
  size?: TLDefaultSizeStyle | undefined
  x: number
  y: number
}

type GeoInput = FactoryBaseInput & {
  geo: TLGeoShapeGeoStyle
  h: number
  type: 'geo'
  w: number
}

type TextInput = FactoryBaseInput & {
  autoSize?: boolean | undefined
  text: string
  type: 'text'
  w: number
}

type FrameInput = FactoryBaseInput & {
  h: number
  name: string
  type: 'frame'
  w: number
}

type NoteInput = FactoryBaseInput & {
  text: string
  type: 'note'
}

type ArrowInput = Omit<FactoryBaseInput, 'x' | 'y'> & {
  fromPoint: { x: number; y: number }
  toPoint: { x: number; y: number }
  type: 'arrow'
}

export type ShapeInput = ArrowInput | FrameInput | GeoInput | NoteInput | TextInput

function normalizeShapeId(id?: string): TLShapeId {
  if (!id) {
    return createShapeId()
  }

  if (id.startsWith('shape:')) {
    return id as TLShapeId
  }

  return createShapeId(id)
}

function buildBaseShape(input: FactoryBaseInput) {
  return {
    id: normalizeShapeId(input.id),
    index: input.index,
    isLocked: input.isLocked ?? false,
    meta: input.meta ?? {},
    opacity: input.opacity ?? 1,
    parentId: input.pageId,
    rotation: 0,
    typeName: 'shape' as const,
    x: input.x,
    y: input.y
  }
}

function createGeoShape(input: GeoInput): TLGeoShape {
  return {
    ...buildBaseShape(input),
    props: {
      align: 'middle',
      color: input.color ?? DEFAULT_COLOR,
      dash: input.dash ?? DEFAULT_DASH,
      fill: input.fill ?? DEFAULT_FILL,
      font: input.font ?? DEFAULT_FONT,
      geo: input.geo,
      growY: 0,
      h: input.h,
      labelColor: DEFAULT_GEO_LABEL_COLOR,
      richText: toRichText(input.label ?? ''),
      scale: 1,
      size: input.size ?? DEFAULT_SIZE,
      url: '',
      verticalAlign: 'middle',
      w: input.w
    },
    type: 'geo'
  }
}

function createTextShape(input: TextInput): TLTextShape {
  return {
    ...buildBaseShape(input),
    props: {
      autoSize: input.autoSize ?? false,
      color: input.color ?? DEFAULT_COLOR,
      font: input.font ?? DEFAULT_FONT,
      richText: toRichText(input.text),
      scale: 1,
      size: input.size ?? DEFAULT_SIZE,
      textAlign: 'start',
      w: input.w
    },
    type: 'text'
  }
}

function createFrameShape(input: FrameInput): TLFrameShape {
  return {
    ...buildBaseShape(input),
    props: {
      color: input.color ?? DEFAULT_COLOR,
      h: input.h,
      name: input.name,
      w: input.w
    },
    type: 'frame'
  }
}

function createNoteShape(input: NoteInput): TLNoteShape {
  return {
    ...buildBaseShape(input),
    props: {
      align: 'middle',
      color: input.color ?? 'yellow',
      font: input.font ?? DEFAULT_FONT,
      fontSizeAdjustment: 0,
      growY: 0,
      labelColor: DEFAULT_GEO_LABEL_COLOR,
      richText: toRichText(input.text),
      scale: 1,
      size: input.size ?? DEFAULT_SIZE,
      url: '',
      verticalAlign: 'middle'
    },
    type: 'note'
  }
}

function createArrowShape(input: ArrowInput): TLArrowShape {
  const originX = Math.min(input.fromPoint.x, input.toPoint.x)
  const originY = Math.min(input.fromPoint.y, input.toPoint.y)

  return {
    ...buildBaseShape({
      ...input,
      x: originX,
      y: originY
    }),
    props: {
      arrowheadEnd: DEFAULT_ARROWHEAD_END,
      arrowheadStart: DEFAULT_ARROWHEAD_START,
      bend: 0,
      color: input.color ?? DEFAULT_COLOR,
      dash: input.dash ?? DEFAULT_DASH,
      elbowMidPoint: 0.5,
      end: {
        x: input.toPoint.x - originX,
        y: input.toPoint.y - originY
      },
      fill: input.fill ?? DEFAULT_FILL,
      font: input.font ?? DEFAULT_FONT,
      kind: 'arc',
      labelColor: DEFAULT_GEO_LABEL_COLOR,
      labelPosition: 0.5,
      richText: toRichText(input.label ?? ''),
      scale: 1,
      size: input.size ?? DEFAULT_SIZE,
      start: {
        x: input.fromPoint.x - originX,
        y: input.fromPoint.y - originY
      }
    },
    type: 'arrow'
  }
}

export function createShapeRecord(input: ShapeInput): TLShape {
  switch (input.type) {
    case 'arrow':
      return createArrowShape(input)
    case 'frame':
      return createFrameShape(input)
    case 'geo':
      return createGeoShape(input)
    case 'note':
      return createNoteShape(input)
    case 'text':
      return createTextShape(input)
    default: {
      const exhaustive: never = input
      throw new Error(`Unsupported shape input: ${JSON.stringify(exhaustive)}`)
    }
  }
}
