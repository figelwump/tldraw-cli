import { describe, expect, test } from 'vitest'

import { parseDsl } from '../../src/dsl/parser.js'

describe('dsl parser', () => {
  test('parses core shape and arrow instructions', () => {
    const instructions = parseDsl(`
      # comment
      rect 0,0 800x60 "Header" fill=semi color=blue
      text 10,90 "Login Page" font=mono size=l
      arrow "Header" -> "Login Page" color=red
    `)

    expect(instructions).toHaveLength(3)
    expect(instructions[0]).toEqual({
      options: {
        color: 'blue',
        fill: 'semi',
        label: 'Header',
        pos: '0,0',
        size: '800x60'
      },
      shape: 'rect'
    })

    expect(instructions[1]).toEqual({
      content: 'Login Page',
      options: {
        font: 'mono',
        pos: '10,90',
        size: 'l'
      },
      shape: 'text'
    })

    expect(instructions[2]).toEqual({
      options: {
        color: 'red',
        from: 'Header',
        to: 'Login Page'
      },
      shape: 'arrow'
    })
  })

  test('expands stack blocks into positioned instructions', () => {
    const instructions = parseDsl(`
      stack vertical 10,20 gap=15 [
        rect 100x30 "Top"
        rect 200x40 "Bottom"
      ]
    `)

    expect(instructions).toHaveLength(2)
    expect(instructions[0]).toEqual({
      options: {
        label: 'Top',
        pos: '10,20',
        size: '100x30'
      },
      shape: 'rect'
    })

    expect(instructions[1]).toEqual({
      options: {
        label: 'Bottom',
        pos: '10,65',
        size: '200x40'
      },
      shape: 'rect'
    })
  })

  test('expands grid blocks with column and row spacing', () => {
    const instructions = parseDsl(`
      grid 0,0 cols=2 gap=10 [
        rect 100x20 "A"
        rect 80x40 "B"
        rect 60x30 "C"
      ]
    `)

    expect(instructions).toHaveLength(3)
    expect(instructions[0]?.options.pos).toBe('0,0')
    expect(instructions[1]?.options.pos).toBe('110,0')
    expect(instructions[2]?.options.pos).toBe('0,50')
  })

  test('rejects arrows inside layout blocks', () => {
    expect(() =>
      parseDsl(`
        stack vertical 0,0 gap=10 [
          rect 100x40 "A"
          arrow "A" -> "B"
        ]
      `)
    ).toThrow('Arrow instructions are not supported')
  })

  test('allows layout block closing bracket with trailing comments', () => {
    const instructions = parseDsl(`
      stack vertical 0,0 gap=10 [
        rect 100x40 "A"
      ] # close stack
    `)

    expect(instructions).toHaveLength(1)
    expect(instructions[0]?.options.pos).toBe('0,0')
  })

  test('parses multi-word arrow endpoints without quotes', () => {
    const instructions = parseDsl(`
      arrow Source Node -> Target Node color=red
    `)

    expect(instructions).toEqual([
      {
        options: {
          color: 'red',
          from: 'Source Node',
          to: 'Target Node'
        },
        shape: 'arrow'
      }
    ])
  })

  test('rejects duplicate text content declarations', () => {
    expect(() => parseDsl(`text 0,0 "Hello" label=World`)).toThrow('provided twice')
  })
})
