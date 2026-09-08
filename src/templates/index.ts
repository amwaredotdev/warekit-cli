/**
 * Script templates and the NetSuite script-type registry.
 *
 * Everything the CLI knows about NetSuite lives here. Adding a type —
 * Map/Reduce, Scheduled, Portlet, Mass Update — is one registry entry plus a
 * source function; no command changes.
 */

/**
 * Script templates and the type registry.
 *
 * Everything the generator knows about NetSuite script types lives here, so
 * adding a type — Map/Reduce, Scheduled, Portlet, Mass Update — is a new
 * entry in SCRIPT_TYPES plus a source function, with no change to the CLI.
 *
 * `tooling/warekit.mjs` handles arguments, prompts and writing files. It does
 * not know what a Suitelet is.
 */

/**
 * Governance, in usage units per execution, and the shape of each type.
 *
 * Governance is the decision the type actually turns on. A RESTlet gets 5x a
 * Suitelet's budget, which matters as soon as an endpoint loops over records:
 * search.create().run() costs 10 and record.load() costs 5, so a Suitelet
 * doing 100 record loads is already over budget.
 *
 * Numbers are from NetSuite's "SuiteScript Governance" reference. Confirm
 * against your account's help centre before relying on them for capacity
 * planning — Oracle has moved those pages more than once.
 */
export interface ScriptType {
  tag: string
  units: number
  dir: string
  xmlRoot: string
  endpoint: boolean
  recordBound: boolean
  runAsRole: boolean
  /** Emit <allroles>. Task-invoked scripts have no audience. */
  allRoles: boolean
  /** RELEASED, or NOTSCHEDULED for anything that runs on a schedule. */
  defaultStatus: string
  /** Emit a <recurrence> stub. */
  recurrence: boolean
  methods: string[]
  blurb: string
}

export const SCRIPT_TYPES: Record<string, ScriptType> = {
  suitelet: {
    tag: 'sl',
    units: 1000,
    dir: 'suitelets',
    xmlRoot: 'suitelet',
    endpoint: true,
    recordBound: false,
    runAsRole: true,
    allRoles: true,
    defaultStatus: 'RELEASED',
    recurrence: false,
    methods: ['get', 'post'],
    blurb: 'session-based, can serve HTML, can be login-free'
  },
  restlet: {
    tag: 'rl',
    units: 5000,
    dir: 'restlets',
    xmlRoot: 'restlet',
    endpoint: true,
    recordBound: false,
    runAsRole: true,
    allRoles: true,
    defaultStatus: 'RELEASED',
    recurrence: false,
    methods: ['get', 'post', 'put', 'delete'],
    blurb: 'JSON only, 5x the governance budget'
  },
  client: {
    tag: 'cs',
    units: 1000,
    dir: 'client',
    xmlRoot: 'clientscript',
    endpoint: false,
    recordBound: true,
    // Client scripts run in the browser as the signed-in user. There is no
    // runasrole to set, and NetSuite ignores one if you add it.
    runAsRole: false,
    allRoles: true,
    defaultStatus: 'RELEASED',
    recurrence: false,
    methods: ['pageInit', 'fieldChanged', 'saveRecord'],
    blurb: 'runs in the browser on a NetSuite form'
  },
  'map-reduce': {
    tag: 'mr',
    units: 10_000,
    dir: 'map-reduce',
    xmlRoot: 'mapreducescript',
    endpoint: false,
    recordBound: false,
    // Task-invoked: no audience, no role to impersonate, and it must not be
    // RELEASED on deploy or it can start running in a customer's account.
    runAsRole: false,
    allRoles: false,
    defaultStatus: 'NOTSCHEDULED',
    recurrence: true,
    methods: ['getInputData', 'map', 'reduce', 'summarize'],
    blurb: 'batch processing, yields between stages'
  },
  scheduled: {
    tag: 'ss',
    units: 10_000,
    dir: 'schedule',
    xmlRoot: 'scheduledscript',
    endpoint: false,
    recordBound: false,
    runAsRole: false,
    allRoles: false,
    defaultStatus: 'NOTSCHEDULED',
    recurrence: true,
    methods: ['execute'],
    blurb: 'runs on a schedule, or on demand via task.create()'
  },
  'user-event': {
    tag: 'ue',
    units: 1000,
    dir: 'user-event',
    xmlRoot: 'usereventscript',
    endpoint: false,
    recordBound: true,
    runAsRole: true,
    allRoles: true,
    defaultStatus: 'RELEASED',
    recurrence: false,
    methods: ['beforeLoad', 'beforeSubmit', 'afterSubmit'],
    blurb: 'server-side, fires on record events'
  }
}

