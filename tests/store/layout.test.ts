import { describe, expect, test } from 'vitest'

import { gridShapes, stackShapes } from '../../src/store/layout.js'

describe('layout helpers', () => {
  test('stacks shapes vertically', () => {
    const positioned = stackShapes(
      [
        { h: 20, id: 'a', w: 100 },
        { h: 30, id: 'b', w: 90 }
      ],
      'vertical',
      { x: 10, y: 15 },
      5
    )

    expect(positioned).toEqual([
      { h: 20, id: 'a', w: 100, x: 10, y: 15 },
      { h: 30, id: 'b', w: 90, x: 10, y: 40 }
    ])
  })

  test('stacks shapes horizontally', () => {
    const positioned = stackShapes(
      [
        { h: 20, id: 'a', w: 100 },
        { h: 30, id: 'b', w: 90 }
      ],
      'horizontal',
      { x: 10, y: 15 },
      5
    )

    expect(positioned).toEqual([
      { h: 20, id: 'a', w: 100, x: 10, y: 15 },
      { h: 30, id: 'b', w: 90, x: 115, y: 15 }
    ])
  })

  test('arranges shapes in a grid using max row and column dimensions', () => {
    const positioned = gridShapes(
      [
        { h: 20, id: 'a', w: 100 },
        { h: 40, id: 'b', w: 90 },
        { h: 30, id: 'c', w: 80 }
      ],
      { x: 5, y: 10 },
      2,
      10
    )

    expect(positioned).toEqual([
      { h: 20, id: 'a', w: 100, x: 5, y: 10 },
      { h: 40, id: 'b', w: 90, x: 115, y: 10 },
      { h: 30, id: 'c', w: 80, x: 5, y: 60 }
    ])
  })
})
