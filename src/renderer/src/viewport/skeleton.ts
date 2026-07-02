/**
 * Builds a THREE.Skeleton from a parsed .frm file and binds PMG meshes to it
 * as SkinnedMesh objects. Matrix convention: raw 64-byte fields are row-major
 * with translation at indices 3/7/11 (p' = M*p); Matrix4.fromArray(...)
 * .transpose() converts to three.js. Bone local bind transform =
 * parentGlobalToLocal x boneLocalToGlobal; skinned vertices are baked into
 * bind-world space via matrix2 (the static world transform) so the bind pose
 * reproduces the static render exactly, and bones deform relative to their
 * file-provided inverse binds. Consumed by Viewport.tsx; tested in
 * tests/viewport/skeleton.test.ts and tests/viewport/bindPose.test.ts.
 */
import * as THREE from 'three'
import type { FrmFile } from '../../../core/frm/types'
import { isFrmRootBone } from '../../../core/frm/types'
import { readMatrix, readSkin } from '../../../core/pmg/access'
import type { PmMesh, PmgFile } from '../../../core/pmg/types'
import type { AniPlayback } from './aniPlayback'
import { loopTimeMs, sampleTrack } from './aniPlayback'
import { buildMeshGeometry, buildMeshObject, createMeshMaterial, meshKeyOf } from './buildMeshes'

interface BindLocal {
  readonly position: THREE.Vector3
  readonly quaternion: THREE.Quaternion
  readonly scale: THREE.Vector3
}

export interface SkeletonRig {
  readonly bones: readonly THREE.Bone[]
  readonly roots: readonly THREE.Bone[]
  readonly skeleton: THREE.Skeleton
  /** Bind-pose local transforms so playback can be reset. */
  readonly bindLocals: readonly BindLocal[]
}

export interface SkinnedSceneStats {
  readonly meshCount: number
  readonly skinnedMeshCount: number
  /** Distinct PMG bone names that matched no skeleton bone. */
  readonly unmatchedBoneNames: readonly string[]
}

export interface BuiltSkinnedScene {
  readonly root: THREE.Group
  readonly byKey: ReadonlyMap<string, THREE.Mesh>
  readonly rig: SkeletonRig
  readonly stats: SkinnedSceneStats
}

/** Raw row-major matrix field to a three.js (column-major) Matrix4. */
function matrixOf(raw: Uint8Array): THREE.Matrix4 {
  return new THREE.Matrix4().fromArray(readMatrix(raw)).transpose()
}

/** Build the bone hierarchy + skeleton with file-provided inverse binds. */
export function buildSkeletonRig(frm: FrmFile): SkeletonRig {
  const bones = frm.bones.map((frmBone) => {
    const bone = new THREE.Bone()
    bone.name = frmBone.name.text
    return bone
  })
  const roots: THREE.Bone[] = []
  const boneInverses: THREE.Matrix4[] = []
  const bindLocals: BindLocal[] = []
  frm.bones.forEach((frmBone, index) => {
    const bone = bones[index]
    const localToGlobal = matrixOf(frmBone.localToGlobal)
    const hasParent = !isFrmRootBone(frmBone) && frmBone.parentId < bones.length
    const local = hasParent
      ? matrixOf(frm.bones[frmBone.parentId].globalToLocal).multiply(localToGlobal)
      : localToGlobal
    local.decompose(bone.position, bone.quaternion, bone.scale)
    if (hasParent) bones[frmBone.parentId].add(bone)
    else roots.push(bone)
    boneInverses.push(matrixOf(frmBone.globalToLocal))
    bindLocals.push({
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
      scale: bone.scale.clone()
    })
  })
  return { bones, roots, skeleton: new THREE.Skeleton(bones, boneInverses), bindLocals }
}

/** Lowercased bone-name lookup; PMG names omit the FRM "_"/"-" prefix. */
function buildBoneNameIndex(frm: FrmFile): Map<string, number> {
  const index = new Map<string, number>()
  frm.bones.forEach((bone, boneIndex) => {
    const lower = bone.name.text.toLowerCase()
    if (!index.has(lower)) index.set(lower, boneIndex)
    const stripped = lower.replace(/^[_-]+/, '')
    if (!index.has(stripped)) index.set(stripped, boneIndex)
  })
  return index
}

function lookupBone(index: Map<string, number>, name: string): number | undefined {
  const lower = name.toLowerCase()
  return index.get(lower) ?? index.get(lower.replace(/^[_-]+/, ''))
}

const INFLUENCES_PER_VERTEX = 4

