import { Command } from 'commander'
import { createCommand } from './commands/create/create.command.js'
import { infoCommand } from './commands/info/info.command.js'
import { newCommand } from './commands/new/new.command.js'
import { findManifest } from './utils/manifest.js'
import { log, pc } from './utils/logger.js'
import { VERSION } from './version.js'

const program = new Command()
  .name('warekit')
  .description('Scaffold and manage NetSuite apps built with WareKit.')
  .version(VERSION)

program.addCommand(newCommand())
program.addCommand(infoCommand())
program.addCommand(createCommand())

if (process.argv.slice(2).length) {
  program.parse()
} else {
  program.outputHelp()
  if (!findManifest()) {
    log.info(pc.dim('\n  No warekit.json here — run inside a WareKit project.\n'))
  }
}
