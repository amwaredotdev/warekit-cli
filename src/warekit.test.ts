import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { SCRIPT_TYPES, SOURCES, objectXml, pascal, slug } from './templates/index.js'
import { defaultManifest } from './utils/manifest.js'
import { generate } from './utils/generate-script.js'

// --- fixtures ---------------------------------------------------------------

/** A minimal on-disk project, so generate() runs against a real manifest. */
function fixture(prefix = 'amw'): string {
  const root = mkdtempSync(join(tmpdir(), 'warekit-test-'))
  const manifest = defaultManifest({
    publisherId: 'com.example',
    projectId: 'testapp',
    scriptPrefix: prefix
  })
  writeFileSync(join(root, 'warekit.json'), JSON.stringify(manifest, null, 2))

  const sdf = join(root, manifest.paths.suiteapp)
  mkdirSync(join(sdf, 'Objects/scripts'), { recursive: true })
  for (const dir of Object.values(manifest.paths.scripting)) {
    mkdirSync(join(sdf, 'FileCabinet/SuiteApps/com.example.testapp', dir), {
      recursive: true
    })
  }
  // generate() anchors a new <path> after an existing FileCabinet glob, so
  // the fixture needs one to hook onto.
  writeFileSync(
    join(sdf, 'deploy.xml'),
    [
      '<deploy>',
      '  <files>',
      '    <path>~/FileCabinet/SuiteApps/com.example.testapp/Scripting/suitelets/*</path>',
      '  </files>',
      '  <objects>',
      '    <path>~/Objects/*</path>',
      '  </objects>',
      '</deploy>',
      ''
    ].join('\n')
  )

  // The endpoint registry is only rewritten when it already exists.
  writeFileSync(
    join(
      sdf,
      `FileCabinet/SuiteApps/com.example.testapp/Scripting/suitelets/${prefix}_sl_urls.js`
    ),
    'define([], () => {\n  const ENDPOINTS = [\n  ]\n  return { ENDPOINTS }\n})\n'
  )
  return root
}

const xmlFor = (type: string, record = 'CUSTOMER') =>
  objectXml(
    SCRIPT_TYPES[type]!,
    'customscript_x',
    'customdeploy_x',
    'thing',
    'a/b.js',
    record
  )

// --- naming -----------------------------------------------------------------

test('slug collapses anything that is not a script-id character', () => {
  assert.equal(slug('  Sync Customer!! '), 'sync_customer')
  assert.equal(slug('order-to-cash'), 'order_to_cash')
  assert.equal(slug('__leading and trailing__'), 'leading_and_trailing')
})

test('pascal survives digits and leading underscores', () => {
  assert.equal(pascal('sync_customer'), 'SyncCustomer')
  assert.equal(pascal('v2_sync'), 'V2Sync')
})

// --- governance -------------------------------------------------------------

test('usage-unit budgets match the NetSuite limits the generator advertises', () => {
  assert.equal(SCRIPT_TYPES.suitelet!.units, 1000)
  assert.equal(SCRIPT_TYPES.restlet!.units, 5000)
  assert.equal(SCRIPT_TYPES.client!.units, 1000)
  assert.equal(SCRIPT_TYPES['user-event']!.units, 1000)
  assert.equal(SCRIPT_TYPES['map-reduce']!.units, 10_000)
  assert.equal(SCRIPT_TYPES.scheduled!.units, 10_000)
})

// --- SDF object shape -------------------------------------------------------
// The three deployment shapes are the part SDF rejects at validation time
// with errors that do not name the offending element, so they are pinned here.

test('URL-addressed scripts get an audience and a role to run as', () => {
  for (const type of ['suitelet', 'restlet']) {
    const xml = xmlFor(type)
    assert.match(xml, /<allroles>T<\/allroles>/, type)
    assert.match(xml, /<runasrole>ADMINISTRATOR<\/runasrole>/, type)
    assert.match(xml, /<status>RELEASED<\/status>/, type)
    assert.doesNotMatch(xml, /<recordtype>/, type)
    assert.doesNotMatch(xml, /<recurrence>/, type)
  }
})

test('record-bound scripts bind to a record type and an execution context', () => {
  for (const type of ['client', 'user-event']) {
    const xml = xmlFor(type)
    assert.match(xml, /<recordtype>CUSTOMER<\/recordtype>/, type)
    // SDF multi-selects are pipe-separated, and trimming this list is why a
    // script silently never fires on CSV import.
    assert.match(xml, /<executioncontext>[A-Z|]+<\/executioncontext>/, type)
    assert.match(xml, /<executioncontext>[^<]*\bCSVIMPORT\b/, type)
    assert.match(xml, /<executioncontext>[^<]*\bUSERINTERFACE\b/, type)
  }
})

test('client scripts carry no runasrole — they run as the signed-in user', () => {
  assert.doesNotMatch(xmlFor('client'), /<runasrole>/)
  // user-event is server-side, so it does take one.
  assert.match(xmlFor('user-event'), /<runasrole>ADMINISTRATOR<\/runasrole>/)
})

test('task-invoked scripts have no audience and never deploy RELEASED', () => {
  for (const type of ['map-reduce', 'scheduled']) {
    const xml = xmlFor(type)
    assert.doesNotMatch(xml, /<allroles>/, type)
    assert.doesNotMatch(xml, /<runasrole>/, type)
    assert.match(xml, /<status>NOTSCHEDULED<\/status>/, type)
    assert.match(xml, /<recurrence>/, type)
  }
})

