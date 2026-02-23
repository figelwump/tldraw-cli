import { PageRecordType, type TLGeoShape, type TLShape } from '@tldraw/tlschema'
import { getIndexAbove } from '@tldraw/utils'
import { describe, expect, test } from 'vitest'

import { createShapeRecord } from '../../src/store/factory.js'
import { getShapeBorderPoint } from '../../src/store/shapes.js'

const pageId = PageRecordType.createId('page-test')
const index = getIndexAbove()

function makeRect(x: number, y: number, w: number, h: number): TLShape {
  return createShapeRecord({
    geo: 'rectangle',
    h,
    index,
    pageId,
    type: 'geo',
    w,
    x,
    y
  })
}

function makeEllipse(x: number, y: number, w: number, h: number): TLShape {
  return createShapeRecord({
    geo: 'ellipse',
    h,
    index,
    pageId,
    type: 'geo',
    w,
    x,
    y
  })
}

describe('getShapeBorderPoint', () => {
  test('returns point on right edge when target is to the right', () => {
    const rect = makeRect(0, 0, 200, 100)
    // Center is (100, 50), target is far to the right
    const border = getShapeBorderPoint(rect, { x: 500, y: 50 }, 0)

    // Should be on the right edge: x ≈ 200, y ≈ 50
    expect(border.x).toBeCloseTo(200, 0)
    expect(border.y).toBeCloseTo(50, 0)
  })

  test('returns point on bottom edge when target is below', () => {
    const rect = makeRect(0, 0, 200, 100)
    // Center is (100, 50), target is far below
    const border = getShapeBorderPoint(rect, { x: 100, y: 500 }, 0)

    // Should be on the bottom edge: x ≈ 100, y ≈ 100
    expect(border.x).toBeCloseTo(100, 0)
    expect(border.y).toBeCloseTo(100, 0)
  })

  test('returns point on left edge when target is to the left', () => {
    const rect = makeRect(100, 100, 200, 100)
    // Center is (200, 150), target is far to the left
    const border = getShapeBorderPoint(rect, { x: -500, y: 150 }, 0)

    // Should be on the left edge: x ≈ 100, y ≈ 150
    expect(border.x).toBeCloseTo(100, 0)
    expect(border.y).toBeCloseTo(150, 0)
  })

  test('returns point on top edge when target is above', () => {
    const rect = makeRect(0, 100, 200, 100)
    // Center is (100, 150), target is far above
    const border = getShapeBorderPoint(rect, { x: 100, y: -500 }, 0)

    // Should be on the top edge: x ≈ 100, y ≈ 100
    expect(border.x).toBeCloseTo(100, 0)
    expect(border.y).toBeCloseTo(100, 0)
  })

  test('handles diagonal target (exits through bottom edge)', () => {
    const rect = makeRect(0, 0, 200, 100)
    // Center is (100, 50), target is at (500, 500) — diagonal, steep enough to exit bottom
    // dx=400, dy=450, tX=100/400=0.25, tY=50/450≈0.111 → exits bottom (tY < tX)
    const border = getShapeBorderPoint(rect, { x: 500, y: 500 }, 0)

    // Should exit through the bottom edge (y ≈ 100)
    expect(border.y).toBeCloseTo(100, 0)
    // x should be between center and right edge
    expect(border.x).toBeCloseTo(100 + 400 * (50 / 450), 0) // ≈ 144.4
  })

  test('adds padding to move point slightly outside the border', () => {
    const rect = makeRect(0, 0, 200, 100)
    const noPadding = getShapeBorderPoint(rect, { x: 500, y: 50 }, 0)
    const withPadding = getShapeBorderPoint(rect, { x: 500, y: 50 }, 8)

    // With padding, point should be further from center than without
    expect(withPadding.x).toBeGreaterThan(noPadding.x)
  })

  test('works for ellipses at origin', () => {
    const ellipse = makeEllipse(0, 0, 200, 100)
    // Center is (100, 50), target is far to the right
    const border = getShapeBorderPoint(ellipse, { x: 500, y: 50 }, 0)

    // For a horizontal ellipse, right border point should be near x=200
    expect(border.x).toBeCloseTo(200, 0)
    expect(border.y).toBeCloseTo(50, 0)
  })

  test('works for ellipses at non-zero origin', () => {
    const ellipse = makeEllipse(200, 300, 160, 80)
    // Center is (280, 340), target is far below
    const border = getShapeBorderPoint(ellipse, { x: 280, y: 800 }, 0)

    // Should exit through bottom of ellipse: x ≈ 280, y ≈ 380
    expect(border.x).toBeCloseTo(280, 0)
    expect(border.y).toBeCloseTo(380, 0)
  })

  test('returns center when target is at center (degenerate)', () => {
    const rect = makeRect(0, 0, 200, 100)
    const border = getShapeBorderPoint(rect, { x: 100, y: 50 })

    expect(border.x).toBe(100)
    expect(border.y).toBe(50)
  })
})
