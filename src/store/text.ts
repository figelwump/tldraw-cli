/**
 * Shared text dimension estimation utilities for tldraw shapes.
 *
 * Since we run in Node.js with no canvas API, we use character-count heuristics
 * calibrated against tldraw's actual font rendering to estimate how much space
 * text labels need inside geo shapes.
 */

// Average character widths (in pixels) per font family × size tier.
// Calibrated by measuring tldraw's actual rendering of sample text.
const AVG_CHAR_WIDTHS: Record<string, Record<string, number>> = {
  draw: { l: 14, m: 11, s: 8, xl: 18 },
  mono: { l: 13, m: 10, s: 7.5, xl: 16 },
  sans: { l: 12, m: 9.5, s: 7, xl: 15 },
  serif: { l: 12, m: 9.5, s: 7, xl: 15 }
}

// Horizontal padding inside a geo shape label (20px each side)
const GEO_LABEL_H_PADDING = 40

// Vertical padding inside a geo shape label (18px top + 18px bottom)
const GEO_LABEL_V_PADDING = 36

// Line height per size tier — used for multi-line text height calculation.
// Single source of truth; previously duplicated in parser.ts and shapes.ts.
export const TEXT_LINE_HEIGHT_BY_SIZE: Record<string, number> = {
  l: 36,
  m: 28,
  s: 22,
  xl: 44
}

// Note shape dimensions per size tier.
// Single source of truth; previously duplicated in parser.ts and shapes.ts.
export const NOTE_DIMENSIONS_BY_SIZE: Record<string, { h: number; w: number }> = {
  l: { h: 240, w: 280 },
  m: { h: 180, w: 220 },
  s: { h: 140, w: 180 },
  xl: { h: 300, w: 340 }
}

/**
 * Estimate the minimum bounding box needed to display a label inside a geo shape,
 * including padding. Handles multi-line labels (split on `\n`).
 */
export function estimateLabelDimensions(
  label: string,
  size?: string,
  font?: string
): { h: number; w: number } {
  const resolvedSize = size && size in TEXT_LINE_HEIGHT_BY_SIZE ? size : 'm'
  const resolvedFont = font && font in AVG_CHAR_WIDTHS ? font : 'draw'

  const charWidth = AVG_CHAR_WIDTHS[resolvedFont]?.[resolvedSize] ?? 11
  const lineHeight = TEXT_LINE_HEIGHT_BY_SIZE[resolvedSize] ?? 28

  const lines = label.split('\n')
  const longestLineLength = Math.max(...lines.map((line) => line.length))
  const lineCount = Math.max(1, lines.length)

  const w = Math.ceil(longestLineLength * charWidth) + GEO_LABEL_H_PADDING
  const h = lineCount * lineHeight + GEO_LABEL_V_PADDING

  return { h, w }
}
