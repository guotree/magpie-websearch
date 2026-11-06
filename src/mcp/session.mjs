// Initialized MCP sessions over Streamable HTTP, with one total deadline and
// best-effort cleanup. Authentication is supplied independently through headers.
import { createRequire } from "node:module"
import { boundDetail, cleanRetryAfter, requestResponse } from "../core.mjs"
import { readMCPResult } from "./response.mjs"

// Read once from the installed package; createRequire also supports Node 20.3
// without depending on version-specific JSON import attributes.
const { version: packageVersion } = createRequire(import.meta.url)("../../package.json")

export const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
])

const LATEST_PROTOCOL_VERSION = "2025-11-25"
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
const validSessionID = (value) => typeof value === "string" && value.length > 0
  && [...value].every((character) => character.charCodeAt(0) >= 0x21 && character.charCodeAt(0) <= 0x7e)

function timeoutError(label, timeout) {
  return new Error(`${label} search timed out after ${timeout}ms`)
}

export async function callSessionMCPTool({
  endpoint,
  headers = {},
  toolNames,
  argumentsForSchema,
  ctx,
  timeout = 25_000,
  label = "search",
}) {
  const started = Date.now()
  const deadline = timeout > 0 ? started + timeout : undefined
  let sessionID
  let protocolVersion
  let requestID = 0

  const redact = (error) => {
    const authorization = Object.entries(headers)
      .find(([name]) => name.toLowerCase() === "authorization")?.[1]
    const secrets = [sessionID, authorization, typeof authorization === "string"
      ? authorization.replace(/^Bearer\s+/i, "") : undefined].filter(Boolean)
    let message = String(error?.message ?? error)
    for (const secret of secrets) message = message.replaceAll(String(secret), "[redacted]")
    if (error instanceof Error) {
      error.message = boundDetail(message)
      return error
    }
    return new Error(boundDetail(message))
  }

  const remaining = () => {
    if (deadline === undefined) return 0
    const value = deadline - Date.now()
    if (value <= 0) throw timeoutError(label, timeout)
    return value
  }
  const commonHeaders = () => ({
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    ...headers,
    ...(sessionID ? { "Mcp-Session-Id": sessionID } : {}),
    ...(protocolVersion ? { "MCP-Protocol-Version": protocolVersion } : {}),
  })
  const request = async (method, params) => {
    const id = ++requestID
    try {
      return await requestResponse(endpoint, {
        method: "POST",
        headers: commonHeaders(),
        body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) }),
        redirect: "error",
      }, ctx, {
        label,
        timeout: remaining(),
        withholdErrorBody: true,
        retryAfterFromResponse: (response) => cleanRetryAfter(response.headers.get("Retry-After")),
      }, (response, signal) => readMCPResult(response, signal, id, label))
    } catch (error) {
      if (timeout > 0 && /search timed out after \d+ms$/.test(error?.message ?? "")) {
        throw timeoutError(label, timeout)
      }
      throw error
    }
  }
  const notifyInitialized = async () => {
    try {
      await requestResponse(endpoint, {
        method: "POST",
        headers: commonHeaders(),
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
        redirect: "error",
      }, ctx, {
        label,
        timeout: remaining(),
        withholdErrorBody: true,
        retryAfterFromResponse: (response) => cleanRetryAfter(response.headers.get("Retry-After")),
      })
    } catch (error) {
      if (timeout > 0 && /search timed out after \d+ms$/.test(error?.message ?? "")) {
        throw timeoutError(label, timeout)
      }
      throw error
    }
  }

  try {
    const initializeID = ++requestID
    let initializeResponse
    const initialized = await requestResponse(endpoint, {
      method: "POST",
      headers: commonHeaders(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: initializeID,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "magpie-websearch", version: packageVersion },
        },
      }),
      redirect: "error",
    }, ctx, {
      label,
      timeout: remaining(),
      withholdErrorBody: true,
      retryAfterFromResponse: (response) => cleanRetryAfter(response.headers.get("Retry-After")),
    }, (response, signal) => {
      initializeResponse = response
      return readMCPResult(response, signal, initializeID, label)
    }).catch((error) => {
      if (timeout > 0 && /search timed out after \d+ms$/.test(error?.message ?? "")) throw timeoutError(label, timeout)
      throw error
    })

    const receivedSessionID = initializeResponse?.headers.get("Mcp-Session-Id")?.trim()
    if (!receivedSessionID) throw new Error(`Invalid ${label} MCP response: missing session ID`)
    if (!validSessionID(receivedSessionID)) throw new Error(`Invalid ${label} MCP response: invalid session ID`)
    sessionID = receivedSessionID
    protocolVersion = initialized?.protocolVersion
    if (!SUPPORTED_PROTOCOL_VERSIONS.has(protocolVersion)) {
      throw new Error(`Invalid ${label} MCP response: unsupported protocol version`)
    }

    await notifyInitialized()
    const listed = await request("tools/list", {})
    if (!Array.isArray(listed?.tools)) throw new Error(`Invalid ${label} MCP response: tools must be an array`)
    const tool = toolNames.map((name) => listed.tools.find((entry) => entry?.name === name)).find(Boolean)
    if (!tool) {
      const available = listed.tools.map((entry) => typeof entry?.name === "string" ? entry.name : "")
        .filter(Boolean).slice(0, 8).join(", ")
      throw new Error(`${label} MCP server did not publish a supported Web Search tool${available ? ` (available: ${available})` : ""}`)
    }
    const schema = object(tool.inputSchema) ? tool.inputSchema : {}
    const args = await argumentsForSchema(schema, tool.name)
    const result = await request("tools/call", { name: tool.name, arguments: args })
    if (result.isError === true) throw new Error(`${label} MCP search tool failed`)
    return { result, toolName: tool.name, schema, arguments: args }
  } catch (error) {
    throw redact(error)
  } finally {
    if (sessionID) {
      // Session cleanup has its own short budget and must not hide the search
      // result or failure. Do not reuse an already-aborted host signal here.
      try {
        await requestResponse(endpoint, {
          method: "DELETE",
          headers: commonHeaders(),
          redirect: "error",
        }, undefined, { label, timeout: 1_000, withholdErrorBody: true })
      } catch {}
    }
  }
}
