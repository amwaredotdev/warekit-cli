import { loadManifest, type LoadedManifest } from './manifest.js'
import { log } from './logger.js'

/**
 * Run an action inside a resolved WareKit project.
 *
 * Every command that touches a project needs the same three things: find the
 * manifest, fail with a readable message when there isn't one, and exit 1 on
 * error rather than printing a stack trace. Doing it here keeps commands to
 * their actual job.
 */
export async function withProject<T>(
  cwd: string | undefined,
  action: (project: LoadedManifest) => T | Promise<T>
): Promise<T> {
  try {
    return await action(loadManifest(cwd))
  } catch (e) {
    log.error((e as Error).message)
    process.exit(1)
  }
}
