import { describe, expect, it } from 'vitest'
import { FrmParseError, readFrm } from '../../src/core/frm/reader'
import { isFrmRootBone } from '../../src/core/frm/types'
import { readMatrix } from '../../src/core/pmg/access'
import { buildFrmFixture, translationMatrix, inverseTranslationMatrix } from './frmFixture'

describe('readFrm', () => {
  it('parses a synthetic two-bone skeleton', () => {
    const trailerPayload = Uint8Array.of(9, 8, 7, 6)
    const data = buildFrmFixture({
      bones: [
        {
          name: '-com',
          id: 0,
          parentId: 0xff,
          localToGlobal: translationMatrix(0, 100, 0),
          globalToLocal: inverseTranslationMatrix(0, 100, 0)
        },
        {
          name: '_body',
          id: 1,
          parentId: 0,
          unk1: 7,
          localToGlobal: translationMatrix(0, 110, 5),
          globalToLocal: inverseTranslationMatrix(0, 110, 5),
          quat1: [0.5, 0.5, 0.5, 0.5]
        }
      ],
      trailerPayload
    })

    const frm = readFrm(data)

    expect(frm.version).toEqual([1, 0])
    expect(frm.bones).toHaveLength(2)
    const [root, body] = frm.bones
    expect(root.name.text).toBe('-com')
    expect(root.id).toBe(0)
    expect(root.parentId).toBe(0xff)
    expect(isFrmRootBone(root)).toBe(true)
    expect(body.name.text).toBe('_body')
    expect(body.parentId).toBe(0)
    expect(body.unk1).toBe(7)
    expect(isFrmRootBone(body)).toBe(false)
    expect(readMatrix(body.localToGlobal)).toEqual(translationMatrix(0, 110, 5))
    expect(readMatrix(body.globalToLocal)).toEqual(inverseTranslationMatrix(0, 110, 5))
    expect(readMatrix(body.link)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    expect(body.quat1).toEqual({ x: 0.5, y: 0.5, z: 0.5, w: 0.5 })
    expect(body.quat2).toEqual({ x: 0, y: 0, z: 0, w: 1 })
    // Trailer preserved verbatim: int32 size prefix + payload.
    expect(frm.trailer.byteLength).toBe(4 + trailerPayload.byteLength)
    expect(Array.from(frm.trailer.subarray(4))).toEqual([9, 8, 7, 6])
  })

  it('rejects a bad signature with offset 0', () => {
    const data = buildFrmFixture({ magic: 'nop!', bones: [{ name: '_a', id: 0, parentId: 0xff }] })
    expect(() => readFrm(data)).toThrowError(FrmParseError)
    try {
      readFrm(data)
    } catch (error) {
      expect((error as FrmParseError).offset).toBe(0)
    }
  })

  it('rejects a bone count that exceeds the file size', () => {
    const data = buildFrmFixture({
      bones: [{ name: '_a', id: 0, parentId: 0xff }],
      boneCountOverride: 40
    })
    expect(() => readFrm(data)).toThrowError(FrmParseError)
  })

  it('rejects a negative bone count', () => {
    const data = buildFrmFixture({ bones: [], boneCountOverride: -1 })
    expect(() => readFrm(data)).toThrowError(FrmParseError)
  })

  it('rejects a truncated file', () => {
    const full = buildFrmFixture({ bones: [{ name: '_a', id: 0, parentId: 0xff }] })
    expect(() => readFrm(full.subarray(0, 100))).toThrowError(FrmParseError)
  })
})
