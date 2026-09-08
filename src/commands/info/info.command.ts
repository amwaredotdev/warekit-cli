import { Command } from 'commander'
import { log, pc } from '../../utils/logger.js'
import { withProject } from '../../utils/with-project.js'

/** `warekit info` — show the resolved project manifest. */
export function infoCommand(): Command {
  return new Command('info')
    .description('Show the resolved WareKit project manifest')
    .option('-C, --cwd <dir>', 'directory to resolve from')
    .action(async (opts: { cwd?: string }) => {
      await withProject(opts.cwd, ({ root, manifest }) => {
        const { publisherId, projectId, scriptPrefix } = manifest.identity
        log.info(`
  ${pc.bold('WareKit project')}  ${pc.dim(root)}

    kit         ${manifest.kit} (${manifest.edition})${manifest.kitVersion ? ` @ ${manifest.kitVersion}` : ''}
    suiteapp    ${publisherId}.${projectId}
    prefix      ${scriptPrefix}_
    types       ${Object.keys(manifest.paths.scripting).join(', ')}
`)
      })
    })
}
