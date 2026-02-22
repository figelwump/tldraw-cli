import { Command } from 'commander'

import { registerAddCommand } from './commands/add.js'
import { registerCreateCommand } from './commands/create.js'
import { registerInfoCommand } from './commands/info.js'
import { registerListCommand } from './commands/list.js'
import { registerRemoveCommand } from './commands/remove.js'

export function createProgram(): Command {
  const program = new Command()

  program
    .name('tldraw')
    .description('Headless CLI for creating and manipulating .tldr files')
    .showHelpAfterError()

  registerCreateCommand(program)
  registerAddCommand(program)
  registerListCommand(program)
  registerRemoveCommand(program)
  registerInfoCommand(program)

  return program
}

export async function runCli(argv = process.argv): Promise<void> {
  const program = createProgram()
  await program.parseAsync(argv)
}
