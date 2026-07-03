/**
 * Three.js scene for the meshdesc binding preview: the sibling PMG weapon
 * model plus one instanced billboard-particle batch per bound Effect row,
 * each batch parented to a group positioned at the row's resolved anchor.
 *
 * The particle renderable (shaders, instanced buffers, additive blending)
 * mirrors previewScene.ts, which is single-emitter and owned by the FX tab;
 * this variant adds a per-attachment world anchor and the PMG model. The
 * mesh building mirrors viewport/buildMeshes.ts (only fitCamera may be
 * imported from viewport/). DDS atlas textures are resolved through
 * window.api.readFxTexture with the data root persisted by the FX tab
 * (localStorage fx.dataRoot); any miss or decode failure falls back
 * silently to the default soft sprite.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { readIndices, readMatrix, readVertex } from '../../../core/pmg/access'
import type { PmgFile, PmMesh } from '../../../core/pmg/types'
import type { Vec3 } from '../../../core/fx/meshdesc'
import type { RotationQuaternion } from './meshdescPreviewModel'
import { computeCameraFit } from '../viewport/fitCamera'
import { atlasUvTransform } from './preview/atlasUv'
import type { CompiledEmitter, ParticleState } from './preview/particleModel'
import { MAX_PARTICLES_PER_TYPE, particleColorOf, particleSizeOf } from './preview/particleModel'
import { createDdsTexture, textureSizeOf } from './preview/previewScene'

const MAX_FRAME_DT_MS = 50
const COLOR_BYTE_MAX = 255
const GRID_DIVISIONS = 40
const GRID_CENTER_COLOR = 0x3a4150
const GRID_LINE_COLOR = 0x262b34
const DEFAULT_GRID_SIZE = 20

const VERTEX_SHADER = `
attribute vec3 offset;
attribute vec4 particleColor;
attribute vec2 sizeRot;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = uv;
  vColor = particleColor;
  float c = cos(sizeRot.y);
  float s = sin(sizeRot.y);
  vec2 corner = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * sizeRot.x;
  vec4 mvPosition = modelViewMatrix * vec4(offset, 1.0);
  mvPosition.xy += corner;
  gl_Position = projectionMatrix * mvPosition;
}
`

const FRAGMENT_SHADER = `
uniform sampler2D map;
uniform vec4 uvTransform;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  gl_FragColor = texture2D(map, uvTransform.xy + vUv * uvTransform.zw) * vColor;
}
`

/** Same persisted data root the FX preview tab writes (FxPreview.tsx). */
const DATA_ROOT_STORAGE_KEY = 'fx.dataRoot'

const readStoredDataRoot = (): string => {
  try {
    return (localStorage.getItem(DATA_ROOT_STORAGE_KEY) ?? '').trim()
  } catch {
    return ''
  }
}

export interface MeshdescAttachment {
  readonly compiled: CompiledEmitter
  /** World anchor = bone/slot position + row offset in the parent frame. */
  readonly anchor: Vec3
  /**
   * rot_axis/rot_angle as a quaternion applied to the emitter group AT the
   * anchor. Assumption (engine order unknown): the offset is applied in the
   * parent bone frame first (baked into `anchor`), then the emitter frame is
   * rotated — so rot only reorients emission/velocity directions, it does
   * not move the anchor. Particles stay camera-facing billboards.
   */
  readonly rotation: RotationQuaternion
}

export interface MeshdescSceneHandle {
  /** Swap the PMG model (null clears it); refits the camera when loaded. */
  setModel(file: PmgFile | null): void
  /** Recreate one anchored particle batch per attachment. */
  syncAttachments(attachments: readonly MeshdescAttachment[]): void
  /** Copy per-attachment simulation states into the instance buffers. */
  updateParticles(states: readonly (ParticleState | null)[]): void
  dispose(): void
}

interface Renderable {
  readonly mesh: THREE.Mesh
  readonly geometry: THREE.InstancedBufferGeometry
  readonly material: THREE.ShaderMaterial
  readonly offsets: THREE.InstancedBufferAttribute
  readonly colors: THREE.InstancedBufferAttribute
  readonly sizeRots: THREE.InstancedBufferAttribute
  /** DDS atlas texture when resolved; null keeps the default sprite. */
  texture: THREE.Texture | null
}

interface AttachmentBatch {
  readonly group: THREE.Group
  readonly compiled: CompiledEmitter
  readonly renderables: readonly Renderable[]
}