test('every type emits its own well-formed SDF root element', () => {
  for (const [type, t] of Object.entries(SCRIPT_TYPES)) {
    const xml = xmlFor(type)
    assert.ok(xml.startsWith(`<${t.xmlRoot} scriptid=`), type)
    assert.ok(xml.trimEnd().endsWith(`</${t.xmlRoot}>`), type)
  }
})

// --- generated source -------------------------------------------------------

test('each template declares the SuiteScript type NetSuite expects', () => {
  const expected: Record<string, string> = {
    suitelet: 'Suitelet',
    restlet: 'Restlet',
    client: 'ClientScript',
    'user-event': 'UserEventScript',
    'map-reduce': 'MapReduceScript',
    scheduled: 'ScheduledScript'
  }
  for (const [type, t] of Object.entries(SCRIPT_TYPES)) {
    const src = SOURCES[type]!('thing', t.methods, t.units, 'customscript_x')
    assert.match(src, /@NApiVersion 2\.1/, type)
    assert.match(src, new RegExp(`@NScriptType ${expected[type]}\\b`), type)
    // A literal placeholder here means a template lost a binding.
    assert.doesNotMatch(src, /\$\{/, type)
  }
})

// --- generate() -------------------------------------------------------------

test('generate writes a script and an object named after its scriptid', () => {
  const root = fixture()
  const r = generate({ type: 'restlet', name: 'Customers', cwd: root })

  assert.equal(r.scriptId, 'customscript_amw_rl_customers')
  assert.equal(r.deployId, 'customdeploy_amw_rl_customers')
  assert.equal(r.units, 5000)
  for (const f of r.files) assert.ok(existsSync(join(root, f)), f)
  assert.ok(
    r.files.some((f) => f.endsWith('amw_rl_customers.js')),
    'writes the SuiteScript'
  )
  assert.ok(
    r.files.some((f) => f.endsWith('customscript_amw_rl_customers.xml')),
    'names the object file after its scriptid, which is what SDF matches on'
  )
})

test('generate refuses a second script with the same name', () => {
  const root = fixture()
  generate({ type: 'suitelet', name: 'orders', cwd: root })
  assert.throws(
    () => generate({ type: 'suitelet', name: 'orders', cwd: root }),
    /already exists/
  )
})

test('generate rejects names that breach the 40-character script-id cap', () => {
  const root = fixture()
  assert.throws(
    () =>
      generate({
        type: 'user-event',
        name: 'a'.repeat(40),
        record: 'CUSTOMER',
        cwd: root
      }),
    /caps script IDs at 40/
  )
  // Nothing is written when validation fails.
  assert.equal(
    generate({ type: 'suitelet', name: 'ok', cwd: root, dry: true }).dry,
    true
  )
})

test('generate refuses a record-bound script with no record type', () => {
  const root = fixture()
  for (const type of ['client', 'user-event']) {
    assert.throws(
      () => generate({ type, name: 'sync', cwd: root }),
      /record type/,
      type
    )
  }
})

test('a dry run reports files without writing them', () => {
  const root = fixture()
  const r = generate({ type: 'scheduled', name: 'nightly', cwd: root, dry: true })
  assert.equal(r.dry, true)
  // deploy.xml is edited in place and already exists, so only the newly
  // created files are checked for absence.
  const created = r.files.filter((f) => f.includes('nightly'))
  assert.equal(created.length, 2)
  for (const f of created) assert.equal(existsSync(join(root, f)), false, f)
})

test('only URL-addressed types are added to the endpoint registry', () => {
  const root = fixture()
  assert.ok(generate({ type: 'suitelet', name: 'a', cwd: root, dry: true }).registryKey)
  assert.ok(generate({ type: 'restlet', name: 'b', cwd: root, dry: true }).registryKey)
  for (const [type, record] of [
    ['client', 'CUSTOMER'],
    ['user-event', 'CUSTOMER'],
    ['map-reduce', ''],
    ['scheduled', '']
  ] as const) {
    const r = generate({ type, name: 'c', record, cwd: root, dry: true })
    assert.equal(r.registryKey, null, type)
  }
})

test('a new folder is globbed into deploy.xml, an existing one is not', () => {
  const root = fixture()
  const first = generate({ type: 'map-reduce', name: 'rebuild', cwd: root })
  assert.ok(first.addedGlob, 'first script in a folder adds the glob')

  const deployXml = readFileSync(
    join(root, 'apps/suiteapp/template/deploy.xml'),
    'utf8'
  )
  assert.ok(deployXml.includes(first.addedGlob!))

  const second = generate({ type: 'map-reduce', name: 'resync', cwd: root })
  assert.equal(second.addedGlob, null, 'second script in the same folder does not')
})

test('generate rejects an unknown script type by listing the real ones', () => {
  const root = fixture()
  assert.throws(
    () => generate({ type: 'portlet', name: 'x', cwd: root }),
    /Unknown script type/
  )
})

// --- manifest ---------------------------------------------------------------

test('the default manifest is Lite and knows a path for every script type', () => {
  const m = defaultManifest({
    publisherId: 'com.example',
    projectId: 'app',
    scriptPrefix: 'amw'
  })
  assert.equal(m.edition, 'lite')
  assert.deepEqual(
    Object.keys(m.paths.scripting).sort(),
    Object.keys(SCRIPT_TYPES).sort(),
    'a script type with no configured path fails only at generate time'
  )
})
