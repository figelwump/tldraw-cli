import {
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultSizeStyle,
  type TLDefaultColorStyle,
  type TLDefaultDashStyle,
  type TLDefaultFillStyle,
  type TLDefaultFontStyle,
  type TLDefaultSizeStyle
} from '@tldraw/tlschema'

function parseNumber(value: string, label: string): number {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label}: "${value}"`)
  }

  return parsed
}

function parseEnumValue<T extends string>(value: string, allowed: readonly string[], label: string): T {
  if (!allowed.includes(value)) {
    throw new Error(`Invalid ${label}: "${value}". Allowed: ${allowed.join(', ')}`)
  }

  return value as T
}

export function parsePosition(value: string): { x: number; y: number } {
  const [xText, yText, ...rest] = value.split(',')

  if (!xText || !yText || rest.length > 0) {
    throw new Error(`Invalid --pos "${value}". Expected format: x,y`)
  }

  return {
    x: parseNumber(xText.trim(), 'x position'),
    y: parseNumber(yText.trim(), 'y position')
  }
}

export function parsePositionOrNull(value: string): { x: number; y: number } | null {
  try {
    return parsePosition(value)
  } catch {
    return null
  }
}

export function parseSize(value: string): { h: number; w: number } {
  const [wText, hText, ...rest] = value.toLowerCase().split('x')

  if (!wText || !hText || rest.length > 0) {
    throw new Error(`Invalid --size "${value}". Expected format: WxH`)
  }

  const w = parseNumber(wText.trim(), 'width')
  const h = parseNumber(hText.trim(), 'height')

  if (w <= 0 || h <= 0) {
    throw new Error(`Invalid --size "${value}". Width and height must be positive.`)
  }

  return { h, w }
}

export function parseColor(value: string): TLDefaultColorStyle {
  return parseEnumValue<TLDefaultColorStyle>(
    value,
    DefaultColorStyle.values as readonly string[],
    'color'
  )
}

export function parseDash(value: string): TLDefaultDashStyle {
  return parseEnumValue<TLDefaultDashStyle>(
    value,
    DefaultDashStyle.values as readonly string[],
    'dash'
  )
}

export function parseFill(value: string): TLDefaultFillStyle {
  return parseEnumValue<TLDefaultFillStyle>(
    value,
    DefaultFillStyle.values as readonly string[],
    'fill'
  )
}

export function parseFont(value: string): TLDefaultFontStyle {
  return parseEnumValue<TLDefaultFontStyle>(
    value,
    DefaultFontStyle.values as readonly string[],
    'font'
  )
}

export function parseShapeSize(value: string): TLDefaultSizeStyle {
  return parseEnumValue<TLDefaultSizeStyle>(
    value,
    DefaultSizeStyle.values as readonly string[],
    'size'
  )
}
