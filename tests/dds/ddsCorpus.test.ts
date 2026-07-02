/**
 * Real-corpus DDS parse + decode smoke test. Runs only when the gitignored
 * corpus directory contains .dds files (mirrors tests/fx/fxCorpus.test.ts).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeDds } from '../../src/core/dds/ddsDecode'
import { parseDdsHeader } from '../../src/core/dds/ddsFormat'

const CORPUS_DIR = join(__dirname, '..', '..', 'samples', 'corpus')

function collectDdsFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...collectDdsFiles(full))
    else if (entry.name.toLowerCase().endsWith('.dds')) found.push(full)
  }
  return found
}

const ddsFiles = collectDdsFiles(CORPUS_DIR)

const CORPUS_TIMEOUT_MS = 120_000

describe.skipIf(ddsFiles.length === 0)('dds corpus parse + decode', () => {
  it(
    'parses and decodes every corpus .dds without throwing',
    { timeout: CORPUS_TIMEOUT_MS },
    () => {
      const failures: string[] = []
      for (const path of ddsFiles) {
        const bytes = new Uint8Array(readFileSync(path))
        try {
          const info = parseDdsHeader(bytes)
          if (info.format.kind !== 'unsupported') {
            const { width, height, rgba } = decodeDds(bytes)
            if (rgba.length !== width * height * 4) {
              failures.push(`${path}: decoded buffer size mismatch`)
            }
          }
        } catch (err) {
          failures.push(`${path}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      expect(failures, failures.slice(0, 20).join('\n')).toEqual([])
    }
  )
})
