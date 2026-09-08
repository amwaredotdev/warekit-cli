import pc from 'picocolors'

/**
 * Terminal output helpers.
 *
 * Centralised so every command speaks with the same voice, and so colour can
 * be turned off in one place. picocolors already honours NO_COLOR and
 * non-TTY stdout.
 */
export const log = {
  info: (msg: string) => console.log(msg),
  step: (msg: string) => console.log(`  ${msg}`),
  dim: (msg: string) => console.log(pc.dim(`  ${msg}`)),
  success: (msg: string) => console.log(`  ${pc.green('✓')} ${msg}`),
  warn: (msg: string) => console.warn(`  ${pc.yellow('!')} ${msg}`),
  error: (msg: string) => console.error(`\n  ${pc.red(msg)}\n`),
  blank: () => console.log('')
}

export { pc }
