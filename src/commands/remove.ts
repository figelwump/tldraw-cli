import type { Command } from 'commander'

import { getCurrentPageId, getShapesOnPage, readTldrawFile, writeTldrawFile } from '../store/io.js'
import { getShapeLabel, isShapeId } from '../store/shapes.js'

export type RemoveCommandOptions = {
  all?: boolean
}

export function resolveRemoveInvocation(
  targetOrFile: string,
  file: string | undefined,
  options: RemoveCommandOptions
): { filePath: string; target?: string } {
  if (options.all) {
    if (file) {
      throw new Error('When using --all, pass only <file> and no target')
    }

    return { filePath: targetOrFile }
  }

  if (!file) {
    throw new Error('Missing file path')
  }

  return {
    filePath: file,
    target: targetOrFile
  }
}

export async function removeShapesFromFile(
  filePath: string,
  target: string | undefined,
  options: RemoveCommandOptions = {}
): Promise<string[]> {
  const store = await readTldrawFile(filePath)
  const pageId = getCurrentPageId(store)
  const shapes = getShapesOnPage(store, pageId)

  const shapeIdsToRemove = (() => {
    if (options.all) {
      return shapes.map((shape) => shape.id)
    }

    if (!target) {
      throw new Error('remove requires a target label/id unless --all is used')
    }

    if (isShapeId(target)) {
      return shapes.filter((shape) => shape.id === target).map((shape) => shape.id)
    }

    return shapes.filter((shape) => getShapeLabel(shape) === target).map((shape) => shape.id)
  })()

  if (shapeIdsToRemove.length === 0) {
    if (options.all) {
      return []
    }

    throw new Error(`No shapes matched target "${target}"`)
  }

  store.remove(shapeIdsToRemove)
  await writeTldrawFile(filePath, store)

  return shapeIdsToRemove
}

export function registerRemoveCommand(program: Command): void {
  program
    .command('remove')
    .description('Remove shapes by id or label')
    .argument('<targetOrFile>', 'Shape id/label, or file path when --all is used')
    .argument('[file]', 'Path to .tldr file')
    .option('--all', 'Remove all shapes (use: remove --all <file>)')
    .action(async (targetOrFile: string, file: string | undefined, options: RemoveCommandOptions) => {
      const invocation = resolveRemoveInvocation(targetOrFile, file, options)
      const removed = await removeShapesFromFile(invocation.filePath, invocation.target, options)
      process.stdout.write(`${removed.length}\n`)
    })
}