/**
 * Every execution context a deployment can run in.
 *
 * SDF wants this enumerated rather than defaulted. Trimming it is a common
 * cause of "my script does not fire on CSV import" — CSVIMPORT has to be in
 * this list for that to work.
 */
export const EXECUTION_CONTEXTS = [
  'ACTION',
  'ADVANCEDREVREC',
  'BANKCONNECTIVITY',
  'BANKSTATEMENTPARSER',
  'BUNDLEINSTALLATION',
  'CLIENT',
  'CONSOLRATEADJUSTOR',
  'CSVIMPORT',
  'CUSTOMGLLINES',
  'CUSTOMMASSUPDATE',
  'DATASETBUILDER',
  'DEBUGGER',
  'EMAILCAPTURE',
  'FICONNECTIVITY',
  'FIPARSER',
  'MAPREDUCE',
  'OCRPLUGIN',
  'OTHER',
  'PAYMENTGATEWAY',
  'PAYMENTPOSTBACK',
  'PLATFORMEXTENSION',
  'PORTLET',
  'PROMOTIONS',
  'RECORDACTION',
  'RESTLET',
  'RESTWEBSERVICES',
  'SCHEDULED',
  'SDFINSTALLATION',
  'SHIPPINGPARTNERS',
  'SUITELET',
  'TAXCALCULATION',
  'USEREVENT',
  'USERINTERFACE',
  'WEBSERVICES',
  'WORKBOOKBUILDER',
  'WORKFLOW'
].join('|')

// --- naming -----------------------------------------------------------------
// Shared with the CLI so a name is slugged identically wherever it is read.

export const slug = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

export const camel = (s: string): string =>
  s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
export const pascal = (s: string): string => {
  const c = camel(s)
  return c.charAt(0).toUpperCase() + c.slice(1)
}

function suiteletSource(
  name: string,
  methods: string[],
  units: number,
  _scriptId: string
): string {
  const handled = methods.map((m) => m.toUpperCase())
  return `/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 *
 * ${pascal(name)} endpoint.
 *
 * Governance: a Suitelet gets ${units.toLocaleString()} usage units per execution.
 * search.create().run() costs 10 and record.load() costs 5, so cap page sizes
 * and batch on this side rather than making the client loop.
 */
// Add the modules you need — N/search, N/record, N/query — as you use them.
// Declaring an unused module fails \`pnpm lint\`.
define(['N/runtime'], (runtime) => {
  const json = (response, status, body) => {
    response.addHeader({ name: 'Content-Type', value: 'application/json' })
    if (status !== 200) response.setHeader({ name: 'Status', value: String(status) })
    response.write({ output: JSON.stringify(body) })
  }

  const onRequest = (context) => {
    const { request, response } = context

    if (${JSON.stringify(handled)}.indexOf(request.method) === -1) {
      return json(response, 405, {
        ok: false,
        error: 'Method not allowed. Handles: ${handled.join(', ')}'
      })
    }

    try {
      // Cap the page size. An uncapped search is how you meet
      // SSS_USAGE_LIMIT_EXCEEDED in production and never in testing.
      const limit = Math.min(Number(request.parameters.limit) || 50, 200)

      // TODO: replace with your query.
      const rows = []

      return json(response, 200, { ok: true, ${camel(name)}: rows, limit })
    } catch (e) {
      log.error({ title: '${pascal(name)} failed', details: e })
      return json(response, 500, {
        ok: false,
        error: (e && e.message) || String(e),
        scriptId: runtime.getCurrentScript().id
      })
    }
  }

  return { onRequest }
})
`
}

