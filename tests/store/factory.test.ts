import { PageRecordType } from '@tldraw/tlschema'
import { getIndexAbove } from '@tldraw/utils'
import { describe, expect, test } from 'vitest'

import { createShapeRecord } from '../../src/store/factory.js'

const pageId = PageRecordType.createId('page-test')
const index = getIndexAbove()

describe('store/factory', () => {
  test('creates geo shape records', () => {
    const shape = createShapeRecord({
      geo: 'rectangle',
      h: 90,
      index,
      label: 'Header',
      pageId,
      type: 'geo',
      w: 300,
      x: 10,
      y: 20
    })

    expect(shape.type).toBe('geo')
    if (shape.type !== 'geo') {
      throw new Error('Expected geo shape')
    }

    expect(shape.type).toBe('geo')
    expect(shape.props.geo).toBe('rectangle')
    expect(shape.props.w).toBe(300)
    expect(shape.props.h).toBe(90)
  })

  test('creates text shape records', () => {
    const shape = createShapeRecord({
      index,
      pageId,
      text: 'Hello world',
      type: 'text',
      w: 240,
      x: 12,
      y: 18
    })

    expect(shape.type).toBe('text')
    if (shape.type !== 'text') {
      throw new Error('Expected text shape')
    }

    expect(shape.type).toBe('text')
    expect(shape.props.w).toBe(240)
    expect(shape.props.autoSize).toBe(false)
  })

  test('creates arrow shape records from absolute points', () => {
    const shape = createShapeRecord({
      fromPoint: { x: 100, y: 200 },
      index,
      pageId,
      toPoint: { x: 400, y: 240 },
      type: 'arrow'
    })

    expect(shape.type).toBe('arrow')
    if (shape.type !== 'arrow') {
      throw new Error('Expected arrow shape')
    }

    expect(shape.type).toBe('arrow')
    expect(shape.x).toBe(100)
    expect(shape.y).toBe(200)
    expect(shape.props.start).toEqual({ x: 0, y: 0 })
    expect(shape.props.end).toEqual({ x: 300, y: 40 })
  })
})
