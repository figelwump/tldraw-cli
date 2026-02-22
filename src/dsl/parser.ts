import type { AddShapeCommandOptions } from '../commands/add.js'
import { parsePosition, parseSize } from '../commands/parsers.js'
import { gridShapes, stackShapes, type LayoutDirection } from '../store/layout.js'

const DRAW_SHAPES = ['arrow', 'ellipse', 'frame', 'note', 'rect', 'text'] as const

const DIMENSION_TOKEN_PATTERN = /^\s*\d+(\.\d+)?x\d+(\.\d+)?\s*$/i
const POSITION_TOKEN_PATTERN = /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/
const STACK_HEADER_PATTERN =
  /^stack\s+(vertical|horizontal)\s+(\S+)\s+gap=([0-9]+(?:\.[0-9]+)?)\s*\[$/i
const GRID_HEADER_PATTERN = /^grid\s+(\S+)\s+cols=(\d+)\s+gap=([0-9]+(?:\.[0-9]+)?)\s*\[$/i

const DEFAULT_DIMENSIONS = {
  ellipse: { h: 120, w: 120 },
  frame: { h: 260, w: 460 },
  note: { h: 180, w: 220 },
  rect: { h: 120, w: 220 },
  text: { h: 40, w: 280 }
} as const

const NOTE_DIMENSIONS_BY_SIZE = {
  l: { h: 240, w: 280 },
  m: { h: 180, w: 220 },
  s: { h: 140, w: 180 },
  xl: { h: 300, w: 340 }
} as const

const TEXT_LINE_HEIGHT_BY_SIZE = {
  l: 36,
  m: 28,
  s: 22,
  xl: 44
} as const

type Token = {
  quoted: boolean
  value: string
}

type NonArrowShape = Exclude<DrawShape, 'arrow'>

function isDrawShape(value: string): value is DrawShape {
  return DRAW_SHAPES.includes(value as DrawShape)
}

export type DrawShape = (typeof DRAW_SHAPES)[number]

export type DrawInstruction = {
  content?: string
  options: AddShapeCommandOptions
  shape: DrawShape
}

function stripInlineComment(line: string): string {
  let inQuotes = false
  let escaped = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (!character) {
      continue
    }

    if (character === '"' && !escaped) {
      inQuotes = !inQuotes
    }

    if (character === '#' && !inQuotes) {
      return line.slice(0, index)
    }

    escaped = character === '\\' && !escaped
  }

  return line
}

function tokenize(line: string, context: string): Token[] {
  const tokens: Token[] = []
  let inQuotes = false
  let escaped = false
  let tokenIsQuoted = false
  let current = ''

  const pushCurrent = () => {
    if (current.length > 0) {
      tokens.push({
        quoted: tokenIsQuoted,
        value: current
      })
      current = ''
      tokenIsQuoted = false
    }
  }

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (!character) {
      continue
    }

    if (character === '"' && !escaped) {
      inQuotes = !inQuotes
      tokenIsQuoted = true
      continue
    }

    if (!inQuotes && /\s/.test(character)) {
      pushCurrent()
      escaped = false
      continue
    }

    if (character === '\\' && inQuotes && !escaped) {
      escaped = true
      continue
    }

    current += character
    escaped = false
  }

  if (inQuotes) {
    throw new Error(`Unterminated quote in ${context}`)
  }

  pushCurrent()
  return tokens
}

function isKeyValueToken(value: string): boolean {
  return value.includes('=')
}

function isPositionToken(value: string): boolean {
  return POSITION_TOKEN_PATTERN.test(value)
}

function isDimensionToken(value: string): boolean {
  return DIMENSION_TOKEN_PATTERN.test(value)
}

function parseKeyValue(token: Token, context: string): { key: string; value: string } {
  const separatorIndex = token.value.indexOf('=')
  if (separatorIndex <= 0) {
    throw new Error(`Expected key=value token in ${context}: "${token.value}"`)
  }

  const key = token.value.slice(0, separatorIndex).trim()
  const value = token.value.slice(separatorIndex + 1).trim()

  if (value.length === 0) {
    throw new Error(`Missing value for "${key}" in ${context}`)
  }

  return { key, value }
}

