import pc from 'picocolors'
import type { NewResult } from './generate-script.js'

/** Human-readable summary for the terminal. */
export function formatResult(r: NewResult, name: string): string {
  const lines: string[] = []
  const head = r.dry ? pc.yellow('DRY RUN') : pc.green('Created')
  lines.push(
    `\n  ${head} ${r.scriptType} ${pc.bold(name)} — ${r.units.toLocaleString()} usage units` +
      (r.recordType ? ` on ${pc.cyan(r.recordType)}` : '')
  )
  lines.push('')
  for (const f of r.files) lines.push(`    ${pc.dim(f)}`)
  if (r.addedGlob) lines.push(`    ${pc.dim('deploy.xml')} + ${r.addedGlob}`)
  if (r.registryKey) lines.push(`    registered as ${pc.cyan(`"${r.registryKey}"`)}`)
  lines.push('')
  lines.push(`  ${pc.dim('script id')}  ${r.scriptId} (${r.scriptId.length}/40)`)

  if (r.registryKey) {
    lines.push(`
  Next:
    1. Implement the query (look for TODO).
    2. Add a typed call in your NetSuite client for "${r.registryKey}".
    3. Add a mock fixture, or local dev returns 501.
    4. ${pc.bold('pnpm build && pnpm ns:deploy')} — a new object needs a full deploy.
`)
  } else {
    lines.push(`
  Next:
    1. Implement the entry points (look for TODO).
    2. ${pc.bold('pnpm build && pnpm ns:deploy')} — a new object needs a full deploy.
    3. Confirm it fires: Customization > Scripting > Script Execution Log.

  ${pc.dim(`Not wired to your app: ${r.scriptType} scripts are triggered by NetSuite`)}
  ${pc.dim('on a record type, not called over a URL.')}
`)
  }
  return lines.join('\n')
}