/** Soft white-to-transparent radial sprite (same look as the FX preview). */
function createDefaultSprite(): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.55)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function createRenderable(sprite: THREE.Texture): Renderable {
  const plane = new THREE.PlaneGeometry(1, 1)
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.index = plane.index
  geometry.setAttribute('position', plane.getAttribute('position'))
  geometry.setAttribute('uv', plane.getAttribute('uv'))
  const offsets = new THREE.InstancedBufferAttribute(
    new Float32Array(MAX_PARTICLES_PER_TYPE * 3),
    3
  )
  const colors = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES_PER_TYPE * 4), 4)
  const sizeRots = new THREE.InstancedBufferAttribute(
    new Float32Array(MAX_PARTICLES_PER_TYPE * 2),
    2
  )
  for (const attribute of [offsets, colors, sizeRots]) {
    attribute.setUsage(THREE.DynamicDrawUsage)
  }
  geometry.setAttribute('offset', offsets)
  geometry.setAttribute('particleColor', colors)
  geometry.setAttribute('sizeRot', sizeRots)
  geometry.instanceCount = 0

  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: sprite },
      uvTransform: { value: new THREE.Vector4(0, 0, 1, 1) }
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  return { mesh, geometry, material, offsets, colors, sizeRots, texture: null }
}

/** PMG mesh -> THREE.Mesh, mirroring viewport/buildMeshes.ts. */
function buildModelMesh(pmMesh: PmMesh): THREE.Mesh {
  const count = pmMesh.counts.vertexCount
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const vertex = readVertex(pmMesh, i)
    positions[i * 3] = vertex.x
    positions[i * 3 + 1] = vertex.y
    positions[i * 3 + 2] = vertex.z
    normals[i * 3] = vertex.nx
    normals[i * 3 + 1] = vertex.ny
    normals[i * 3 + 2] = vertex.nz
    colors[i * 3] = vertex.r / COLOR_BYTE_MAX
    colors[i * 3 + 1] = vertex.g / COLOR_BYTE_MAX
    colors[i * 3 + 2] = vertex.b / COLOR_BYTE_MAX
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(new THREE.BufferAttribute(readIndices(pmMesh), 1))
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0.05
  })
  const object = new THREE.Mesh(geometry, material)
  object.matrixAutoUpdate = false
  // matrix2 is stored row-major with translation at 3/7/11.
  object.matrix.fromArray(readMatrix(pmMesh.matrix2)).transpose()
  return object
}

function disposeObject(object: THREE.Mesh): void {
  object.geometry.dispose()
  const material = object.material
  if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
  else material.dispose()
}

function fillRenderable(
  renderable: Renderable,
  state: ParticleState | null,
  compiled: CompiledEmitter,
  effectTypeIndex: number
): void {
  const effectType = compiled.effectTypes[effectTypeIndex]
  const particles = state?.effectTypes[effectTypeIndex]?.particles ?? []
  if (!effectType) {
    renderable.geometry.instanceCount = 0
    return
  }
  const count = Math.min(particles.length, MAX_PARTICLES_PER_TYPE)
  for (let i = 0; i < count; i++) {
    const particle = particles[i]
    const color = particleColorOf(particle, effectType)
    renderable.offsets.setXYZ(i, particle.x, particle.y, particle.z)
    renderable.colors.setXYZW(i, color.r, color.g, color.b, color.a)
    renderable.sizeRots.setXY(i, particleSizeOf(particle, effectType), particle.rotation)
  }
  renderable.offsets.needsUpdate = true
  renderable.colors.needsUpdate = true
  renderable.sizeRots.needsUpdate = true
  renderable.geometry.instanceCount = count
  // Default sprite is a flipY=true CanvasTexture; DDS textures are flipY=false.
  // Atlas cells only apply to the real texture; the fallback sprite renders
  // whole so the placeholder stays a recognizable soft dot.
  const flipY = renderable.texture?.flipY ?? true
  const [x, y, z, w] = atlasUvTransform(
    renderable.texture ? effectType.atlas : null,
    flipY,
    state?.timeMs ?? 0,
    renderable.texture ? textureSizeOf(renderable.texture) : null
  )
  ;(renderable.material.uniforms.uvTransform.value as THREE.Vector4).set(x, y, z, w)
}

