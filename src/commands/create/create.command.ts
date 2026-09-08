import { Command } from 'commander'
import { log, pc } from '../../utils/logger.js'

const KIT_REPO = 'https://github.com/amwaredotdev/warekit-react-netsuite-lite.git'

/**
 * `warekit create` — start a new project.
 *
 * Prints the steps rather than cloning. The kit is a private repository, and
 * a command that pretends to clone something it cannot reach fails in a
 * worse way than one that tells you exactly what to run.
 */
export function createCommand(): Command {
  return new Command('create')
    .argument('[dir]', 'directory to create', 'my-app')
    .description('How to start a new WareKit project')
    .action((dir: string) => {
      log.info(`
  ${pc.bold('Create a WareKit project')}

    ${pc.cyan(`git clone ${KIT_REPO} ${dir}`)}
    ${pc.cyan(`cd ${dir}`)}
    ${pc.cyan('git remote set-url origin <your repo>')}
    ${pc.cyan(`git remote add upstream ${KIT_REPO}`)}
    ${pc.cyan('pnpm install && cp .env.example .env && pnpm dev')}

  Keeping ${pc.bold('upstream')} pointed at the kit is what lets you merge
  releases later. See docs/updating.md in the project.

  ${pc.dim('Need access? https://amware.dev')}
`)
    })
}
