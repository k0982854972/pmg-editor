/**
 * Real-corpus round-trip validation. Runs only when samples/corpus exists
 * (populated from the user's unpacked Mabinogi data; gitignored).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPmg } from '../src/core/pmg/reader'
import { writePmg } from '../src/core/pmg/writer'

const CORPUS_DIR = join(__dirname, '..', 'samples', 'corpus')

function collectFiles(dir: string, ext: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collectFiles(full, ext))
    else if (entry.toLowerCase().endsWith(ext)) out.push(full)
  }
  return out
}

const hasCorpus = existsSync(CORPUS_DIR)

describe.skipIf(!hasCorpus)('real corpus round-trip', () => {
  it('re-serializes every sampled .pmg byte-identically', () => {
    const files = collectFiles(CORPUS_DIR, '.pmg')
    expect(files.length).toBeGreaterThan(0)

    const failures: string[] = []
    for (const file of files) {
      const original = new Uint8Array(readFileSync(file))
      try {
        const rewritten = writePmg(readPmg(original))
        if (
          rewritten.byteLength !== original.byteLength ||
          !rewritten.every((b, i) => b === original[i])
        ) {
          failures.push(`${file}: round-trip differs`)
        }
      } catch (err) {
        failures.push(`${file}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    expect(failures, failures.slice(0, 20).join('\n')).toEqual([])
  })
})