function restletSource(
  name: string,
  methods: string[],
  units: number,
  _scriptId: string
): string {
  const entries = methods
    .map((m) => {
      const arg = m === 'get' ? 'params' : 'body'
      return `  /**
   * ${m.toUpperCase()} ${name}
   * @param {Object} ${arg}
   */
  const ${m} = (${arg}) => {
    try {
      ${
        m === 'get'
          ? `const limit = Math.min(Number(${arg}.limit) || 50, 1000)

      // TODO: replace with your query.
      const rows = []

      return { ok: true, ${camel(name)}: rows, limit }`
          : `// TODO: validate ${arg} before writing. It comes from a browser,
      // and the signed-in user is not automatically someone you trust with
      // arbitrary field writes.
      log.audit({ title: '${pascal(name)} ${m}', details: ${arg} })

      return { ok: true }`
      }
    } catch (e) {
      log.error({ title: '${pascal(name)} ${m} failed', details: e })
      // A thrown error becomes a 400 with an opaque body. Returning the shape
      // the client expects keeps error handling in one place.
      return {
        ok: false,
        error: (e && e.message) || String(e),
        scriptId: runtime.getCurrentScript().id
      }
    }
  }`
    })
    .join('\n\n')

  return `/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope Public
 *
 * ${pascal(name)} endpoint.
 *
 * Governance: a RESTlet gets ${units.toLocaleString()} usage units per execution —
 * five times a Suitelet's ${SCRIPT_TYPES.suitelet!.units.toLocaleString()}. That is the reason to choose this type.
 *
 * Return values are serialised to JSON automatically; do not stringify.
 * Called from the app it is same-origin and rides the session cookie, so no
 * OAuth is involved. External callers would need OAuth, which is why the
 * client never calls this from outside NetSuite.
 */
// Add the modules you need — N/search, N/record, N/query — as you use them.
// Declaring an unused module fails \`pnpm lint\`.
define(['N/runtime'], (runtime) => {
${entries}

  return { ${methods.join(', ')} }
})
`
}

function clientSource(
  name: string,
  methods: string[],
  units: number,
  _scriptId: string
): string {
  const bodies: Record<string, string> = {
    pageInit: `  /**
   * Runs once when the form finishes loading.
   * @param {Object} context
   * @param {Record} context.currentRecord
   */
  const pageInit = (context) => {
    log.debug({ title: '${pascal(name)} pageInit', details: context.currentRecord.type })
  }`,
    fieldChanged: `  /**
   * Runs on every field edit. Keep it cheap — this fires constantly.
   * @param {Object} context
   */
  const fieldChanged = (context) => {
    // Always branch on fieldId first. Without this you run work on every
    // keystroke in every field on the form.
    if (context.fieldId !== 'memo') return

    log.debug({ title: '${pascal(name)} fieldChanged', details: context.fieldId })
  }`,
    postSourcing: `  /**
   * Runs after a field's dependent values have finished sourcing.
   * @param {Object} context
   */
  const postSourcing = (context) => {
    if (context.fieldId !== 'entity') return
  }`,
    validateField: `  /**
   * Return false to reject the edit.
   * @param {Object} context
   * @returns {boolean}
   */
  const validateField = (context) => {
    if (context.fieldId !== 'memo') return true
    return true
  }`,
    saveRecord: `  /**
   * Return false to block the save.
   * @param {Object} context
   * @returns {boolean}
   */
  const saveRecord = (context) => {
    // Client-side validation is a convenience, not a control. Anything that
    // must hold has to be enforced again in a user event script — a user can
    // save this record through CSV import or a RESTlet and never run this.
    log.debug({ title: '${pascal(name)} saveRecord', details: context.currentRecord.id })
    return true
  }`
  }

  const impl = methods
    .map((m) => bodies[m] || `  const ${m} = (context) => {}`)
    .join('\n\n')

  return `/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 *
 * ${pascal(name)} client script.
 *
 * Governance: ${units.toLocaleString()} usage units per execution.
 *
 * Runs in the browser, on a NetSuite form, as the signed-in user. Two things
 * follow from that and neither is optional:
 *
 *   - It CANNOT be hidden. The browser fetches the source, so NetSuite serves
 *     it whatever hiding.xml says. Never put a secret or a licence check here.
 *   - It is not a control. Validation here improves the form; it does not
 *     protect the data. Enforce anything that matters in a user event script,
 *     which also runs for CSV import, RESTlet writes and workflows.
 */
define([], () => {
${impl}

  return { ${methods.join(', ')} }
})
`
}

