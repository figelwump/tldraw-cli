import type { TLPageId, TLShape, TLStore } from '@tldraw/tlschema'

import { getShapeBounds } from './shapes.js'

export function getShapesOnPage(store: TLStore, pageId: TLPageId): TLShape[] {
  return store
    .allRecords()
    .filter((record): record is TLShape => record.typeName === 'shape' && record.parentId === pageId)
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
