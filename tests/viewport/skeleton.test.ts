import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { readFrm } from '../../src/core/frm/reader'
import { readMatrix } from '../../src/core/pmg/access'
import { readPmg } from '../../src/core/pmg/reader'
import {
  applyPlaybackPose,
  buildSkeletonRig,
  buildSkinnedScene,
  resetRigPose
} from '../../src/renderer/src/viewport/skeleton'
import type { AniPlayback } from '../../src/renderer/src/viewport/aniPlayback'
import {
  FIXTURE_SKINS,
  FIXTURE_VERTICES,
  buildPmgFixture,
  fixtureMatrix1
} from '../fixtures/pmgFixture'
import { buildFrmFixture, inverseTranslationMatrix, translationMatrix } from './../frm/frmFixture'

function makeTestFrm(): ReturnType<typeof readFrm> {
  return readFrm(
    buildFrmFixture({
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
          localToGlobal: translationMatrix(0, 110, 5),
          globalToLocal: inverseTranslationMatrix(0, 110, 5)
        },
        {
          name: '_head',
          id: 2,
          parentId: 1,
          localToGlobal: translationMatrix(0, 120, 5),
          globalToLocal: inverseTranslationMatrix(0, 120, 5)
        }
      ]
    })
  )
}

describe('buildSkeletonRig', () => {
  it('builds the bone hierarchy with bind-pose locals matching localToGlobal', () => {
    const rig = buildSkeletonRig(makeTestFrm())
    expect(rig.bones).toHaveLength(3)
    expect(rig.roots).toHaveLength(1)
    expect(rig.bones[1].parent).toBe(rig.bones[0])
    expect(rig.bones[2].parent).toBe(rig.bones[1])
    // Local bind translation of _body relative to -com.
    expect(rig.bones[1].position.toArray().map((v) => Math.round(v * 1e4) / 1e4)).toEqual([
      0, 10, 5
    ])
    // World bind position must reproduce localToGlobal's translation.
    const holder = new THREE.Group()
    rig.roots.forEach((root) => holder.add(root))
    holder.updateWorldMatrix(true, true)
    const world = new THREE.Vector3()
    rig.bones[2].getWorldPosition(world)
    expect(world.x).toBeCloseTo(0)
    expect(world.y).toBeCloseTo(120)
    expect(world.z).toBeCloseTo(5)
    // Inverse bind matrices come from the file's globalToLocal.
    const expected = new THREE.Matrix4()
      .fromArray(readMatrix(makeTestFrm().bones[2].globalToLocal))
      .transpose()
    expect(rig.skeleton.boneInverses[2].elements).toEqual(expected.elements)
  })

  it('treats an out-of-range parentId as a root', () => {
    const rig = buildSkeletonRig(
      readFrm(
        buildFrmFixture({
          bones: [
            { name: '_a', id: 0, parentId: 0xff },
            { name: '_b', id: 1, parentId: 42 }
          ]
        })
      )
    )
    expect(rig.roots).toHaveLength(2)
  })
})

describe('buildSkinnedScene', () => {
  const frm = makeTestFrm()

  it('binds meshes whose boneName matches a bone (prefix-insensitively)', () => {
    const file = readPmg(
      buildPmgFixture({ meshes: [{ version: '2.0', boneName: 'body', jointName: 'head' }] })
    )
    const built = buildSkinnedScene(file, frm)
    const object = built.byKey.get('0:0')
    expect(object).toBeInstanceOf(THREE.SkinnedMesh)
    const skinned = object as THREE.SkinnedMesh
    const skinIndex = skinned.geometry.getAttribute('skinIndex')
    const skinWeight = skinned.geometry.getAttribute('skinWeight')
    // Vertices without a skin record: full weight on the boneName bone (_body = 1).
    expect(skinIndex.getX(0)).toBe(1)
    expect(skinWeight.getX(0)).toBe(1)
    expect(skinWeight.getY(0)).toBe(0)
    // Fixture skin record: vertex 2, weight 0.5 on _body, 0.5 on _head (index 2).
    const record = FIXTURE_SKINS[0]
    expect(skinIndex.getX(record.vertexIndex)).toBe(1)
    expect(skinIndex.getY(record.vertexIndex)).toBe(2)
    expect(skinWeight.getX(record.vertexIndex)).toBeCloseTo(record.weight)
    expect(skinWeight.getY(record.vertexIndex)).toBeCloseTo(1 - record.weight)
    expect(built.stats.skinnedMeshCount).toBe(1)
    expect(built.stats.unmatchedBoneNames).toEqual([])

    // Geometry is baked into bind-world space: boneL2G x matrix1 x vertex.
    const bindWorld = new THREE.Matrix4()
      .fromArray(readMatrix(frm.bones[1].localToGlobal))
      .transpose()
      .multiply(new THREE.Matrix4().fromArray(fixtureMatrix1()).transpose())
    const v0 = FIXTURE_VERTICES[0]
    const expected = new THREE.Vector3(v0.x, v0.y, v0.z).applyMatrix4(bindWorld)
    const position = skinned.geometry.getAttribute('position')
    expect(position.getX(0)).toBeCloseTo(expected.x, 3)
    expect(position.getY(0)).toBeCloseTo(expected.y, 3)
    expect(position.getZ(0)).toBeCloseTo(expected.z, 3)
  })

  it('keeps meshes with unmatched bone names on the static matrix2 path', () => {
    const file = readPmg(buildPmgFixture({ meshes: [{ version: '2.0', boneName: 'nosuch' }] }))
    const built = buildSkinnedScene(file, frm)
    const object = built.byKey.get('0:0')
    expect(object).not.toBeInstanceOf(THREE.SkinnedMesh)
    expect(built.stats.skinnedMeshCount).toBe(0)
    expect(built.stats.unmatchedBoneNames).toEqual(['nosuch'])
  })
})

describe('applyPlaybackPose / resetRigPose', () => {
  it('applies sampled bone-local poses and restores the bind pose', () => {
    const rig = buildSkeletonRig(makeTestFrm())
    const playback: AniPlayback = {
      durationMs: 100,
      tracks: [
        { times: [0], positions: [7, 8, 9], rotations: [0, 0, 0, 1] },
        { times: [], positions: [], rotations: [] }
      ]
    }
    const bindPosition = rig.bones[0].position.clone()
    applyPlaybackPose(rig, playback, 0)
    expect(rig.bones[0].position.toArray()).toEqual([7, 8, 9])
    // Track without keyframes keeps the bind pose.
    expect(rig.bones[1].position.y).toBeCloseTo(10)
    resetRigPose(rig)
    expect(rig.bones[0].position.toArray()).toEqual(bindPosition.toArray())
  })
})