function parseOptionToken(
  token: Token,
  options: AddShapeCommandOptions,
  context: string,
  allowPosition: boolean
): void {
  const { key, value } = parseKeyValue(token, context)

  switch (key) {
    case 'color':
      options.color = value
      return
    case 'dash':
      options.dash = value
      return
    case 'dimensions':
      options.dimensions = value
      return
    case 'fill':
      options.fill = value
      return
    case 'font':
      options.font = value
      return
    case 'from':
      options.from = value
      return
    case 'id':
      options.id = value
      return
    case 'label':
      options.label = value
      return
    case 'pos':
      if (!allowPosition) {
        throw new Error(`Position is not allowed in this context: ${context}`)
      }

      options.pos = value
      return
    case 'size':
      options.size = value
      return
    case 'to':
      options.to = value
      return
    default:
      throw new Error(`Unsupported option "${key}" in ${context}`)
  }
}

function parseArrowInstruction(tokens: Token[], context: string): DrawInstruction {
  const connectorIndex = tokens.findIndex((token) => token.value === '->')
  if (connectorIndex <= 1 || connectorIndex >= tokens.length - 1) {
    throw new Error(`Invalid arrow syntax in ${context}; expected: arrow <from> -> <to>`)
  }

  const from = tokens
    .slice(1, connectorIndex)
    .map((token) => token.value)
    .join(' ')
    .trim()

  const trailingTokens = tokens.slice(connectorIndex + 1)
  const optionStartIndex = trailingTokens.findIndex((token) => isKeyValueToken(token.value))
  const toTokens =
    optionStartIndex === -1 ? trailingTokens : trailingTokens.slice(0, optionStartIndex)
  const to = toTokens
    .map((token) => token.value)
    .join(' ')
    .trim()

  if (!from || !to) {
    throw new Error(`Invalid arrow endpoints in ${context}`)
  }

  const options: AddShapeCommandOptions = {
    from,
    to
  }

  const cursorStart =
    optionStartIndex === -1 ? tokens.length : connectorIndex + 1 + optionStartIndex

  for (let cursor = cursorStart; cursor < tokens.length; cursor += 1) {
    const token = tokens[cursor]
    if (!token) {
      continue
    }

    if (!isKeyValueToken(token.value)) {
      throw new Error(`Unexpected token in ${context}: "${token.value}"`)
    }

    parseOptionToken(token, options, context, true)
  }

  return {
    options,
    shape: 'arrow'
  }
}

function parseBasicShapeInstruction(
  tokens: Token[],
  context: string,
  allowPosition: boolean
): DrawInstruction {
  const shapeToken = tokens[0]?.value
  if (!shapeToken || !isDrawShape(shapeToken) || shapeToken === 'arrow') {
    throw new Error(`Unsupported shape in ${context}: "${shapeToken ?? ''}"`)
  }

  const shape: NonArrowShape = shapeToken
  const options: AddShapeCommandOptions = {}
  let content: string | undefined
  let cursor = 1

  const positionToken = tokens[cursor]
  if (positionToken && isPositionToken(positionToken.value)) {
    if (!allowPosition) {
      throw new Error(`Position is not allowed in ${context}`)
    }

    options.pos = positionToken.value
    cursor += 1
  }

  const dimensionsToken = tokens[cursor]
  if (dimensionsToken && isDimensionToken(dimensionsToken.value)) {
    options.size = dimensionsToken.value
    cursor += 1
  }

  const potentialLabelToken = tokens[cursor]
  if (potentialLabelToken && !isKeyValueToken(potentialLabelToken.value)) {
    content = potentialLabelToken.value
    cursor += 1
  }

  for (; cursor < tokens.length; cursor += 1) {
    const token = tokens[cursor]
    if (!token) {
      continue
    }

    if (!isKeyValueToken(token.value)) {
      throw new Error(`Unexpected token in ${context}: "${token.value}"`)
    }

    parseOptionToken(token, options, context, allowPosition)
  }

  if (shape === 'text' || shape === 'note') {
    if (content && options.label && options.label !== content) {
      throw new Error(`Text content was provided twice in ${context}`)
    }

    const textContent = content ?? options.label
    const { label: _unusedLabel, ...contentOptions } = options

    if (textContent) {
      return {
        content: textContent,
        options: contentOptions,
        shape
      }
    }

    return {
      options: contentOptions,
      shape
    }
  }

  if (content) {
    if (options.label && options.label !== content) {
      throw new Error(`Label was provided twice in ${context}`)
    }

    options.label = content
  }

  return {
    options,
    shape
  }
}