export function createMeshdescScene(
  container: HTMLElement,
  onFrame: (dtMs: number) => void
): MeshdescSceneHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x16181d)
  let grid = new THREE.GridHelper(
    DEFAULT_GRID_SIZE,
    GRID_DIVISIONS,
    GRID_CENTER_COLOR,
    GRID_LINE_COLOR
  )
  scene.add(grid)
  scene.add(new THREE.HemisphereLight(0xdde4ff, 0x2c3038, 1.1))
  const sun = new THREE.DirectionalLight(0xffffff, 1.6)
  sun.position.set(5, 10, 7)
  scene.add(sun)

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 500)
  camera.position.set(2, 1.5, 3)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  const resize = (): void => {
    const width = container.clientWidth
    const height = container.clientHeight
    if (width === 0 || height === 0) return
    renderer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(container)

  const sprite = createDefaultSprite()
  let modelMeshes: THREE.Mesh[] = []
  const modelRoot = new THREE.Group()
  scene.add(modelRoot)
  let batches: AttachmentBatch[] = []

  const fitCameraToModel = (): void => {
    modelRoot.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(modelRoot)
    const viewDirection = camera.position.clone().sub(controls.target)
    const fit = computeCameraFit(box, viewDirection)
    if (!fit) return
    camera.position.set(fit.position.x, fit.position.y, fit.position.z)
    camera.near = fit.near
    camera.far = fit.far
    camera.updateProjectionMatrix()
    controls.target.set(fit.target.x, fit.target.y, fit.target.z)
    controls.minDistance = fit.minDistance
    controls.maxDistance = fit.maxDistance
    controls.update()
    scene.remove(grid)
    grid.dispose()
    grid = new THREE.GridHelper(fit.gridSize, GRID_DIVISIONS, GRID_CENTER_COLOR, GRID_LINE_COLOR)
    grid.position.set(fit.target.x, fit.gridY, fit.target.z)
    scene.add(grid)
  }

  const disposeBatch = (batch: AttachmentBatch): void => {
    scene.remove(batch.group)
    for (const renderable of batch.renderables) {
      renderable.geometry.dispose()
      renderable.material.dispose()
      renderable.texture?.dispose()
    }
  }

  // Bumped on every syncAttachments()/dispose() so in-flight async texture
  // reads for replaced batches are dropped instead of applied.
  let textureGeneration = 0

  const applyTexture = (renderable: Renderable, data: Uint8Array): void => {
    try {
      const texture = createDdsTexture(data)
      renderable.texture?.dispose()
      renderable.texture = texture
      renderable.material.uniforms.map.value = texture
    } catch {
      // Undecodable DDS: keep the default sprite silently.
    }
  }

  const loadBatchTextures = (targets: readonly AttachmentBatch[]): void => {
    const root = readStoredDataRoot()
    if (root === '') return
    const generation = textureGeneration
    for (const batch of targets) {
      batch.compiled.effectTypes.forEach((effectType, index) => {
        const name = effectType.atlas?.texture
        const renderable = batch.renderables[index]
        if (!name || !renderable) return
        window.api
          .readFxTexture(root, name)
          .then((result) => {
            if (generation !== textureGeneration || !result) return
            applyTexture(renderable, new Uint8Array(result.data))
          })
          .catch(() => undefined)
      })
    }
  }

  let lastTime = performance.now()
  renderer.setAnimationLoop(() => {
    const now = performance.now()
    const dtMs = Math.min(now - lastTime, MAX_FRAME_DT_MS)
    lastTime = now
    onFrame(dtMs)
    controls.update()
    renderer.render(scene, camera)
  })

  return {
    setModel(file: PmgFile | null): void {
      modelMeshes.forEach(disposeObject)
      modelRoot.clear()
      modelMeshes = []
      if (!file) return
      for (const group of file.groups) {
        for (const pmMesh of group.meshes) {
          const object = buildModelMesh(pmMesh)
          modelMeshes.push(object)
          modelRoot.add(object)
        }
      }
      fitCameraToModel()
    },

    syncAttachments(attachments: readonly MeshdescAttachment[]): void {
      textureGeneration += 1
      batches.forEach(disposeBatch)
      batches = attachments.map((attachment) => {
        const group = new THREE.Group()
        group.position.set(attachment.anchor.x, attachment.anchor.y, attachment.anchor.z)
        const { rotation } = attachment
        group.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
        const renderables = attachment.compiled.effectTypes.map(() => createRenderable(sprite))
        renderables.forEach((renderable) => group.add(renderable.mesh))
        scene.add(group)
        return { group, compiled: attachment.compiled, renderables }
      })
      loadBatchTextures(batches)
    },

    updateParticles(states: readonly (ParticleState | null)[]): void {
      batches.forEach((batch, batchIndex) => {
        const state = states[batchIndex] ?? null
        batch.renderables.forEach((renderable, effectTypeIndex) => {
          fillRenderable(renderable, state, batch.compiled, effectTypeIndex)
        })
      })
    },

    dispose(): void {
      observer.disconnect()
      renderer.setAnimationLoop(null)
      controls.dispose()
      textureGeneration += 1
      batches.forEach(disposeBatch)
      batches = []
      modelMeshes.forEach(disposeObject)
      modelMeshes = []
      grid.dispose()
      sprite.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }
}
