/**
 * Builds Three.js objects from PmMesh raw blocks via the typed access helpers.
 * Used by Viewport.tsx; keys are shared with SceneTree visibility toggles.
 */
import * as THREE from 'three'
import { readIndices, readMatrix, readVertex } from '../../../core/pmg/access'
import type { PmMesh, PmgFile } from '../../../core/pmg/types'

export const meshKeyOf = (groupIndex: number, meshIndex: number): string =>
  `${groupIndex}:${meshIndex}`

const COLOR_BYTE_MAX = 255

/** Untransformed geometry from the mesh's raw vertex/index blocks. */
export function buildMeshGeometry(pmMesh: PmMesh): THREE.BufferGeometry {
  const count = pmMesh.counts.vertexCount
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const uvs = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    const vertex = readVertex(pmMesh, i)
    positions[i * 3] = vertex.x
    positions[i * 3 + 1] = vertex.y
    positions[i * 3 + 2] = vertex.z
    normals[i * 3] = vertex.nx
    normals[i * 3 + 1] = vertex.ny
    normals[i * 3 + 2] = vertex.nz
    // File stores color bytes in BGRA order; expose as RGB floats.
    colors[i * 3] = vertex.r / COLOR_BYTE_MAX
    colors[i * 3 + 1] = vertex.g / COLOR_BYTE_MAX
    colors[i * 3 + 2] = vertex.b / COLOR_BYTE_MAX
    // DirectX-style V flips to GL convention.
    uvs[i * 2] = vertex.u
    uvs[i * 2 + 1] = 1 - vertex.v
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(new THREE.BufferAttribute(readIndices(pmMesh), 1))
  return geometry
}

/** Shared material settings for all viewport meshes (static and skinned). */
export function createMeshMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0.05
  })
}

export function buildMeshObject(pmMesh: PmMesh): THREE.Mesh {
  const object = new THREE.Mesh(buildMeshGeometry(pmMesh), createMeshMaterial())
  object.matrixAutoUpdate = false
  // stored row-major with translation at 3/7/11; fromArray expects column-major
  object.matrix.fromArray(readMatrix(pmMesh.matrix2)).transpose()
  return object
}

export interface BuiltScene {
  readonly root: THREE.Group
  readonly byKey: ReadonlyMap<string, THREE.Mesh>
}

export function buildFileScene(file: PmgFile): BuiltScene {
  const root = new THREE.Group()
  const byKey = new Map<string, THREE.Mesh>()
  file.groups.forEach((group, groupIndex) => {
    group.meshes.forEach((pmMesh, meshIndex) => {
      const object = buildMeshObject(pmMesh)
      byKey.set(meshKeyOf(groupIndex, meshIndex), object)
      root.add(object)
    })
  })
  return { root, byKey }
}

export function disposeScene(built: BuiltScene): void {
  built.byKey.forEach((object) => {
    object.geometry.dispose()
    const material = object.material
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
    else material.dispose()
  })
}