function buildSkinAttributes(
  pmMesh: PmMesh,
  boneIndex: number,
  jointIndex: number | undefined
): { skinIndex: THREE.BufferAttribute; skinWeight: THREE.BufferAttribute } {
  const count = pmMesh.counts.vertexCount
  const indices = new Uint16Array(count * INFLUENCES_PER_VERTEX)
  const weights = new Float32Array(count * INFLUENCES_PER_VERTEX)
  for (let i = 0; i < count; i += 1) {
    indices[i * INFLUENCES_PER_VERTEX] = boneIndex
    weights[i * INFLUENCES_PER_VERTEX] = 1
  }
  if (jointIndex !== undefined) {
    for (let i = 0; i < pmMesh.counts.skinCount; i += 1) {
      const skin = readSkin(pmMesh, i)
      if (skin.vertexIndex < 0 || skin.vertexIndex >= count) continue
      const base = skin.vertexIndex * INFLUENCES_PER_VERTEX
      const weight = Math.min(1, Math.max(0, skin.weight))
      indices[base] = boneIndex
      indices[base + 1] = jointIndex
      weights[base] = weight
      weights[base + 1] = 1 - weight
    }
  }
  return {
    skinIndex: new THREE.BufferAttribute(indices, INFLUENCES_PER_VERTEX),
    skinWeight: new THREE.BufferAttribute(weights, INFLUENCES_PER_VERTEX)
  }
}

function buildSkinnedMeshObject(
  pmMesh: PmMesh,
  rig: SkeletonRig,
  boneIndex: number,
  jointIndex: number | undefined
): THREE.SkinnedMesh {
  const geometry = buildMeshGeometry(pmMesh)
  // Bake vertices into bind-world space with matrix2, the same transform the
  // static path uses, so a skeleton at bind pose reproduces the static render
  // exactly. (Corpus check: authoringBoneL2G x matrix1 == matrix2; baking
  // matrix2 stays exact even when the loaded FRM differs slightly from the
  // mesh's authoring skeleton.) Bone motion is then applied relatively:
  // v' = boneWorld x globalToLocal(bind) x matrix2 x v.
  geometry.applyMatrix4(matrixOf(pmMesh.matrix2))
  const { skinIndex, skinWeight } = buildSkinAttributes(pmMesh, boneIndex, jointIndex)
  geometry.setAttribute('skinIndex', skinIndex)
  geometry.setAttribute('skinWeight', skinWeight)
  const mesh = new THREE.SkinnedMesh(geometry, createMeshMaterial())
  // Animated bounds change every frame; skip stale-bounds culling.
  mesh.frustumCulled = false
  mesh.bind(rig.skeleton, new THREE.Matrix4())
  return mesh
}

/** Pure mesh-to-bone match summary (no THREE objects; safe during render). */
export function computeSkinnedSceneStats(file: PmgFile, frm: FrmFile): SkinnedSceneStats {
  const nameIndex = buildBoneNameIndex(frm)
  const unmatched = new Set<string>()
  let skinnedMeshCount = 0
  let meshCount = 0
  for (const group of file.groups) {
    for (const pmMesh of group.meshes) {
      meshCount += 1
      if (lookupBone(nameIndex, pmMesh.boneName.text) === undefined) {
        if (pmMesh.boneName.text.length > 0) unmatched.add(pmMesh.boneName.text)
      } else {
        skinnedMeshCount += 1
      }
    }
  }
  return { meshCount, skinnedMeshCount, unmatchedBoneNames: [...unmatched] }
}

/**
 * Build the whole PMG scene bound to the FRM skeleton. Meshes whose boneName
 * matches a bone become SkinnedMesh (per-vertex weights from the skin block,
 * full boneName weight otherwise); unmatched meshes keep the static matrix2
 * transform used by buildMeshObject.
 */
export function buildSkinnedScene(file: PmgFile, frm: FrmFile): BuiltSkinnedScene {
  const rig = buildSkeletonRig(frm)
  const nameIndex = buildBoneNameIndex(frm)
  const root = new THREE.Group()
  rig.roots.forEach((bone) => root.add(bone))
  const byKey = new Map<string, THREE.Mesh>()
  file.groups.forEach((group, groupIndex) => {
    group.meshes.forEach((pmMesh, meshIndex) => {
      const boneIndex = lookupBone(nameIndex, pmMesh.boneName.text)
      const object =
        boneIndex === undefined
          ? buildMeshObject(pmMesh)
          : buildSkinnedMeshObject(
              pmMesh,
              rig,
              boneIndex,
              lookupBone(nameIndex, pmMesh.jointName.text)
            )
      byKey.set(meshKeyOf(groupIndex, meshIndex), object)
      root.add(object)
    })
  })
  return { root, byKey, rig, stats: computeSkinnedSceneStats(file, frm) }
}

/** Apply the sampled animation pose (looping) to the rig's bone locals. */
export function applyPlaybackPose(rig: SkeletonRig, playback: AniPlayback, timeMs: number): void {
  const time = loopTimeMs(timeMs, playback.durationMs)
  const count = Math.min(playback.tracks.length, rig.bones.length)
  for (let i = 0; i < count; i += 1) {
    const pose = sampleTrack(playback.tracks[i], time)
    if (!pose) continue
    rig.bones[i].position.set(pose.position[0], pose.position[1], pose.position[2])
    rig.bones[i].quaternion.set(
      pose.rotation[0],
      pose.rotation[1],
      pose.rotation[2],
      pose.rotation[3]
    )
  }
}

/** Restore every bone to its bind-pose local transform. */
export function resetRigPose(rig: SkeletonRig): void {
  rig.bones.forEach((bone, index) => {
    const bind = rig.bindLocals[index]
    bone.position.copy(bind.position)
    bone.quaternion.copy(bind.quaternion)
    bone.scale.copy(bind.scale)
  })
}
