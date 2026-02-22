import type { TLPageId, TLShape, TLStore } from '@tldraw/tlschema'

import { getShapeBounds } from './shapes.js'

export type LayoutDirection = 'horizontal' | 'vertical'

export type LayoutShape = {
  h: number
  w: number
}

type LayoutOrigin = {
  x: number
  y: number
}

function validateDimension(label: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${label}: ${value}. Must be a positive number.`)
  }
}

function validateGap(gap: number): void {
  if (!Number.isFinite(gap) || gap < 0) {
    throw new Error(`Invalid gap: ${gap}. Must be zero or greater.`)
  }
}

function validateOrigin(origin: LayoutOrigin): void {
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) {
    throw new Error(`Invalid origin: ${JSON.stringify(origin)}`)
  }
}

export function getShapesOnPage(store: TLStore, pageId: TLPageId): TLShape[] {
  return store
    .allRecords()
    .filter((record): record is TLShape => record.typeName === 'shape' && record.parentId === pageId)
}

export function stackShapes<T extends LayoutShape>(
  shapes: T[],
  direction: LayoutDirection,
  origin: LayoutOrigin,
  gap: number
): Array<T & { x: number; y: number }> {
  validateOrigin(origin)
  validateGap(gap)

  let cursorX = origin.x
  let cursorY = origin.y

  return shapes.map((shape) => {
    validateDimension('width', shape.w)
    validateDimension('height', shape.h)

    const positioned = {
      ...shape,
      x: cursorX,
      y: cursorY
    }

    if (direction === 'vertical') {
      cursorY += shape.h + gap
    } else {
      cursorX += shape.w + gap
    }

    return positioned
  })
}

export function gridShapes<T extends LayoutShape>(
  shapes: T[],
  origin: LayoutOrigin,
  cols: number,
  gap: number
): Array<T & { x: number; y: number }> {
  validateOrigin(origin)
  validateGap(gap)

  if (!Number.isInteger(cols) || cols <= 0) {
    throw new Error(`Invalid cols: ${cols}. Must be a positive integer.`)
  }

  if (shapes.length === 0) {
    return []
  }

  const rowCount = Math.ceil(shapes.length / cols)
  const colWidths = new Array<number>(cols).fill(0)
  const rowHeights = new Array<number>(rowCount).fill(0)

  for (let index = 0; index < shapes.length; index += 1) {
    const shape = shapes[index]
    if (!shape) {
      continue
    }

    validateDimension('width', shape.w)
    validateDimension('height', shape.h)

    const col = index % cols
    const row = Math.floor(index / cols)
    colWidths[col] = Math.max(colWidths[col] ?? 0, shape.w)
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, shape.h)
  }

  const colOffsets = new Array<number>(cols).fill(origin.x)
  for (let col = 1; col < cols; col += 1) {
    const previousOffset = colOffsets[col - 1] ?? origin.x
    const previousWidth = colWidths[col - 1] ?? 0
    colOffsets[col] = previousOffset + previousWidth + gap
  }

  const rowOffsets = new Array<number>(rowCount).fill(origin.y)
  for (let row = 1; row < rowCount; row += 1) {
    const previousOffset = rowOffsets[row - 1] ?? origin.y
    const previousHeight = rowHeights[row - 1] ?? 0
    rowOffsets[row] = previousOffset + previousHeight + gap
  }

  return shapes.map((shape, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    return {
      ...shape,
      x: colOffsets[col] ?? origin.x,
      y: rowOffsets[row] ?? origin.y
    }
  })
}

export function autoPlace(store: TLStore, pageId: TLPageId): { x: number; y: number } {
  const shapes = getShapesOnPage(store, pageId)

  if (shapes.length === 0) {
    return { x: 0, y: 0 }
  }

  let maxBottom = Number.NEGATIVE_INFINITY

  for (const shape of shapes) {
    const bounds = getShapeBounds(shape)
    maxBottom = Math.max(maxBottom, bounds.y + bounds.h)
  }

  if (!Number.isFinite(maxBottom)) {
    return { x: 0, y: 0 }
  }

  return { x: 0, y: Math.ceil(maxBottom + 40) }
}