function userEventSource(
  name: string,
  methods: string[],
  units: number,
  _scriptId: string
): string {
  const bodies: Record<string, string> = {
    beforeLoad: `  /**
   * Runs before the record is returned to the user or an API caller.
   * @param {Object} context
   */
  const beforeLoad = (context) => {
    // context.type is CREATE | EDIT | VIEW | COPY | PRINT | ...
    if (context.type !== context.UserEventType.VIEW) return

    log.debug({ title: '${pascal(name)} beforeLoad', details: context.type })
  }`,
    beforeSubmit: `  /**
   * Runs before the record is written. Mutate context.newRecord here — it is
   * cheaper than a resave and it happens inside the same transaction.
   * @param {Object} context
   */
  const beforeSubmit = (context) => {
    if (context.type === context.UserEventType.DELETE) return

    // Guard on execution context when a path should not re-run your logic.
    // CSV import is the usual one: a 10,000-row import runs this 10,000
    // times, each with its own governance budget.
    if (runtime.executionContext === runtime.ContextType.CSV_IMPORT) return

    // This is the place for validation that must hold. Unlike a client
    // script it also runs for CSV import, RESTlet writes and workflows.
    log.debug({ title: '${pascal(name)} beforeSubmit', details: context.newRecord.type })
  }`,
    afterSubmit: `  /**
   * Runs after the record is written. Use for side effects, not for editing
   * this record — that would need another save.
   * @param {Object} context
   */
  const afterSubmit = (context) => {
    if (context.type === context.UserEventType.DELETE) return

    log.audit({ title: '${pascal(name)} afterSubmit', details: context.newRecord.id })
  }`
  }

  const impl = methods
    .map((m) => bodies[m] || `  const ${m} = (context) => {}`)
    .join('\n\n')

  return `/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 *
 * ${pascal(name)} user event script.
 *
 * Governance: ${units.toLocaleString()} usage units per execution. This is the tightest
 * budget in the system relative to what people try to do in it — a loop over
 * related records will exceed it. Hand heavy work to a Map/Reduce script.
 *
 * Fires server-side on record events, including CSV import, RESTlet writes
 * and workflows, which is why validation belongs here rather than in a client
 * script.
 *
 * User events do not trigger other user events. If this script saves another
 * record, that record's own user events will NOT run.
 */
define(['N/runtime'], (runtime) => {
${impl}

  return { ${methods.join(', ')} }
})
`
}

export function objectXml(
  t: ScriptType,
  scriptId: string,
  deployId: string,
  name: string,
  path: string,
  recordType: string
): string {
  const parts: string[] = []

  // Endpoint and record-bound scripts have an audience. Task-invoked ones
  // (scheduled, map/reduce) are submitted by code and have none — NetSuite
  // rejects <allroles> on them.
  if (t.allRoles) parts.push('      <allroles>T</allroles>')

  if (t.recordBound) {
    parts.push(
      '      <alllocalizationcontexts>T</alllocalizationcontexts>',
      '      <allemployees>F</allemployees>',
      '      <allpartners>F</allpartners>',
      '      <audslctrole></audslctrole>',
      '      <eventtype></eventtype>',
      `      <executioncontext>${EXECUTION_CONTEXTS}</executioncontext>`,
      `      <recordtype>${recordType}</recordtype>`
    )
  }

  parts.push('      <isdeployed>T</isdeployed>', '      <loglevel>ERROR</loglevel>')
  if (t.runAsRole) parts.push('      <runasrole>ADMINISTRATOR</runasrole>')

  // NOTSCHEDULED for anything that runs on a schedule. Deploying a RELEASED
  // scheduled script with a recurrence starts it running in the target
  // account immediately, which is not a thing to do by default.
  parts.push(`      <status>${t.defaultStatus}</status>`)

  if (!t.recordBound)
    parts.push(`      <title>My Application - ${pascal(name)}</title>`)

  if (t.recurrence) {
    parts.push(
      '      <recurrence>',
      '        <single>',
      '          <repeat></repeat>',
      '        </single>',
      '      </recurrence>'
    )
  }

  const detail = t.recordBound ? ` (${recordType})` : t.endpoint ? ' endpoint' : ''

  return `<${t.xmlRoot} scriptid="${scriptId}">
  <description>${pascal(name)}${detail}.</description>
  <isinactive>F</isinactive>
  <name>My Application - ${pascal(name)}</name>
  <notifyadmins>F</notifyadmins>
  <notifyemails></notifyemails>
  <notifyowner>T</notifyowner>${t.recordBound ? '\n  <notifyuser>F</notifyuser>' : ''}
  <scriptfile>[${path}]</scriptfile>
  <scriptdeployments>
    <scriptdeployment scriptid="${deployId}">
${parts.join('\n')}
    </scriptdeployment>
  </scriptdeployments>
</${t.xmlRoot}>
`
}

