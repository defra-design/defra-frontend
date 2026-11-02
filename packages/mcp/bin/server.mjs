#!/usr/bin/env node
/**
 * defra-mcp — design system knowledge and prototype commands, over stdio.
 *
 * Runs inside a designer's prototype so an assistant editing their pages knows
 * what this design system actually contains. The problem it solves is not that
 * an assistant cannot write Nunjucks — it is that it will write plausible
 * Nunjucks referring to macros that do not exist, or shadow a GOV.UK template
 * in a way that fails without any error at all.
 *
 * THE TOOL DESCRIPTIONS ARE PART OF THE PRODUCT. An assistant reads them every
 * session and acts on them, which makes them a higher-traffic instruction
 * surface than any README here, and one no designer ever proof-reads. They are
 * covered by the instructions check for that reason.
 *
 * So: the command for running a prototype is `npm run dev`, which watches
 * files and reloads. Do not write `npm start` in a description instead — the
 * kit maps it to its hosting server, which does not watch, so a designer's
 * changes never appear. Every instruction source in this repo agrees on this
 * one command, and this file is one of them.
 *
 * The low-level Server API is used rather than McpServer because McpServer's
 * inputSchema wants zod, and taking zod as a direct dependency alongside the
 * SDK's own bundled copy invites a version skew for no benefit. Tools here
 * declare plain JSON Schema, which is what goes over the wire anyway.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { listComponents } from '../lib/tools/list-components.mjs'
import { componentHelp } from '../lib/tools/component-help.mjs'
import { listPageTypes } from '../lib/tools/list-page-types.mjs'
import { createPage } from '../lib/tools/create-page.mjs'
import { runPrototype } from '../lib/tools/run-prototype.mjs'
import { audit } from '../lib/tools/audit.mjs'
import { snapshot } from '../lib/tools/snapshot.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(
  readFileSync(join(here, '..', 'package.json'), 'utf8')
)

export const TOOLS = [
  // Knowledge first: these are the ones that should be called before writing
  // anything, and order is the only nudge available here.
  listComponents,
  componentHelp,
  listPageTypes,
  createPage,
  runPrototype,
  audit,
  snapshot
]

const server = new Server(
  { name: 'defra', version },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) =>
    ({ name, description, inputSchema }))
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = TOOLS.find((t) => t.name === request.params.name)
  if (!tool) {
    return {
      isError: true,
      content: [{ type: 'text', text: `No tool called ${request.params.name}.` }]
    }
  }
  try {
    const text = await tool.handler(request.params.arguments ?? {})
    return { content: [{ type: 'text', text }] }
  } catch (error) {
    // Returned as a tool error rather than thrown, so the assistant sees what
    // went wrong and can tell the designer, instead of the server dying and
    // the tools vanishing mid-conversation.
    return {
      isError: true,
      content: [{ type: 'text', text: `${tool.name} failed: ${error.message}` }]
    }
  }
})

await server.connect(new StdioServerTransport())
