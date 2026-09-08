/**
 * The script generator.
 *
 * Lives in utils, not in the command, because the MCP server calls it too.
 * One implementation means an agent and a human produce identical output.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { loadManifest, resolvePaths, type LoadedManifest } from './manifest.js'
import {
  SCRIPT_TYPES,
  SOURCES,
  camel,
  objectXml,
  slug,
  type ScriptType
} from '../templates/index.js'

export interface NewOptions {
  type: string
  name: string
  methods?: string[]
  record?: string
  dry?: boolean
  cwd?: string
}

export interface NewResult {
  scriptType: string
  units: number
  scriptId: string
  deployId: string
  /** Repo-relative paths that were written, or would be. */
  files: string[]
  /** deploy.xml glob added, if the folder was new. */
  addedGlob: string | null
  /** Registry key, for URL-addressed types. */
  registryKey: string | null
  recordType: string | null
  dry: boolean
}

/**
 * Scaffold a script.
 *
 * Shared by the CLI and the MCP server, so an agent and a human get identical
 * results. It returns a description of what happened rather than printing —
 * formatting belongs to the caller.
 */
export function generate(opts: NewOptions): NewResult {
  const loaded: LoadedManifest = loadManifest(opts.cwd)
  const { manifest } = loaded
  const prefix = manifest.identity.scriptPrefix

  const t: ScriptType | undefined = SCRIPT_TYPES[opts.type]
  if (!t) {
    throw new Error(
      `Unknown script type "${opts.type}". One of: ${Object.keys(SCRIPT_TYPES).join(', ')}`
    )
  }

  const name = slug(opts.name)
  if (!name) throw new Error('A name is required.')

  // A record-bound script without a record type deploys cleanly and then
  // never fires, which is a genuinely hard failure to notice.
  const recordType = opts.record ?? ''
  if (t.recordBound && !recordType) {
    throw new Error(
      `${opts.type} scripts deploy against a record type.\n` +
        `  Pass --record CUSTOMER, or --record "[scriptid=customrecord_x]".`
    )
  }

  const methods = opts.methods?.length ? opts.methods : t.methods
  const scriptId = `customscript_${prefix}_${t.tag}_${name}`
  const deployId = `customdeploy_${prefix}_${t.tag}_${name}`

  // NetSuite caps these at 40 and the validation error never mentions length.
  for (const id of [scriptId, deployId]) {
    if (id.length > 40) {
      throw new Error(
        `"${id}" is ${id.length} characters; NetSuite caps script IDs at 40.\n` +
          `  Use a shorter name than "${name}".`
      )
    }
  }

  const paths = resolvePaths(loaded, opts.type)
  const fileName = `${prefix}_${t.tag}_${name}.js`
  const scriptPath = join(paths.scriptDir, fileName)
  const objectPath = join(paths.objectsDir, `${scriptId}.xml`)

  if (existsSync(scriptPath) || existsSync(objectPath)) {
    throw new Error(`"${name}" already exists. Pick another name.`)
  }

  const writes: Array<[string, string]> = [
    [scriptPath, SOURCES[opts.type]!(name, methods, t.units, scriptId)],
    [
      objectPath,
      objectXml(
        t,
        scriptId,
        deployId,
        name,
        `${paths.cabinetDir}/${fileName}`,
        recordType
      )
    ]
  ]

  // A brand new folder needs its own <path>, or SDF fails the entire deploy
  // on a directory it has never been told about.
  let addedGlob: string | null = null
  if (existsSync(paths.deployXml)) {
    const xml = readFileSync(paths.deployXml, 'utf8')
    if (!xml.includes(paths.glob)) {
      const anchor = /(\n\s*<path>~\/FileCabinet\/[^\n]*\/\*<\/path>)/
      if (anchor.test(xml)) {
        writes.push([
          paths.deployXml,
          xml.replace(anchor, `$1\n    <path>${paths.glob}</path>`)
        ])
        addedGlob = paths.glob
      }
    }
  }

  // Register for runtime discovery — URL-addressed types only. A client or
  // user event script has no URL, so an entry here could never resolve.
  let registryKey: string | null = null
  if (t.endpoint && paths.registry && existsSync(paths.registry)) {
    const reg = readFileSync(paths.registry, 'utf8')
    if (!reg.includes(scriptId)) {
      const entry =
        `,\n    {\n      key: '${camel(name)}',\n` +
        `      scriptId: '${scriptId}',\n` +
        `      deploymentId: '${deployId}',\n` +
        `      external: false\n    }`
      const anchored = reg.replace(/(\n  \]\n)/, `${entry}$1`)
      if (anchored !== reg) {
        writes.push([paths.registry, anchored])
        registryKey = camel(name)
      }
    }
  }

  if (!opts.dry) {
    for (const [p, body] of writes) {
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, body)
    }
  }

  return {
    scriptType: opts.type,
    units: t.units,
    scriptId,
    deployId,
    files: writes.map(([p]) => relative(loaded.root, p)),
    addedGlob,
    registryKey,
    recordType: t.recordBound ? recordType : null,
    dry: Boolean(opts.dry)
  }
}
