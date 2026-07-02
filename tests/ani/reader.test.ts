/**
 * Tests for src/core/ani/reader.ts: synthetic fixtures (tests/ani/aniFixture.ts)
 * cover header/bone/frame parsing, the optional second bone array, the
 * transformsSize-over-frameCount skipping rule and error paths; a guarded
 * corpus test parses every samples/corpus/**\/*.ani (mirrors ddsCorpus.test.ts).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AniParseError,
  aniDurationMs,
  aniTotalKeyframes,
  readAni,
  readAniFrame,
  storedFrameCount
} from '../../src/core/ani/reader'
import { buildAniFixture, makeFrame } from './aniFixture'

const twoBoneFixture = buildAniFixture({
  shorts: [0, 80, 30, 160],
  bones: [
    {
      time: 1200,
      unk34: 7,
      frames: [
        makeFrame({ time: 0, px: 1.5, py: -2, pz: 0.25, unk: 3, qx: 0.5, qy: 0, qz: 0, qw: 0.75 }),
        makeFrame({ time: 600, px: 4, py: 5, pz: 6, qw: 1 })
      ]
    },
    { time: 1200, frames: [makeFrame({ time: 0 })] }
  ]
})

describe('readAni header + bones', () => {
  it('parses header fields from a synthetic file', () => {
    const file = readAni(twoBoneFixture)
    expect(file.header.version).toEqual([1, 3])
    expect(file.header.unk2).toBe(80)
    expect(file.header.unk3).toBe(30)
    expect(file.header.unk4).toBe(160)
    expect(file.header.unk5).toBe(4800)
    expect(file.header.boneCount).toBe(2)
    expect(file.header.secondBoneCount).toBe(0)
    expect(file.header.unk14).toBe(1)
    expect(file.bones).toHaveLength(2)
    expect(file.secondaryBones).toHaveLength(0)
  })

  it('parses bone track fields and raw frame block size', () => {
    const [bone0, bone1] = readAni(twoBoneFixture).bones
    expect(bone0.frameCount).toBe(2)
    expect(bone0.unk34).toBe(7)
    expect(bone0.timeMs).toBe(1200)
    expect(bone0.transformsSize).toBe(72)
    expect(bone0.frames.byteLength).toBe(72)
    expect(bone0.sizeMismatch).toBe(false)
    expect(bone1.frameCount).toBe(1)
    expect(storedFrameCount(bone1)).toBe(1)
  })

  it('reads keyframe values through readAniFrame', () => {
    const bone = readAni(twoBoneFixture).bones[0]
    const frame0 = readAniFrame(bone, 0)
    expect(frame0.time).toBe(0)
    expect(frame0.position).toEqual({ x: 1.5, y: -2, z: 0.25 })
    expect(frame0.unk).toBe(3)
    expect(frame0.rotation).toEqual({ x: 0.5, y: 0, z: 0, w: 0.75 })
    const frame1 = readAniFrame(bone, 1)
    expect(frame1.time).toBe(600)
    expect(frame1.position).toEqual({ x: 4, y: 5, z: 6 })
  })

  it('throws a RangeError for an out-of-range frame index', () => {
    const bone = readAni(twoBoneFixture).bones[0]
    expect(() => readAniFrame(bone, 2)).toThrow(RangeError)
    expect(() => readAniFrame(bone, -1)).toThrow(RangeError)
  })
})

describe('readAni second bone array', () => {
  it('parses the second AniBone array when header unk10 is non-zero', () => {
    const data = buildAniFixture({
      bones: [{ time: 100, frames: [makeFrame()] }],
      secondBones: [{ time: 100, frames: [makeFrame({ time: 50, px: 9 })] }]
    })
    const file = readAni(data)
    expect(file.header.secondBoneCount).toBe(1)
    expect(file.secondaryBones).toHaveLength(1)
    expect(readAniFrame(file.secondaryBones[0], 0).position.x).toBe(9)
  })
})

describe('readAni robustness', () => {
  it('skips frame blocks by transformsSize when frameCount disagrees', () => {
    const data = buildAniFixture({
      bones: [
        // frameCount field lies (5) but transformsSize says 2 frames follow.
        { time: 100, frames: [makeFrame(), makeFrame({ time: 50 })], frameCountOverride: 5 },
        { time: 100, frames: [makeFrame({ px: 42 })] }
      ]
    })
    const file = readAni(data)
    expect(file.bones[0].sizeMismatch).toBe(true)
    expect(storedFrameCount(file.bones[0])).toBe(2)
    // The next bone still parses correctly because skipping used transformsSize.
    expect(file.bones[1].sizeMismatch).toBe(false)
    expect(readAniFrame(file.bones[1], 0).position.x).toBe(42)
  })

  it('throws AniParseError with an offset on a bad magic', () => {
    const data = buildAniFixture({ magic: 'pmg\0', bones: [] })
    expect(() => readAni(data)).toThrow(AniParseError)
    expect(() => readAni(data)).toThrow(/signature.*offset 0/)
  })

  it('throws AniParseError on a truncated file', () => {
    const truncated = twoBoneFixture.slice(0, 70)
    expect(() => readAni(truncated)).toThrow(AniParseError)
  })

  it('throws AniParseError when transformsSize overruns the file', () => {
    const data = buildAniFixture({ bones: [{ time: 100, frames: [makeFrame()] }] })
    // Corrupt bone0 transformsSize (header is 58 bytes, bone starts at 58,
    // transformsSize sits 12 bytes into the bone record).
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    view.setInt32(58 + 12, 0x7fffffff, true)
    expect(() => readAni(data)).toThrow(AniParseError)
  })
})

describe('ani summary helpers', () => {
  it('computes total duration and keyframe totals', () => {
    const file = readAni(twoBoneFixture)
    expect(aniDurationMs(file)).toBe(1200)
    expect(aniTotalKeyframes(file)).toBe(3)
  })
})

const CORPUS_DIR = join(__dirname, '..', '..', 'samples', 'corpus')

function collectAniFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...collectAniFiles(full))
    else if (entry.name.toLowerCase().endsWith('.ani')) found.push(full)
  }
  return found
}

const aniFiles = collectAniFiles(CORPUS_DIR)

describe.skipIf(aniFiles.length === 0)('ani corpus parse', () => {
  it('parses every corpus .ani without throwing', { timeout: 120_000 }, () => {
    const failures: string[] = []
    for (const path of aniFiles) {
      try {
        const file = readAni(new Uint8Array(readFileSync(path)))
        if (file.bones.length !== file.header.boneCount) {
          failures.push(`${path}: bone count mismatch`)
        }
        for (const bone of [...file.bones, ...file.secondaryBones]) {
          if (storedFrameCount(bone) > 0) readAniFrame(bone, 0)
        }
      } catch (err) {
        failures.push(`${path}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    expect(failures, failures.slice(0, 20).join('\n')).toEqual([])
  })
})
