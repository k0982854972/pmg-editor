/**
 * Real-corpus effect XML round-trip. Runs only when the gitignored corpus
 * directory has been populated with .xml files (background transfer).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEffectXml, serializeEffectXml } from '../../src/core/fx/effectXml'

const FX_DIR = join(__dirname, '..', '..', 'samples', 'corpus', 'gfx', 'fx', 'effect')

const xmlFiles = existsSync(FX_DIR)
  ? readdirSync(FX_DIR).filter((f) => f.toLowerCase().endsWith('.xml'))
  : []

const CORPUS_TIMEOUT_MS = 120_000

describe.skipIf(xmlFiles.length === 0)('fx effect corpus round-trip', () => {
  it(
    'parse -> serialize -> parse is semantically identical for every file',
    {
      timeout: CORPUS_TIMEOUT_MS
    },
    () => {
      const failures: string[] = []
      for (const name of xmlFiles) {
        const original = new Uint8Array(readFileSync(join(FX_DIR, name)))
        try {
          const doc = parseEffectXml(original)
          const again = parseEffectXml(serializeEffectXml(doc))
          if (JSON.stringify(again.tree) !== JSON.stringify(doc.tree)) {
            failures.push(`${name}: tree differs after round-trip`)
          }
          if (JSON.stringify(again.encoding) !== JSON.stringify(doc.encoding)) {
            failures.push(`${name}: encoding differs after round-trip`)
          }
        } catch (err) {
          failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      expect(failures, failures.slice(0, 20).join('\n')).toEqual([])
    }
  )
})