function parseLineInstruction(line: string, context: string, allowPosition: boolean): DrawInstruction {
  const tokens = tokenize(line, context)
  if (tokens.length === 0) {
    throw new Error(`Expected a shape instruction in ${context}`)
  }

  const head = tokens[0]?.value
  if (head === 'arrow') {
    return parseArrowInstruction(tokens, context)
  }

  return parseBasicShapeInstruction(tokens, context, allowPosition)
}

function parseStackHeader(line: string, context: string): {
  direction: LayoutDirection
  gap: number
  origin: { x: number; y: number }
} {
  const match = STACK_HEADER_PATTERN.exec(line)
  if (!match) {
    throw new Error(`Invalid stack syntax in ${context}`)
  }

  const directionText = match[1]
  const originText = match[2]
  const gapText = match[3]

  if (!directionText || !originText || !gapText) {
    throw new Error(`Invalid stack syntax in ${context}`)
  }

  const direction = directionText.toLowerCase() as LayoutDirection
  const origin = parsePosition(originText)
  const gap = Number(gapText)

  if (!Number.isFinite(gap) || gap < 0) {
    throw new Error(`Invalid stack gap in ${context}`)
  }

  return { direction, gap, origin }
}

function parseGridHeader(line: string, context: string): {
  cols: number
  gap: number
  origin: { x: number; y: number }
} {
  const match = GRID_HEADER_PATTERN.exec(line)
  if (!match) {
    throw new Error(`Invalid grid syntax in ${context}`)
  }

  const originText = match[1]
  const colsText = match[2]
  const gapText = match[3]

  if (!originText || !colsText || !gapText) {
    throw new Error(`Invalid grid syntax in ${context}`)
  }

  const origin = parsePosition(originText)
  const cols = Number(colsText)
  const gap = Number(gapText)

  if (!Number.isInteger(cols) || cols <= 0) {
    throw new Error(`Invalid grid cols in ${context}`)
  }

  if (!Number.isFinite(gap) || gap < 0) {
    throw new Error(`Invalid grid gap in ${context}`)
  }

  return { cols, gap, origin }
}

function resolveInstructionDimensions(instruction: DrawInstruction): { h: number; w: number } {
  if (instruction.shape === 'arrow') {
    throw new Error('Arrow instructions are not supported in stack/grid blocks')
  }

  const explicitDimensions = instruction.options.dimensions
  if (explicitDimensions) {
    return parseSize(explicitDimensions)
  }

  const sizeOption = instruction.options.size
  if (sizeOption && isDimensionToken(sizeOption)) {
    return parseSize(sizeOption)
  }

  if (instruction.shape === 'note' && sizeOption && sizeOption in NOTE_DIMENSIONS_BY_SIZE) {
    return NOTE_DIMENSIONS_BY_SIZE[sizeOption as keyof typeof NOTE_DIMENSIONS_BY_SIZE]
  }

  if (instruction.shape === 'text') {
    const textSize = sizeOption && sizeOption in TEXT_LINE_HEIGHT_BY_SIZE ? sizeOption : 'm'
    const lineHeight = TEXT_LINE_HEIGHT_BY_SIZE[textSize as keyof typeof TEXT_LINE_HEIGHT_BY_SIZE]
    const text = instruction.content ?? ''
    const lineCount = Math.max(1, text.split('\n').length)

    return {
      h: lineHeight * lineCount,
      w: DEFAULT_DIMENSIONS.text.w
    }
  }

  return DEFAULT_DIMENSIONS[instruction.shape]
}

type BlockParseResult = {
  instructions: DrawInstruction[]
  nextIndex: number
}

