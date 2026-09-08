# 👑 warekit

The CLI for [WareKit](https://amware.dev) — scaffold and manage NetSuite apps
built with React.

**A Masterpiece Will Always Require Effort.**

```bash
npx warekit new restlet customers --methods get,post
npx warekit new user-event sync-customer --record CUSTOMER
```

## 📟 Commands

|                             |                                                            |
| --------------------------- | ---------------------------------------------------------- |
| `warekit new [type] [name]` | Scaffold a script. Interactive when arguments are missing. |
| `warekit info`              | Show the resolved project manifest.                        |
| `warekit create [dir]`      | How to start a new project.                                |

Options: `--methods a,b`, `--record TYPE`, `--dry`.

## 🧭 Script types

Governance is the decision the type actually turns on. Every script gets a
usage-unit budget per execution, and exceeding it throws
`SSS_USAGE_LIMIT_EXCEEDED` mid-request.

| Type         |      Units | Notes                                                |
| ------------ | ---------: | ---------------------------------------------------- |
| `suitelet`   |      1,000 | Session-based, can serve HTML, can be login-free     |
| `restlet`    |  **5,000** | JSON only, 5x the budget                             |
| `client`     |      1,000 | Runs in the browser on a form. Record-bound.         |
| `user-event` |      1,000 | Server-side, on record events. Record-bound.         |
| `map-reduce` | **10,000** | Plus a fresh allowance per stage call. Task-invoked. |
| `scheduled`  | **10,000** | One budget for the whole run. Task-invoked.          |

`search.create().run()` costs 10 units and `record.load()` costs 5, so a
Suitelet doing 100 record loads is already over budget while a RESTlet has
room. Reach for a RESTlet when an endpoint touches many records.

`client` and `user-event` are triggered by NetSuite on a **record type**, not
over a URL, so they need `--record` and are deliberately not added to the
endpoint registry.

`map-reduce` and `scheduled` are invoked by the scheduler or `task.create()`,
not by a request, so their deployments carry a `<recurrence>` and ship as
`NOTSCHEDULED` — you pick the schedule in the UI after deploy. Map/Reduce gets
its 10,000 units _per stage call_, which is why a job too big for a Scheduled
script fits comfortably once you split it across `map` or `reduce`.

## 📋 What it writes

1. The SuiteScript file, in the folder your manifest declares
2. The SDF object, with a filename matching its `scriptid`
3. The `deploy.xml` `<path>` **when the folder is new**
4. Runtime registration, for URL-addressed types only

Step 3 is the one that bites. `Scripting/suitelets/*` is usually already
globbed, but your first RESTlet lives in a folder `deploy.xml` has never heard
of, and SDF fails the entire deploy on it.

It also refuses names that would breach NetSuite's 40-character script-ID cap
before writing anything, rather than at validation time where the error never
mentions length.

## ⚙️ warekit.json

The CLI writes only where a project tells it to. Every project carries a
manifest at its root:

```json
{
  "version": 1,
  "kit": "netsuite",
  "edition": "lite",
  "identity": {
    "publisherId": "com.amware",
    "projectId": "myapplication",
    "scriptPrefix": "amw"
  },
  "paths": {
    "suiteapp": "apps/suiteapp/template",
    "scripting": {
      "suitelet": "Scripting/suitelets",
      "restlet": "Scripting/restlets",
      "client": "Scripting/client",
      "user-event": "Scripting/user-event",
      "map-reduce": "Scripting/map-reduce",
      "scheduled": "Scripting/schedule"
    },
    "objects": "Objects/scripts",
    "deployXml": "deploy.xml",
    "endpointRegistry": "FileCabinet/SuiteApps/{suiteApp}/Scripting/suitelets/{prefix}_sl_urls.js"
  }
}
```

Found by walking up from the working directory, the way git finds `.git`. A
missing or malformed manifest is a hard error rather than a guess — guessing
means scaffolding into the wrong folder and failing at deploy time, which is
far more expensive to diagnose.

`{suiteApp}` and `{prefix}` are substituted, so the manifest stays valid after
you change your project identity.

`edition` is `lite` or `pro`. The CLI reads it rather than sniffing the
directory, so a Pro-only command fails with a clear message instead of half
running against a Lite checkout. `warekit info` prints it.

## 📦 Kits

| Kit                           | `kit`            | Edition | What you get                                                                   |
| ----------------------------- | ---------------- | ------- | ------------------------------------------------------------------------------ |
| `warekit-react-netsuite-lite` | `react-netsuite` | Lite    | The React-in-NetSuite architecture: SDF, both deploy modes, E2E, CI            |
| `warekit-react-netsuite`      | `react-netsuite` | Pro     | Adds licensing, role mapping, typed data layer, schema generator, admin center |

`warekit create` clones the Lite kit. Pro is in development.

The framework is in the name because a Next.js kit is planned for **hybrid**
SuiteApps — ones that run outside NetSuite and authenticate over OAuth 2
against an integration record, rather than inside a Suitelet on the session
cookie. That kit reports a different `kit` id, so the CLI can tell the two
apart without inspecting the tree.

## 🤖 MCP server

A second binary exposes the same generator over MCP, so agents and humans
produce identical output.

```json
{
  "mcpServers": {
    "warekit": { "command": "npx", "args": ["-y", "warekit-mcp"] }
  }
}
```

Tools: `warekit_script_types`, `warekit_project_info`, `warekit_new_script`.

Every tool takes an explicit `cwd` — an MCP server's working directory is
whatever the host launched it in, which is rarely your project.

## 📄 Licence

MIT. The CLI is free and open. The kits it scaffolds are a separate,
commercially licensed product.

## 🗂️ Project layout

```
src/
├── index.ts                    CLI entry, registers commands
├── mcp.ts                      MCP entry
├── version.ts
├── commands/
│   ├── new/new.command.ts
│   ├── info/info.command.ts
│   └── create/create.command.ts
├── utils/                      the actions — commands are thin wrappers
│   ├── generate-script.ts
│   ├── format-result.ts
│   ├── manifest.ts
│   ├── with-project.ts
│   └── logger.ts
└── templates/                  NetSuite script templates + type registry
```

The rule that makes this work: **commands parse, utils do.** `mcp.ts` imports
from `utils/`, never from `commands/`, so the CLI and the MCP server run the
same code and cannot drift. A command file should be argument parsing,
prompting, and one call into a util.

### Adding a command

1. `src/commands/<name>/<name>.command.ts` exporting a function that returns a
   `Command`.
2. Put the work in `src/utils/<verb>-<noun>.ts` — not in the command — so the
   MCP server can expose it too.
3. Register it in `src/index.ts` with `program.addCommand(...)`.

Subcommands nest: a `plugins add` command would be
`commands/plugins/plugins.command.ts` plus `commands/plugins/add/add.command.ts`.

### Adding a script type

One entry in `SCRIPT_TYPES` and one source function in `src/templates/`. No
command changes — Map/Reduce, Scheduled, Portlet and Mass Update all fit the
existing shape.
