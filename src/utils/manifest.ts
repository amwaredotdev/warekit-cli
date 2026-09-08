import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'

/**
 * The contract between this CLI and a WareKit project.
 *
 * This is the whole reason the CLI can live in its own repository. When the
 * generator lived inside the kit it could hardcode
 * `apps/suiteapp/template/FileCabinet/SuiteApps/com.amware.myapplication/...`,
 * because it only ever ran against the tree it shipped in. A standalone CLI
 * runs against projects it did not create, on kit versions it predates, in
 * layouts the owner has since reorganised.
 *
 * So a project declares where things are, and the CLI writes only where it is
 * told. A missing or malformed manifest is a hard error rather than a guess —
 * guessing means scaffolding into the wrong folder and failing at deploy time,
 * which is far more expensive to diagnose.
 */

export const ManifestSchema = z.object({
  /** Schema version. Bumped when the shape changes incompatibly. */
  version: z.literal(1),

  /** Which kit this project came from, e.g. "netsuite". */
  kit: z.string().min(1),

  /**
   * Which edition. Defaults to lite.
   *
   * Pro-only commands read this rather than guessing from what happens to be
   * on disk: a Lite project with a Pro folder copied into it is still Lite,
   * and failing closed with an upgrade prompt is the honest behaviour.
   */
  edition: z.enum(['lite', 'pro']).default('lite'),

  /**
   * Display name, e.g. "WareKit React NetSuite (Lite)". Optional: tooling
   * that has to name the kit reads this instead of hardcoding one, because
   * the same tooling files are shared between kits.
   */
  name: z.string().min(1).optional(),

  /** The kit release the project was created from, for update checks. */
  kitVersion: z.string().optional(),

  identity: z.object({
    /** Reverse-domain publisher, e.g. com.amware */
    publisherId: z.string().min(1),
    /** Project id, e.g. myapplication */
    projectId: z.string().min(1),
    /**
     * Script prefix, e.g. amw. 3-4 characters: NetSuite caps
     * customscript_/customdeploy_ IDs at 40 and a long prefix eats the budget
     * every endpoint name has to fit inside.
     */
    scriptPrefix: z.string().min(1).max(8)
  }),

  paths: z.object({
    /** SDF project root, relative to the manifest. */
    suiteapp: z.string().min(1),
    /**
     * Where SuiteScript sources live inside the SDF project. Keyed by script
     * type so a project can organise them however it likes.
     */
    scripting: z.record(z.string(), z.string()),
    /** Where SDF script objects live. */
    objects: z.string().min(1),
    /** deploy.xml, relative to the manifest. */
    deployXml: z.string().min(1),
    /** The Suitelet holding the endpoint registry. Optional. */
    endpointRegistry: z.string().optional()
  })
})

export type Manifest = z.infer<typeof ManifestSchema>

export interface LoadedManifest {
  /** Directory containing warekit.json. All paths resolve from here. */
  root: string
  manifest: Manifest
}

/** Walk up from `from` looking for warekit.json, the way git finds .git. */
export function findManifest(from = process.cwd()): string | null {
  let dir = resolve(from)
  for (;;) {
    const candidate = join(dir, 'warekit.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export function loadManifest(from = process.cwd()): LoadedManifest {
  const file = findManifest(from)
  if (!file) {
    throw new Error(
      'No warekit.json found in this directory or any parent.\n' +
        '  Run this inside a WareKit project, or create one with `warekit create`.'
    )
  }

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (cause) {
    throw new Error(`${file} is not valid JSON.\n  ${(cause as Error).message}`, {
      cause
    })
  }

  const parsed = ManifestSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `    ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(`${file} is not a valid WareKit manifest.\n${issues}`)
  }

  return { root: dirname(file), manifest: parsed.data }
}

/** Resolved absolute paths for one script type. */
export function resolvePaths(loaded: LoadedManifest, scriptType: string) {
  const { root, manifest } = loaded
  const { publisherId, projectId } = manifest.identity
  const suiteApp = `${publisherId}.${projectId}`

  const scriptingDir = manifest.paths.scripting[scriptType]
  if (!scriptingDir) {
    throw new Error(
      `warekit.json does not say where "${scriptType}" scripts live.\n` +
        `  Add it under paths.scripting, e.g. "${scriptType}": "Scripting/${scriptType}s".\n` +
        `  Known: ${Object.keys(manifest.paths.scripting).join(', ') || '(none)'}`
    )
  }

  const suiteappRoot = join(root, manifest.paths.suiteapp)

  return {
    suiteApp,
    suiteappRoot,
    /** Absolute directory for this script type's sources. */
    scriptDir: join(suiteappRoot, 'FileCabinet/SuiteApps', suiteApp, scriptingDir),
    /** File Cabinet path, always posix regardless of host OS. */
    cabinetDir: `/SuiteApps/${suiteApp}/${scriptingDir.split('\\').join('/')}`,
    objectsDir: join(suiteappRoot, manifest.paths.objects),
    deployXml: join(suiteappRoot, manifest.paths.deployXml),
    // The registry path may carry {suiteApp} and {prefix} placeholders, so a
    // manifest stays valid after `pnpm rename` changes either one.
    registry: manifest.paths.endpointRegistry
      ? join(
          suiteappRoot,
          manifest.paths.endpointRegistry
            .split('{suiteApp}')
            .join(suiteApp)
            .split('{prefix}')
            .join(manifest.identity.scriptPrefix)
        )
      : null,
    /** deploy.xml glob for this script type. */
    glob: `~/FileCabinet/SuiteApps/${suiteApp}/${scriptingDir.split('\\').join('/')}/*`
  }
}

/** The manifest `warekit create` writes into a new project. */
export function defaultManifest(identity: Manifest['identity']): Manifest {
  return {
    version: 1,
    kit: 'react-netsuite',
    edition: 'lite',
    identity,
    paths: {
      suiteapp: 'apps/suiteapp/template',
      scripting: {
        suitelet: 'Scripting/suitelets',
        restlet: 'Scripting/restlets',
        client: 'Scripting/client',
        'user-event': 'Scripting/user-event',
        scheduled: 'Scripting/schedule',
        'map-reduce': 'Scripting/map-reduce'
      },
      objects: 'Objects/scripts',
      deployXml: 'deploy.xml',
      endpointRegistry: `FileCabinet/SuiteApps/{suiteApp}/Scripting/suitelets/{prefix}_sl_urls.js`
    }
  }
}
