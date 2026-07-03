/**
 * Three.js scene management for the FX preview panel (renderer, camera,
 * orbit controls, one instanced billboard-quad mesh per EffectType).
 * Billboards are computed in view space in the vertex shader (camera-facing
 * with per-particle spin); the material is additive, depth-write off. The
 * default particle texture is a soft radial sprite drawn on a canvas;
 * setTexture() swaps in a DDS-decoded atlas texture per EffectType
 * (decoded to RGBA8 by src/core/dds/ddsDecode.ts via createDdsTexture).
 * Sim positions/sizes are in effect units (~cm) and scaled by WORLD_SCALE
 * into the scene. Consumed by FxPreview.tsx.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { decodeDds } from '../../../../core/dds/ddsDecode'
import type { TextureSize } from './atlasUv'
import { atlasUvTransform } from './atlasUv'
import type { CompiledEmitter, ParticleState } from './particleModel'
import { MAX_PARTICLES_PER_TYPE, particleColorOf, particleSizeOf } from './particleModel'

const WORLD_SCALE = 0.01
const MAX_FRAME_DT_MS = 50

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
  vec4 tex = texture2D(map, uvTransform.xy + vUv * uvTransform.zw);
  gl_FragColor = tex * vColor;
}
`

/**
 * Decode a DDS byte buffer (mip 0) into an RGBA8 texture usable by
 * setTexture(). Uses the project decoder (DXT1/3/5, DX10 BC1-3 and
 * uncompressed 16/24/32-bit bitmask formats — the formats Mabinogi ships).
 * Throws on unsupported formats or malformed files so callers can surface
 * the reason; flipY stays false to match the atlas UV math in
 * atlasUvTransform() (atlasUv.ts).
 */
export function createDdsTexture(bytes: Uint8Array): THREE.DataTexture {
  const { width, height, rgba } = decodeDds(bytes)
  const texture = new THREE.DataTexture(
    rgba,
    width,
    height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  )
  texture.flipY = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

export interface PreviewSceneHandle {
  /** (Re)create one renderable per EffectType; resets textures to default. */
  syncEffectTypes(count: number): void
  /** Override the sprite of one EffectType (null restores the default). */
  setTexture(index: number, texture: THREE.Texture | null): void
  /** Copy the current simulation state into the instance buffers. */
  updateParticles(state: ParticleState, compiled: CompiledEmitter): void
  dispose(): void
}

interface Renderable {
  readonly mesh: THREE.Mesh
  readonly geometry: THREE.InstancedBufferGeometry
  readonly material: THREE.ShaderMaterial
  readonly offsets: THREE.InstancedBufferAttribute
  readonly colors: THREE.InstancedBufferAttribute
  readonly sizeRots: THREE.InstancedBufferAttribute
  texture: THREE.Texture | null
}

/** Soft white-to-transparent radial sprite used when no DDS is available. */
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

/**
 * Runtime pixel size of a texture image (canvas or DataTexture); null when
 * unknown. Feeds tas_crop cells in atlasUvTransform (atlasUv.ts). Shared
 * with meshdescScene.ts.
 */
export function textureSizeOf(texture: THREE.Texture): TextureSize | null {
  const image = texture.image as { width?: unknown; height?: unknown } | null | undefined
  const width = typeof image?.width === 'number' ? image.width : 0
  const height = typeof image?.height === 'number' ? image.height : 0
  return width > 0 && height > 0 ? { width, height } : null
}

function createRenderable(defaultSprite: THREE.Texture): Renderable {
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
      map: { value: defaultSprite },
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

export function createPreviewScene(
  container: HTMLElement,
  onFrame: (dtMs: number) => void
): PreviewSceneHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)
  scene.add(new THREE.GridHelper(10, 10, 0x2c3340, 0x1a1f28))

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 500)
  camera.position.set(3, 2.5, 4)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.target.set(0, 0.8, 0)

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

  const defaultSprite = createDefaultSprite()
  let renderables: Renderable[] = []

  const disposeRenderable = (renderable: Renderable): void => {
    scene.remove(renderable.mesh)
    renderable.geometry.dispose()
    renderable.material.dispose()
    renderable.texture?.dispose()
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
    syncEffectTypes(count: number): void {
      renderables.forEach(disposeRenderable)
      renderables = Array.from({ length: count }, () => createRenderable(defaultSprite))
      renderables.forEach((renderable) => scene.add(renderable.mesh))
    },

    setTexture(index: number, texture: THREE.Texture | null): void {
      const renderable = renderables[index]
      if (!renderable) {
        texture?.dispose()
        return
      }
      renderable.texture?.dispose()
      renderable.texture = texture
      renderable.material.uniforms.map.value = texture ?? defaultSprite
    },

    updateParticles(state: ParticleState, compiled: CompiledEmitter): void {
      renderables.forEach((renderable, index) => {
        const effectType = compiled.effectTypes[index]
        const particles = state.effectTypes[index]?.particles ?? []
        if (!effectType) {
          renderable.geometry.instanceCount = 0
          return
        }
        const count = Math.min(particles.length, MAX_PARTICLES_PER_TYPE)
        for (let i = 0; i < count; i++) {
          const particle = particles[i]
          const color = particleColorOf(particle, effectType)
          renderable.offsets.setXYZ(
            i,
            particle.x * WORLD_SCALE,
            particle.y * WORLD_SCALE,
            particle.z * WORLD_SCALE
          )
          renderable.colors.setXYZW(i, color.r, color.g, color.b, color.a)
          renderable.sizeRots.setXY(
            i,
            particleSizeOf(particle, effectType) * WORLD_SCALE,
            particle.rotation
          )
        }
        renderable.offsets.needsUpdate = true
        renderable.colors.needsUpdate = true
        renderable.sizeRots.needsUpdate = true
        renderable.geometry.instanceCount = count
        // Atlas cells only apply to the real texture; the fallback sprite
        // renders whole so the placeholder stays a recognizable soft dot.
        const texture = renderable.texture ?? defaultSprite
        const [x, y, z, w] = atlasUvTransform(
          renderable.texture ? effectType.atlas : null,
          texture.flipY,
          state.timeMs,
          textureSizeOf(texture)
        )
        ;(renderable.material.uniforms.uvTransform.value as THREE.Vector4).set(x, y, z, w)
      })
    },

    dispose(): void {
      observer.disconnect()
      renderer.setAnimationLoop(null)
      controls.dispose()
      renderables.forEach(disposeRenderable)
      renderables = []
      defaultSprite.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }
}