function parseStackBlock(lines: string[], startIndex: number, headerLine: string): BlockParseResult {
  const context = `line ${startIndex + 1}`
  const { direction, gap, origin } = parseStackHeader(headerLine, context)
  const nested: DrawInstruction[] = []

  let index = startIndex + 1
  for (; index < lines.length; index += 1) {
    const rawLine = lines[index]
    if (!rawLine) {
      continue
    }

    const line = stripInlineComment(rawLine).trim()
    if (line.length === 0) {
      continue
    }

    if (line === ']') {
      break
    }

    if (line.startsWith('stack ') || line.startsWith('grid ')) {
      throw new Error(`Nested layout blocks are not supported (line ${index + 1})`)
    }

    const parsed = parseLineInstruction(line, `line ${index + 1}`, false)
    if (parsed.shape === 'arrow') {
      throw new Error(`Arrow instructions are not supported in stack blocks (line ${index + 1})`)
    }

    nested.push(parsed)
  }

  const closingLine = lines[index]
  const normalizedClosingLine = closingLine ? stripInlineComment(closingLine).trim() : ''

  if (index >= lines.length || normalizedClosingLine !== ']') {
    throw new Error(`Unterminated stack block starting at ${context}`)
  }

  const positioned = stackShapes(
    nested.map((instruction) => {
      const dimensions = resolveInstructionDimensions(instruction)
      return {
        ...dimensions,
        instruction
      }
    }),
    direction,
    origin,
    gap
  )

  return {
    instructions: positioned.map((entry) => ({
      ...entry.instruction,
      options: {
        ...entry.instruction.options,
        pos: `${entry.x},${entry.y}`
      }
    })),
    nextIndex: index
  }
}

function parseGridBlock(lines: string[], startIndex: number, headerLine: string): BlockParseResult {
  const context = `line ${startIndex + 1}`
  const { cols, gap, origin } = parseGridHeader(headerLine, context)
  const nested: DrawInstruction[] = []

  let index = startIndex + 1
  for (; index < lines.length; index += 1) {
    const rawLine = lines[index]
    if (!rawLine) {
      continue
    }

    const line = stripInlineComment(rawLine).trim()
    if (line.length === 0) {
      continue
    }

    if (line === ']') {
      break
    }

    if (line.startsWith('stack ') || line.startsWith('grid ')) {
      throw new Error(`Nested layout blocks are not supported (line ${index + 1})`)
    }

    const parsed = parseLineInstruction(line, `line ${index + 1}`, false)
    if (parsed.shape === 'arrow') {
      throw new Error(`Arrow instructions are not supported in grid blocks (line ${index + 1})`)
    }

    nested.push(parsed)
  }

  const closingLine = lines[index]
  const normalizedClosingLine = closingLine ? stripInlineComment(closingLine).trim() : ''

  if (index >= lines.length || normalizedClosingLine !== ']') {
    throw new Error(`Unterminated grid block starting at ${context}`)
  }

  const positioned = gridShapes(
    nested.map((instruction) => {
      const dimensions = resolveInstructionDimensions(instruction)
      return {
        ...dimensions,
        instruction
      }
    }),
    origin,
    cols,
    gap
  )

  return {
    instructions: positioned.map((entry) => ({
      ...entry.instruction,
      options: {
        ...entry.instruction.options,
        pos: `${entry.x},${entry.y}`
      }
    })),
    nextIndex: index
  }
}

export function parseDsl(input: string): DrawInstruction[] {
  const lines = input.split(/\r?\n/)
  const instructions: DrawInstruction[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    if (!rawLine) {
      continue
    }

    const line = stripInlineComment(rawLine).trim()
    if (line.length === 0) {
      continue
    }

    if (line.startsWith('stack ')) {
      const parsedBlock = parseStackBlock(lines, index, line)
      instructions.push(...parsedBlock.instructions)
      index = parsedBlock.nextIndex
      continue
    }

    if (line.startsWith('grid ')) {
      const parsedBlock = parseGridBlock(lines, index, line)
      instructions.push(...parsedBlock.instructions)
      index = parsedBlock.nextIndex
      continue
    }

    instructions.push(parseLineInstruction(line, `line ${index + 1}`, true))
  }

  return instructions
}
