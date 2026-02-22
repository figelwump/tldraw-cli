import { Command } from 'commander'

import { registerAddCommand } from './commands/add.js'
import { registerCreateCommand } from './commands/create.js'
import { registerDrawCommand } from './commands/draw.js'
import { registerExportCommand } from './commands/export.js'
import { registerInfoCommand } from './commands/info.js'
import { registerListCommand } from './commands/list.js'
import { registerOpenCommand } from './commands/open.js'
import { registerRemoveCommand } from './commands/remove.js'

export function createProgram(): Command {
  const program = new Command()

  program
    .name('tldraw')
    .description('Headless CLI for creating and manipulating .tldr files')
    .showHelpAfterError()

  registerCreateCommand(program)
  registerAddCommand(program)
  registerDrawCommand(program)
  registerExportCommand(program)
  registerOpenCommand(program)
  registerListCommand(program)
  registerRemoveCommand(program)
  registerInfoCommand(program)

  return program
}

export async function runCli(argv = process.argv): Promise<void> {
  const program = createProgram()
  await program.parseAsync(argv)
}