function scheduledSource(
  name: string,
  _methods: string[],
  units: number,
  scriptId: string
): string {
  return `/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope Public
 *
 * ${pascal(name)} scheduled script.
 *
 * Governance: ${units.toLocaleString()} usage units — ten times a Suitelet. That is a lot,
 * and still finite: a search over 50,000 records will exhaust it.
 *
 * Deployed as NOTSCHEDULED so it does not start running the moment it lands
 * in an account. Set a recurrence, or submit it on demand:
 *
 *   const t = task.create({ taskType: task.TaskType.SCHEDULED_SCRIPT })
 *   t.scriptId = '${scriptId}'
 *   t.submit()
 *
 * If the work might not fit in one execution, use a Map/Reduce script
 * instead — it yields between stages and reschedules itself. Rescheduling a
 * scheduled script by hand is a sign you picked the wrong type.
 */
define(['N/runtime'], (runtime) => {
  /**
   * @param {Object} context
   * @param {string} context.type - scheduled | on demand | ...
   */
  const execute = (context) => {
    const script = runtime.getCurrentScript()
    log.audit({ title: '${pascal(name)} start', details: context.type })

    try {
      // TODO: replace with your work.

      // Check the remaining budget inside any loop. Reading it costs nothing
      // and is the only way to fail gracefully instead of mid-write.
      if (script.getRemainingUsage() < 100) {
        log.error({
          title: 'Out of governance',
          details: 'Stopped early. Move this work to a Map/Reduce script.'
        })
        return
      }

      log.audit({ title: '${pascal(name)} done', details: script.getRemainingUsage() })
    } catch (e) {
      log.error({ title: '${pascal(name)} failed', details: e })
      throw e
    }
  }

  return { execute }
})
`
}

function mapReduceSource(
  name: string,
  _methods: string[],
  units: number,
  scriptId: string
): string {
  return `/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope Public
 *
 * ${pascal(name)} map/reduce script.
 *
 * Governance: ${units.toLocaleString()} usage units for getInputData and summarize, and each
 * map() and reduce() invocation gets its own separate allowance. That is the
 * entire reason this type exists — the framework yields between stages and
 * reschedules, so total work is effectively unbounded where a Suitelet
 * (1,000) or a scheduled script (${units.toLocaleString()}) would run out.
 *
 * Reach for this whenever the row count is not something you control.
 *
 * Deployed as NOTSCHEDULED so it does not start on install. Submit it with:
 *
 *   const t = task.create({ taskType: task.TaskType.MAP_REDUCE })
 *   t.scriptId = '${scriptId}'
 *   t.submit()
 */
define(['N/search', 'N/runtime'], (search, runtime) => {
  /**
   * Stage 1. Return the work. A Search object is streamed by the framework,
   * so it does not have to fit in memory — prefer it over an array.
   */
  const getInputData = () => {
    // TODO: replace with your query.
    return search.create({
      type: 'customer',
      filters: [['isinactive', 'is', 'F']],
      columns: ['entityid']
    })
  }

  /**
   * Stage 2. Runs once per input row, with its own governance allowance.
   * @param {Object} context
   * @param {string} context.value - JSON of one search result
   */
  const map = (context) => {
    const row = JSON.parse(context.value)

    // Write a key/value pair for reduce. Grouping happens on the key, so pick
    // one that means something — an id here would make every reduce group
    // contain exactly one row and waste the stage.
    context.write({ key: String(row.id), value: row })
  }

  /**
   * Stage 3. Runs once per distinct key, with all of that key's values.
   * @param {Object} context
   */
  const reduce = (context) => {
    const values = context.values.map((v) => JSON.parse(v))
    log.debug({ title: 'reduce ' + context.key, details: values.length })

    // TODO: do the work for this key.
  }

  /**
   * Stage 4. Runs once at the end. This is the only place the earlier stages'
   * errors surface — without iterating them here, a map/reduce that failed on
   * every single row still finishes "successfully" and tells you nothing.
   */
  const summarize = (summary) => {
    log.audit({
      title: '${pascal(name)} complete',
      details: {
        seconds: summary.seconds,
        usage: summary.usage,
        yields: summary.yields
      }
    })

    if (summary.inputSummary.error) {
      log.error({ title: 'getInputData failed', details: summary.inputSummary.error })
    }

    summary.mapSummary.errors.iterator().each((key, error) => {
      log.error({ title: 'map error, key ' + key, details: error })
      return true
    })

    summary.reduceSummary.errors.iterator().each((key, error) => {
      log.error({ title: 'reduce error, key ' + key, details: error })
      return true
    })

    log.audit({ title: 'Remaining usage', details: runtime.getCurrentScript().getRemainingUsage() })
  }

  return { getInputData, map, reduce, summarize }
})
`
}

/** name -> source generator, keyed the same as SCRIPT_TYPES. */
export const SOURCES: Record<
  string,
  (name: string, methods: string[], units: number, scriptId: string) => string
> = {
  suitelet: suiteletSource,
  scheduled: scheduledSource,
  'map-reduce': mapReduceSource,
  restlet: restletSource,
  client: clientSource,
  'user-event': userEventSource
}
