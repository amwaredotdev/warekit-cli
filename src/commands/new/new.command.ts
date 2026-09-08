import { Command } from 'commander'
import prompts from 'prompts'
import { formatResult } from '../../utils/format-result.js'
import { generate } from '../../utils/generate-script.js'
import { log, pc } from '../../utils/logger.js'
import { SCRIPT_TYPES, slug } from '../../templates/index.js'

/**
 * `warekit new` — scaffold a NetSuite script.
 *
 * The command owns argument parsing and prompting. The work is in
 * utils/generate-script, which the MCP server also calls.
 */
export function newCommand(): Command {
  return new Command('new')
    .argument('[type]', `one of: ${Object.keys(SCRIPT_TYPES).join(', ')}`)
    .argument('[name]', 'script name, e.g. customers')
    .option('-m, --methods <list>', 'entry points, comma separated')
    .option('-r, --record <type>', 'record type for client / user-event scripts')
    .option('--dry', 'print what would be written, change nothing')
    .description('Scaffold a Suitelet, RESTlet, client script or user event script')
    .action(async (type?: string, name?: string, opts?: Record<string, unknown>) => {
      try {
        let scriptType = type
        let scriptName = name
        let record = opts?.record as string | undefined
        const methods = (opts?.methods as string | undefined)
          ?.split(',')
          .map((m) => m.trim())
          .filter(Boolean)

        // Prompting needs a terminal. In CI or a script there is nobody to
        // answer, and prompts resolves empty — which would exit 0 having done
        // nothing. Fail loudly with the flag to pass instead.
        const interactive = Boolean(process.stdin.isTTY)

        if ((!scriptType || !scriptName) && !interactive) {
          throw new Error(
            'Not a terminal, so there is nothing to prompt.\n' +
              '  Pass the type and name: warekit new <type> <name>'
          )
        }

        if (!scriptType || !scriptName) {
          log.blank()
          for (const [k, v] of Object.entries(SCRIPT_TYPES)) {
            log.step(
              `${pc.bold(k.padEnd(12))} ${String(v.units).padStart(5)} units  ${pc.dim(v.blurb)}`
            )
          }
          log.blank()
          const answers = await prompts(
            [
              {
                type: scriptType ? null : 'select',
                name: 'type',
                message: 'Script type',
                choices: Object.entries(SCRIPT_TYPES).map(([k, v]) => ({
                  title: k,
                  description: `${v.units} units — ${v.blurb}`,
                  value: k
                }))
              },
              {
                type: scriptName ? null : 'text',
                name: 'name',
                message: 'Name',
                validate: (v: string) => (slug(v) ? true : 'A name is required')
              }
            ],
            { onCancel: () => process.exit(1) }
          )
          scriptType = scriptType ?? answers.type
          scriptName = scriptName ?? answers.name
        }

        const needsRecord = SCRIPT_TYPES[scriptType!]?.recordBound && !record
        if (needsRecord && !interactive) {
          throw new Error(
            `${scriptType} scripts deploy against a record type.\n` +
              '  Pass --record CUSTOMER, or --record "[scriptid=customrecord_x]".'
          )
        }
        if (needsRecord) {
          log.dim('\n  Built-in records are uppercase (CUSTOMER, SALESORDER).')
          log.dim('  Custom records use [scriptid=customrecord_x].\n')
          const a = await prompts(
            {
              type: 'text',
              name: 'record',
              message: 'Record type',
              initial: 'CUSTOMER'
            },
            { onCancel: () => process.exit(1) }
          )
          record = a.record
        }

        const result = generate({
          type: scriptType!,
          name: scriptName!,
          methods,
          record,
          dry: Boolean(opts?.dry)
        })
        log.info(formatResult(result, scriptName!))
      } catch (e) {
        log.error((e as Error).message)
        process.exit(1)
      }
    })
}
