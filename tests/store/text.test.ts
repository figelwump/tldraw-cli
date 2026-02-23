import { describe, expect, test } from 'vitest'

import { estimateLabelDimensions } from '../../src/store/text.js'

describe('estimateLabelDimensions', () => {
  test('returns wider dimensions for longer text', () => {
    const short = estimateLabelDimensions('Hi')
    const long = estimateLabelDimensions('This is a much longer label text')

    expect(long.w).toBeGreaterThan(short.w)
  })

  test('multi-line labels increase height', () => {
    const single = estimateLabelDimensions('one line')
    const multi = estimateLabelDimensions('line one\nline two\nline three')

    expect(multi.h).toBeGreaterThan(single.h)
    // Width should be based on the longest line
    expect(multi.w).toBeGreaterThanOrEqual(single.w)
  })

  test('different size styles produce different dimensions', () => {
    const small = estimateLabelDimensions('Hello World', 's')
    const large = estimateLabelDimensions('Hello World', 'l')

    expect(large.w).toBeGreaterThan(small.w)
    expect(large.h).toBeGreaterThan(small.h)
  })

  test('different font styles produce different dimensions', () => {
    const draw = estimateLabelDimensions('Hello World', 'm', 'draw')
    const sans = estimateLabelDimensions('Hello World', 'm', 'sans')

    // draw font is wider than sans at same size
    expect(draw.w).toBeGreaterThan(sans.w)
  })

  test('includes padding in dimensions', () => {
    // Even an empty-ish label should have padding
    const dims = estimateLabelDimensions('X')
    expect(dims.w).toBeGreaterThan(20)
    expect(dims.h).toBeGreaterThan(30)
  })

  test('defaults to draw font and m size for unknown values', () => {
    const withDefaults = estimateLabelDimensions('Test', undefined, undefined)
    const explicit = estimateLabelDimensions('Test', 'm', 'draw')

    expect(withDefaults.w).toBe(explicit.w)
    expect(withDefaults.h).toBe(explicit.h)
  })
})
