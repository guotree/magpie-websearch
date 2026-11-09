// Enumerate files ourselves: Windows cmd does not expand globs, and Node's
// directory discovery also runs helper modules under test/ on some versions.
import { readdirSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const files = readdirSync(new URL("../test/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
  .map((entry) => "./test/" + entry.name)
  .sort()
if (files.length === 0) throw new Error("No *.test.mjs files found in test/")

const result = spawnSync(process.execPath, [
  process.versions.bun ? "test" : "--test",
  ...process.argv.slice(2),
  ...files,
], { cwd: root, stdio: "inherit" })
if (result.error) throw result.error
if (result.signal) console.error(`Test runner terminated by ${result.signal}`)
process.exitCode = result.status ?? 1
