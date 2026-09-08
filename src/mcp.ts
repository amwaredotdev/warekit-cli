import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { VERSION } from './version.js'
import { generate } from './utils/generate-script.js'
import { loadManifest } from './utils/manifest.js'
import { SCRIPT_TYPES } from './templates/index.js'

/**
 * MCP server for the WareKit CLI.
 *
 * Exposes the same generator the CLI uses, so an agent and a human produce
 * identical output. Registered as the `warekit-mcp` binary.
 *
 * Every tool takes an explicit `cwd`: an MCP server's working directory is
 * whatever the host happened to launch it in, which is rarely the project.
 */
const server = new McpServer({ name: 'warekit', version: VERSION })

server.registerTool(
  'warekit_script_types',
  {
    title: 'List NetSuite script types',
    description:
      'The script types WareKit can scaffold, with their governance budget in ' +
      'usage units. Governance is the decision the type turns on: a RESTlet ' +
      'gets 5,000 units against a Suitelet 1,000, and search.create().run() ' +
      'costs 10 while record.load() costs 5.',
    inputSchema: {}
  },
  async () => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          Object.entries(SCRIPT_TYPES).map(([name, t]) => ({
            name,
            usageUnits: t.units,
            urlAddressed: t.endpoint,
            recordBound: t.recordBound,
            entryPoints: t.methods,
            notes: t.blurb
          })),
          null,
          2
        )
      }
    ]
  })
)

server.registerTool(
  'warekit_project_info',
  {
    title: 'Read the WareKit project manifest',
    description:
      'Resolve warekit.json for a project directory: SuiteApp identity, script ' +
      'prefix, and where each script type lives. Call this before scaffolding.',
    inputSchema: { cwd: z.string().describe('Absolute path inside the project') }
  },
  async ({ cwd }) => {
    try {
      const { root, manifest } = loadManifest(cwd)
      return {
        content: [
          { type: 'text', text: JSON.stringify({ root, ...manifest }, null, 2) }
        ]
      }
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: (e as Error).message }] }
    }
  }
)

server.registerTool(
  'warekit_new_script',
  {
    title: 'Scaffold a NetSuite script',
    description:
      'Create a Suitelet, RESTlet, client script or user event script: the ' +
      'SuiteScript file, its SDF object, the deploy.xml path when the folder ' +
      'is new, and runtime registration for URL-addressed types. Enforces ' +
      "NetSuite's 40-character script-ID cap. Use dry=true to preview.",
    inputSchema: {
      cwd: z.string().describe('Absolute path inside the project'),
      type: z
        .enum(['suitelet', 'restlet', 'client', 'user-event'])
        .describe(
          'suitelet 1,000 units; restlet 5,000; client and user-event are record-bound'
        ),
      name: z.string().describe('Script name, e.g. customers'),
      methods: z.array(z.string()).optional().describe('Entry points to scaffold'),
      record: z
        .string()
        .optional()
        .describe(
          'Record type, required for client and user-event. CUSTOMER or [scriptid=customrecord_x]'
        ),
      dry: z.boolean().optional().describe('Preview without writing')
    }
  },
  async ({ cwd, type, name, methods, record, dry }) => {
    try {
      const result = generate({ cwd, type, name, methods, record, dry })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (e) {
      // Return the error as content rather than throwing: the message carries
      // the fix (which record type to pass, why the ID is too long) and the
      // agent should read it, not just see a failure.
      return { isError: true, content: [{ type: 'text', text: (e as Error).message }] }
    }
  }
)

await server.connect(new StdioServerTransport())
