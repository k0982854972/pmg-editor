/**
 * Wavefront OBJ/MTL exporter for parsed PMG models.
 *
 * Vertices are transformed by each mesh's matrix2 using the row-major D3D
 * convention (position' = [x y z 1] * M, translation in elements 12..14);
 * normals use the 3x3 rotation part only. The v texture coordinate is
 * flipped (1 - v) and triangle winding is kept as stored in the file.
 */
import { readIndices, readMatrix, readVertex } from '../pmg/access'
import type { PmMesh, PmgFile } from '../pmg/types'

export interface ObjExport {
  readonly obj: string
  readonly mtl: string
}

/** Format a float without scientific notation or trailing zeros. */
const fmt = (n: number): string => String(Number(n.toFixed(6)))

const transformPosition = (m: readonly number[], x: number, y: number, z: number): number[] => [
  x * m[0] + y * m[4] + z * m[8] + m[12],
  x * m[1] + y * m[5] + z * m[9] + m[13],
  x * m[2] + y * m[6] + z * m[10] + m[14]
]

const transformDirection = (m: readonly number[], x: number, y: number, z: number): number[] => [
  x * m[0] + y * m[4] + z * m[8],
  x * m[1] + y * m[5] + z * m[9],
  x * m[2] + y * m[6] + z * m[10]
]

function appendMesh(lines: string[], mesh: PmMesh, vertexOffset: number): number {
  const matrix = readMatrix(mesh.matrix2)
  const vertexCount = mesh.counts.vertexCount

  lines.push(`o ${mesh.meshName.text}`)
  lines.push(`usemtl ${mesh.textureName.text}`)

  for (let i = 0; i < vertexCount; i++) {
    const v = readVertex(mesh, i)
    const [x, y, z] = transformPosition(matrix, v.x, v.y, v.z)
    lines.push(`v ${fmt(x)} ${fmt(y)} ${fmt(z)}`)
  }
  for (let i = 0; i < vertexCount; i++) {
    const v = readVertex(mesh, i)
    lines.push(`vt ${fmt(v.u)} ${fmt(1 - v.v)}`)
  }
  for (let i = 0; i < vertexCount; i++) {
    const v = readVertex(mesh, i)
    const [nx, ny, nz] = transformDirection(matrix, v.nx, v.ny, v.nz)
    lines.push(`vn ${fmt(nx)} ${fmt(ny)} ${fmt(nz)}`)
  }

  const indices = readIndices(mesh)
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const refs = [indices[i], indices[i + 1], indices[i + 2]].map((idx) => {
      const n = vertexOffset + idx + 1
      return `${n}/${n}/${n}`
    })
    lines.push(`f ${refs.join(' ')}`)
  }

  return vertexOffset + vertexCount
}

function buildMtl(file: PmgFile): string {
  const textures: string[] = []
  for (const group of file.groups) {
    for (const mesh of group.meshes) {
      const texture = mesh.textureName.text
      if (!textures.includes(texture)) textures.push(texture)
    }
  }
  const lines = textures.flatMap((texture) => [
    `newmtl ${texture}`,
    'Kd 1 1 1',
    `map_Kd ${texture}.dds`,
    ''
  ])
  return lines.join('\n')
}

export function exportObj(file: PmgFile): ObjExport {
  const lines: string[] = [`mtllib ${file.name.text}.mtl`]
  let vertexOffset = 0
  for (const group of file.groups) {
    for (const mesh of group.meshes) {
      vertexOffset = appendMesh(lines, mesh, vertexOffset)
    }
  }
  lines.push('')
  return { obj: lines.join('\n'), mtl: buildMtl(file) }
}
