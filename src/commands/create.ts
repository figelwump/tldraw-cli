import { access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'

import type { Command } from 'commander'

import { createEmptyStore, writeTldrawFile } from '../store/io.js'

export type CreateCommandOptions = {
  name?: string
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function createFile(filePath: string, options: CreateCommandOptions = {}): Promise<void> {
  if (await fileExists(filePath)) {
    throw new Error(`Refusing to overwrite existing file: ${filePath}`)
  }

  const { store } = createEmptyStore(options.name)
  await writeTldrawFile(filePath, store)
}

export function registerCreateCommand(program: Command): void {
  program
    .command('create')
    .description('Create a new empty .tldr document')
    .argument('<file>', 'Path to .tldr file')
    .option('--name <name>', 'Document name')
    .action(async (file: string, options: CreateCommandOptions) => {
      await createFile(file, options)
    })
}
