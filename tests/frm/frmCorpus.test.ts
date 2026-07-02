/**
 * Real-corpus validation for the FRM reader. Runs only when samples/corpus
 * exists (populated from the user's unpacked Mabinogi data; gitignored).
 * Asserts the invariants observed across all corpus skeletons.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readFrm } from '../../src/core/frm/reader'
import { FRM_BONE_SIZE, FRM_ROOT_PARENT_ID } from '../../src/core/frm/types'

const CORPUS_DIR = join(__dirname, '..', '..', 'samples', 'corpus')

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

describe.skipIf(!hasCorpus)('real corpus frm parsing', () => {
  it('parses every sampled .frm with plausible bone tables', () => {
    const files = collectFiles(CORPUS_DIR, '.frm')
    expect(files.length).toBeGreaterThan(0)

    const failures: string[] = []
    for (const file of files) {
      const data = new Uint8Array(readFileSync(file))
      try {
        const frm = readFrm(data)
        const boneCount = frm.bones.length
        if (boneCount < 1 || boneCount > 200) {
          failures.push(`${file}: implausible bone count ${boneCount}`)
          continue
        }
        frm.bones.forEach((bone, index) => {
          if (bone.id !== index) failures.push(`${file}: bone ${index} has id ${bone.id}`)
          if (bone.parentId !== FRM_ROOT_PARENT_ID && bone.parentId >= boneCount) {
            failures.push(`${file}: bone ${index} has out-of-range parent ${bone.parentId}`)
          }
          if (bone.name.text.length === 0) failures.push(`${file}: bone ${index} has empty name`)
        })
        if (!frm.bones.some((bone) => bone.parentId === FRM_ROOT_PARENT_ID)) {
          failures.push(`${file}: no root bone (parentId 0xFF)`)
        }
        // Full coverage: header + bones + trailer account for every byte,
        // and the trailer's int32 size prefix matches its payload length.
        const bonesEnd = 8 + boneCount * FRM_BONE_SIZE
        if (frm.trailer.byteLength !== data.byteLength - bonesEnd) {
          failures.push(`${file}: trailer length mismatch`)
        }
        const sizePrefix = new DataView(
          frm.trailer.buffer,
          frm.trailer.byteOffset,
          frm.trailer.byteLength
        ).getInt32(0, true)
        if (sizePrefix !== frm.trailer.byteLength - 4) {
          failures.push(
            `${file}: trailer size prefix ${sizePrefix} != ${frm.trailer.byteLength - 4}`
          )
        }
      } catch (err) {
        failures.push(`${file}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    expect(failures, failures.slice(0, 20).join('\n')).toEqual([])
  })
})
