/**
 * Real-corpus invariants for skeleton binding and ANI decoding, using the
 * Nao_mesh_explorer01.pmg + jenna_framework.frm + female_graffitifloor.ani
 * trio. Runs only when samples/corpus exists (gitignored).
 *
 * Invariant 1: a loaded skeleton at bind pose must reproduce the static
 * (matrix2) render exactly — verified numerically on vertices from several
 * meshes via SkinnedMesh.applyBoneTransform.
 *
 * Invariant 2: ANI rotations are conjugates of the FRM bind convention —
 * for bones the animation keeps at bind (tool/helper bones), the decoded
 * frame-0 pose must match the bind-pose local transform.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { readAni } from '../../src/core/ani/reader'
import { readFrm } from '../../src/core/frm/reader'
import { readMatrix, readVertex } from '../../src/core/pmg/access'
import { readPmg } from '../../src/core/pmg/reader'
import { applyPlaybackPose, buildSkinnedScene } from '../../src/renderer/src/viewport/skeleton'
import { buildPlayback } from '../../src/renderer/src/viewport/aniPlayback'

const CORPUS = join(__dirname, '..', '..', 'samples', 'corpus')
const PMG_PATH = join(CORPUS, 'gfx/char/human/Nao/Nao_mesh_explorer01.pmg')
const FRM_PATH = join(CORPUS, 'gfx/char/chapter3/human/female/anim/jenna_framework.frm')
const ANI_PATH = join(CORPUS, 'gfx/char/chapter4/human/anim/female_graffitifloor.ani')

const hasFiles = [PMG_PATH, FRM_PATH, ANI_PATH].every((p) => existsSync(p))

const load = (path: string): Uint8Array => new Uint8Array(readFileSync(path))

describe.skipIf(!hasFiles)('real corpus bind invariants', () => {
  it('skinned bind pose reproduces the static matrix2 render', () => {
    const pmg = readPmg(load(PMG_PATH))
    const frm = readFrm(load(FRM_PATH))
    const built = buildSkinnedScene(pmg, frm)
    built.root.updateMatrixWorld(true)

    let checkedMeshes = 0
    pmg.groups.forEach((group, groupIndex) => {
      group.meshes.forEach((pmMesh, meshIndex) => {
        const object = built.byKey.get(`${groupIndex}:${meshIndex}`)
        if (!(object instanceof THREE.SkinnedMesh)) return
        checkedMeshes += 1
        const staticWorld = new THREE.Matrix4().fromArray(readMatrix(pmMesh.matrix2)).transpose()
        const position = object.geometry.getAttribute('position')
        // First, middle and last vertex of every skinned mesh.
        const samples = [0, position.count >> 1, position.count - 1]
        for (const vertexIndex of samples) {
          const raw = readVertex(pmMesh, vertexIndex)
          const expected = new THREE.Vector3(raw.x, raw.y, raw.z).applyMatrix4(staticWorld)
          const actual = new THREE.Vector3().fromBufferAttribute(position, vertexIndex)
          object.applyBoneTransform(vertexIndex, actual)
          expect(
            actual.distanceTo(expected),
            `mesh ${groupIndex}:${meshIndex} v${vertexIndex}`
          ).toBeLessThan(0.01)
        }
      })
    })
    expect(checkedMeshes).toBeGreaterThan(10)
  })

  it('decoded ani frame 0 keeps unanimated bones at their bind locals', () => {
    const frm = readFrm(load(FRM_PATH))
    const pmg = readPmg(load(PMG_PATH))
    const built = buildSkinnedScene(pmg, frm)
    const playback = buildPlayback(readAni(load(ANI_PATH)))
    expect(playback.tracks).toHaveLength(frm.bones.length)

    applyPlaybackPose(built.rig, playback, 0)

    // Tool/helper bones the graffiti animation never moves away from bind.
    const staticBones = ['_bodytooll', '_bodytoolr', '_backtool', '-neck', '_handtooll']
    for (const name of staticBones) {
      const index = frm.bones.findIndex((bone) => bone.name.text === name)
      expect(index, name).toBeGreaterThanOrEqual(0)
      const bone = built.rig.bones[index]
      const bind = built.rig.bindLocals[index]
      expect(bone.position.distanceTo(bind.position), `${name} position`).toBeLessThan(0.01)
      // q and -q are the same orientation; |dot| must be ~1.
      expect(Math.abs(bone.quaternion.dot(bind.quaternion)), `${name} rotation`).toBeGreaterThan(
        0.9999
      )
    }
  })
})
