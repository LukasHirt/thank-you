// The WebGL sky: every contributor is a star.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import type { SkyData } from './types.ts'

interface Camera {
  x: number
  y: number
  z: number
  l: number
  tx: number
  ty: number
  tz: number
  tl: number
}
interface Shock {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  t: number
  dur: number
}
type Uniforms = Record<string, THREE.IUniform>
interface ShockOptions {
  implode?: boolean
  dur?: number
  z?: number
}
interface Instant {
  instant?: boolean
}

const GOLD = new THREE.Color('#ffcb6b')

const starVertex = /* glsl */ `
  attribute float aBirth;
  attribute float aSize;
  attribute vec3 aColor;
  attribute vec3 aCenter;
  attribute float aActive;
  attribute float aKind;
  attribute float aHi;
  attribute float aBornAt;     // real time (s) the star was born during playback
  uniform float uDay;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uFocus;      // project index in focus, -1 none
  uniform float uDim;        // dim everything except highlighted (0..1)
  uniform float uSizeScale;
  uniform float uBoostProject; // a chapter's constellation flares up
  uniform float uBoost;
  uniform float uWaveT;        // finale: a wave of light ripples outward (world units travelled)
  uniform float uRelease;      // 0..1 while a chapter lets go of its stars, -1 otherwise
  uniform float uReleaseProject; // project index, -2 = every star
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSpike;
  varying float vRing;         // 0..1 progress of the birth ring, 1 = no ring
  varying float vZoom;

  float bit(float mask, float k) { return mod(floor(mask / exp2(k)), 2.0); }

  void main() {
    float age = uDay - aBirth;
    float born = step(0.0, age);
    // stars are born in place; the birth ring marks their arrival
    vec3 p = position;
    // gentle drift so the sky breathes
    p.xy += 0.0025 * vec2(sin(uTime * 0.13 + aBirth), cos(uTime * 0.11 + aBirth * 1.3));
    // when a chapter ends, its stars are drawn towards the heart of their
    // constellation and spring back, like a breath out
    float released = 0.0;
    if (uRelease >= 0.0 && (uReleaseProject < -1.5 || abs(aCenter.z - uReleaseProject) < 0.5)) {
      released = 1.0;
      float pull = sin(uRelease * 3.14159) * (0.32 - 0.12 * uRelease);
      p = mix(p, vec3(aCenter.xy, 0.0), pull);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float yearIdx = floor(uDay / 365.2425);
    float activeNow = bit(aActive, yearIdx);
    float since = uTime - aBornAt;
    float flare = born * step(0.0, since) * exp(-max(since, 0.0) / 0.9);
    float tw = 0.75 + 0.25 * sin(uTime * (1.2 + fract(aBirth * 0.137) * 2.6) + aBirth);
    tw = mix(0.92, tw, 0.35 + 0.65 * activeNow);

    float size = aSize * (1.0 + 1.0 * flare) * (0.85 + 0.35 * activeNow);
    // chapter boost + finale wave
    float boost = uBoost * (uBoostProject < -1.5 ? 0.3 : step(abs(aCenter.z - uBoostProject), 0.5));
    float wave = uWaveT > 0.0 ? exp(-pow((length(position.xy) - uWaveT) * 5.0, 2.0)) : 0.0;
    size *= 1.0 + 0.9 * boost + 1.1 * wave;
    float after = released * (1.0 - uRelease) * (1.0 - uRelease);
    size *= 1.0 + 0.5 * after;
    float hi = aHi;
    vec3 col = aColor;
    float alpha = born * tw * (aKind > 1.5 ? 0.55 : (aKind > 0.5 ? 0.5 : 1.0));
    alpha = max(alpha, born * 0.35);
    alpha += flare * 0.4 + boost * 0.6 + wave * 0.7 + after * 0.45;

    if (hi > 0.9) {            // you
      col = vec3(1.0, 0.8, 0.42);
      size = max(size * 1.6, 13.0) * (1.2 + 0.12 * sin(uTime * 2.4));
      alpha = born > 0.5 ? 2.2 : 0.55 + 0.25 * sin(uTime * 2.0); // waiting before your birth
      if (born < 0.5) { p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }
    } else if (hi > 0.4) {     // your collaborators
      col = mix(col, vec3(1.0, 0.9, 0.7), 0.5);
      size *= 1.5;
      alpha *= 1.2;
    } else {
      alpha *= 1.0 - uDim * 0.7;
    }
    if (uFocus >= 0.0 && hi < 0.4) {
      float inFocus = step(abs(aCenter.z - uFocus), 0.5);
      alpha *= mix(0.18, 1.0, inFocus);
    }
    // a ring spreads out from every newborn star (code contributors only, the dust stays quiet)
    float ringAge = since / 1.8;
    float ringOn = born * step(0.0, ringAge) * step(ringAge, 1.0) * step(aKind, 0.5) * step(hi, 0.4);
    vRing = ringOn > 0.5 ? ringAge : 1.0;
    float zoom = ringOn > 0.5 ? clamp(90.0 / max(size * (2.6 / -mv.z) * uSizeScale, 1.0), 1.0, 7.0) : 1.0;
    vZoom = zoom;
    vColor = col * (1.0 + flare * 1.2 + wave * 0.6);
    vAlpha = alpha;
    vSpike = smoothstep(4.0, 9.0, size);
    gl_PointSize = size * zoom * uPixelRatio * (2.6 / -mv.z) * uSizeScale;
  }
`

const starFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSpike;
  varying float vRing;
  varying float vZoom;
  void main() {
    vec2 c0 = gl_PointCoord - 0.5;
    vec2 c = c0 * vZoom;
    float d2 = dot(c, c);
    float ring = 0.0;
    if (vRing < 1.0) {
      float r = 0.06 + 0.42 * sqrt(vRing);
      ring = exp(-pow((length(c0) - r) * 70.0, 2.0)) * (1.0 - vRing) * 0.6;
    }
    float core = exp(-d2 * 90.0);
    float glow = exp(-d2 * 14.0) * 0.35;
    float spikes = (exp(-abs(c.x) * 60.0) * exp(-c.y * c.y * 18.0) + exp(-abs(c.y) * 60.0) * exp(-c.x * c.x * 18.0)) * 0.35 * vSpike;
    float a = (core + glow + spikes) * vAlpha + ring;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`

const nebulaFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColors[8];
  uniform vec2 uCenters[8];
  uniform float uGlow[8];
  varying vec2 vP;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  void main() {
    vec2 p = vP / 1.5;
    float n = fbm(p * 0.9 + vec2(uTime * 0.004, -uTime * 0.003));
    float n2 = fbm(p * 2.1 - vec2(uTime * 0.006, 0.0) + n);
    vec3 col = mix(vec3(0.0006, 0.0012, 0.004), vec3(0.003, 0.006, 0.016), n);
    for (int i = 0; i < 8; i++) {
      float d = length(p - uCenters[i]);
      col += uColors[i] * uColors[i] * uGlow[i] * exp(-d * d * 3.5) * (0.15 + 0.85 * n2 * n2) * 0.035;
    }
    col *= 0.85 + 0.3 * smoothstep(0.2, 0.8, n2);
    float vign = smoothstep(1.4, 0.2, length(vP / vec2(9.0, 6.0)) * 1.6);
    gl_FragColor = vec4(col * vign, 1.0);
  }
`

const lineVertex = /* glsl */ `
  attribute float aBirth;
  attribute vec3 aColor;
  uniform float uDay;
  varying float vA;
  varying vec3 vC;
  void main() {
    vA = smoothstep(0.0, 500.0, uDay - aBirth);
    vC = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const lineFragment = /* glsl */ `
  uniform float uOpacity;
  varying float vA;
  varying vec3 vC;
  void main() { gl_FragColor = vec4(vC, vA * uOpacity); }
`

export class Sky {
  readonly data: SkyData
  readonly container: HTMLElement
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly world: THREE.Group
  readonly camera: THREE.PerspectiveCamera
  readonly composer: EffectComposer
  readonly bloom: UnrealBloomPass
  cam: Camera
  mouse = { x: 0, y: 0 }
  day = 0
  time = 0
  focus = -1
  dim = 0
  count = 0
  baseZ = 3.2
  homeY = 0
  portrait = false
  insets = { top: 0, bottom: 0 }
  selected: number | null = null
  collab: number[] = []
  boost = { project: -1, value: 0, target: 0 }
  waveStart: number | null = null
  releaseStart: number | null = null
  releaseDur = 1.6
  orbit = 1
  nebula!: THREE.ShaderMaterial
  points!: THREE.Points
  starMaterial!: THREE.ShaderMaterial
  starUniforms!: Uniforms
  lineUniforms!: Uniforms
  constellationLines!: THREE.LineSegments
  collabLines!: THREE.LineSegments
  collabMaterial!: THREE.LineBasicMaterial
  centers!: Float32Array
  hi!: Float32Array
  hiAttr!: THREE.BufferAttribute
  bornAt!: Float32Array
  bornAttr!: THREE.BufferAttribute
  shocks: Shock[] = []
  shockGeo!: THREE.PlaneGeometry
  projectBirths: number[][] | null = null

  constructor(container: HTMLElement, data: SkyData) {
    this.data = data
    this.container = container
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance'
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x02050d, 1)
    container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.world = new THREE.Group() // rotated 90° on portrait screens
    this.scene.add(this.world)
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50)
    this.cam = { x: 0, y: 0, z: 3.2, l: 0, tx: 0, ty: 0, tz: 3.2, tl: 0 } // current + target (l = depth we look at)
    this.mouse = { x: 0, y: 0 }
    this.day = 0
    this.time = 0
    this.focus = -1
    this.dim = 0

    this.#buildNebula()
    this.#buildStars()
    this.#buildConstellations()
    this.#buildCollabLines()
    this.#buildShockwaves()
    this.boost = { project: -1, value: 0, target: 0 }
    this.waveStart = null
    this.orbit = 1 // 0 = still camera

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.45, 0.22)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  #buildNebula() {
    const { projects } = this.data
    this.nebula = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColors: { value: projects.map((p) => new THREE.Color(p.color)) },
        uCenters: { value: projects.map((p) => new THREE.Vector2(p.center[0], p.center[1])) },
        uGlow: { value: projects.map(() => 0) }
      },
      vertexShader:
        'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: nebulaFragment,
      depthWrite: false
    })
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), this.nebula)
    plane.position.z = -1.6
    this.world.add(plane)
  }

  #buildStars() {
    const { stars, projects } = this.data
    const n = stars.birth.length
    this.count = n
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(stars.pos)
    const birth = new Float32Array(stars.birth)
    const size = new Float32Array(n)
    const color = new Float32Array(n * 3)
    const center = new Float32Array(n * 3)
    const kind = new Float32Array(stars.kind)
    const active = new Float32Array(stars.active)
    this.hi = new Float32Array(n)
    const pc = projects.map((p) => new THREE.Color(p.color))
    const white = new THREE.Color('#f4f7ff')
    for (let i = 0; i < n; i++) {
      const k = stars.kind[i]
      const w = stars.weight[i]
      size[i] = k === 1 ? 1.6 + w * 0.25 : 2.2 + w * 0.75
      const c = white.clone().lerp(pc[stars.project[i]], k === 1 ? 0.65 : 0.35 + 0.02 * w)
      color.set([c.r, c.g, c.b], i * 3)
      const pr = projects[stars.project[i]].center
      // z of the center encodes the project index for focus mode (not used for position)
      center.set([pr[0], pr[1], stars.project[i]], i * 3)
    }
    // aCenter.z doubles as project id; real centre z is 0, fix in shader via separate attr:
    this.centers = center
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
    g.setAttribute('aCenter', new THREE.BufferAttribute(center, 3))
    g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1))
    g.setAttribute('aActive', new THREE.BufferAttribute(active, 1))
    this.bornAt = new Float32Array(n).fill(-1e4)
    this.bornAttr = new THREE.BufferAttribute(this.bornAt, 1)
    g.setAttribute('aBornAt', this.bornAttr)
    this.hiAttr = new THREE.BufferAttribute(this.hi, 1)
    g.setAttribute('aHi', this.hiAttr)
    this.starUniforms = {
      uDay: { value: 0 },
      uTime: { value: 0 },
      uPixelRatio: { value: this.renderer.getPixelRatio() },
      uFocus: { value: -1 },
      uDim: { value: 0 },
      uSizeScale: { value: 1 },
      uBoostProject: { value: -1 },
      uBoost: { value: 0 },
      uWaveT: { value: -1 },
      uRelease: { value: -1 },
      uReleaseProject: { value: -1 }
    }
    this.starMaterial = new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      vertexShader: starVertex,
      fragmentShader: starFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    this.points = new THREE.Points(g, this.starMaterial)
    this.points.frustumCulled = false
    this.world.add(this.points)
  }

  #buildConstellations() {
    const { stars, constellations, projects } = this.data
    const verts: number[] = [],
      births: number[] = [],
      cols: number[] = []
    constellations.forEach((edges, pi) => {
      const c = new THREE.Color(projects[pi].color)
      for (let e = 0; e < edges.length; e += 2) {
        const a = edges[e],
          b = edges[e + 1]
        const born = Math.max(stars.birth[a], stars.birth[b]) + 400
        for (const i of [a, b]) {
          verts.push(stars.pos[i * 3], stars.pos[i * 3 + 1], stars.pos[i * 3 + 2])
          births.push(born)
          cols.push(c.r, c.g, c.b)
        }
      }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    g.setAttribute('aBirth', new THREE.Float32BufferAttribute(births, 1))
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(cols, 3))
    this.lineUniforms = { uDay: { value: 0 }, uOpacity: { value: 0.22 } }
    const m = new THREE.ShaderMaterial({
      uniforms: this.lineUniforms,
      vertexShader: lineVertex,
      fragmentShader: lineFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    this.constellationLines = new THREE.LineSegments(g, m)
    this.world.add(this.constellationLines)
  }

  #buildCollabLines() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 12), 3))
    g.setDrawRange(0, 0)
    this.collabMaterial = new THREE.LineBasicMaterial({
      color: GOLD,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    this.collabLines = new THREE.LineSegments(g, this.collabMaterial)
    this.collabLines.frustumCulled = false
    this.world.add(this.collabLines)
  }

  #buildShockwaves() {
    this.shocks = []
    this.shockGeo = new THREE.PlaneGeometry(1, 1)
  }

  /** stars [from, to) were just born during playback: give them their moment */
  markBorn(from: number, to: number) {
    if (to <= from) return
    for (let i = from; i < to; i++) this.bornAt[i] = this.time
    this.bornAttr.needsUpdate = true
  }
  /** replay the arrival of stars [from, to), staggered over `spread` seconds */
  cascade(from: number, to: number, spread = 2) {
    for (let i = from; i < to; i++) this.bornAt[i] = this.time + Math.random() * spread
    this.bornAttr.needsUpdate = true
  }
  /** after a jump in time, nobody gets a birth flash */
  clearBorn() {
    this.bornAt.fill(-1e4)
    this.bornAttr.needsUpdate = true
  }

  /** an expanding ring of light at a point of the sky (world coords) */
  shockwave(
    x: number,
    y: number,
    color = '#ffffff',
    size = 1,
    { implode = false, dur = 2.6, z = 0 }: ShockOptions = {}
  ) {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uT: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uImplode: { value: implode ? 1 : 0 }
      },
      vertexShader:
        'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uT; uniform vec3 uColor; uniform float uImplode; varying vec2 vUv;
        void main(){ float d = length(vUv - 0.5) * 2.0;
          float a;
          if (uImplode > 0.5) {
            // a ring collapses inward, then a small flash where it lands
            float t = uT * uT * (3.0 - 2.0 * uT);
            float r = 1.0 - t;
            float fade = smoothstep(0.0, 0.25, uT) * (1.0 - smoothstep(0.85, 1.0, uT));
            a = exp(-pow((d - r) * 22.0, 2.0)) * fade * 0.7;
            float flash = smoothstep(0.78, 0.9, uT) * (1.0 - smoothstep(0.9, 1.0, uT));
            a += exp(-d * d * 60.0) * flash * 1.2;
          } else {
            float r = uT;
            a = exp(-pow((d - r) * 18.0, 2.0)) * (1.0 - uT) * 0.9 + exp(-pow((d - r * 0.7) * 40.0, 2.0)) * (1.0 - uT) * 0.35;
            a += exp(-d * d * 30.0) * (1.0 - uT) * (1.0 - uT) * 0.6;
          }
          gl_FragColor = vec4(uColor * a, a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    const mesh = new THREE.Mesh(this.shockGeo, m)
    mesh.position.set(x, y, z + 0.01)
    mesh.scale.setScalar(size)
    this.world.add(mesh)
    mesh.userData.billboard = z !== 0
    this.shocks.push({ mesh, t: 0, dur })
  }

  /** make one constellation flare up for a moment */
  flareProject(pi: number, value = 1) {
    this.boost.project = pi
    this.boost.target = value
    this.starUniforms.uBoostProject.value = pi
  }
  unflare() {
    this.boost.target = 0
  }

  /** a chapter lets go: its stars contract towards their centre and settle back */
  release(project: number, duration = 1.6) {
    this.releaseStart = this.time
    this.releaseDur = duration
    this.starUniforms.uReleaseProject.value = project
  }

  /** finale: a wave of light from the centre outward */
  wave() {
    this.waveStart = this.time
  }

  /** fly the camera to a point of the world (before portrait rotation) */
  flyToPoint(
    x: number,
    y: number,
    dist: number,
    { instant = false, z = 0 }: Instant & { z?: number } = {}
  ) {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(this.world.matrixWorld)
    Object.assign(this.cam, { tx: v.x, ty: v.y, tz: dist, tl: v.z })
    if (instant)
      Object.assign(this.cam, { x: this.cam.tx, y: this.cam.ty, z: this.cam.tz, l: this.cam.tl })
  }

  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
    this.bloom.resolution.set(w, h)
    this.camera.aspect = w / h
    // keep the whole sky in view on narrow screens
    const aspect = w / h
    this.portrait = aspect < 0.85
    this.world.rotation.z = this.portrait ? Math.PI / 2 : 0
    this.world.updateMatrixWorld(true)
    // fit the sky: landscape content is ~3.6 x 2.4 units, portrait the other way round
    const halfW = this.portrait ? 1.2 : 1.75,
      halfH = this.portrait ? 1.75 : 1.2
    const t = Math.tan((this.camera.fov * Math.PI) / 360)
    // fit into the free band between the top bar and the bottom controls
    const ins = this.insets || { top: 0, bottom: 0 }
    const avail = Math.max(0.4, (h - ins.top - ins.bottom) / h)
    this.baseZ = Math.max(halfH / (t * avail), halfW / (t * aspect)) * 0.98
    // move the camera so the sky's centre sits in the middle of that band
    this.homeY = ((ins.top - ins.bottom) / 2) * ((2 * this.baseZ * t) / h)
    if (this.starUniforms) this.starUniforms.uSizeScale.value = Math.sqrt(this.baseZ / 3.0)
    if (this.selected == null && this.focus < 0) {
      this.cam.tz = this.baseZ
      this.cam.ty = this.homeY
    }
    this.camera.updateProjectionMatrix()
  }

  /** screen space taken by UI at the top/bottom (px); the sky fits between */
  setInsets(top: number, bottom: number) {
    this.insets = { top, bottom }
    this.resize()
  }

  /** current (animated) position of star i, matching the shader */
  starPosition(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    const p = this.data.stars.pos
    return out.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2])
  }

  /** nearest visible star to a screen point (CSS px), or -1 */
  pick(x: number, y: number, radius = 14): number {
    const w = this.container.clientWidth,
      h = this.container.clientHeight
    const v = new THREE.Vector3()
    let best = -1,
      bestD = radius * radius
    const s = this.data.stars
    for (let i = 0; i < this.count; i++) {
      if (s.birth[i] > this.day && this.hi[i] < 0.9) continue
      if (this.focus >= 0 && s.project[i] !== this.focus) continue
      this.starPosition(i, v).applyMatrix4(this.world.matrixWorld).project(this.camera)
      const sx = (v.x * 0.5 + 0.5) * w,
        sy = (-v.y * 0.5 + 0.5) * h
      const d = (sx - x) ** 2 + (sy - y) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }

  toScreen(x: number, y: number, z = 0): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(this.world.matrixWorld).project(this.camera)
    return {
      x: (v.x * 0.5 + 0.5) * this.container.clientWidth,
      y: (-v.y * 0.5 + 0.5) * this.container.clientHeight,
      visible: v.z < 1
    }
  }

  select(i: number, collaborators: number[] = []) {
    this.hi.fill(0)
    this.selected = i >= 0 ? i : null
    if (i >= 0) {
      this.hi[i] = 1
      for (const c of collaborators) this.hi[c] = 0.5
    }
    this.hiAttr.needsUpdate = true
    this.collab = i >= 0 ? collaborators : []
    this.collabMaterial.opacity = 0
    this.dim = i >= 0 ? 0.35 : 0
  }

  flyTo(i: number, { instant = false }: Instant = {}) {
    const p = this.starPosition(i)
    const s = this.data.stars
    const target =
      s.birth[i] > this.day
        ? new THREE.Vector3(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2])
        : p
    target.applyMatrix4(this.world.matrixWorld)
    // keep your star right of the story text on wide screens, above it on phones
    const off = this.portrait ? { x: 0, y: -0.18 } : { x: -0.3, y: -0.02 }
    Object.assign(this.cam, { tx: target.x + off.x, ty: target.y + off.y, tz: 0.9, tl: target.z })
    if (instant) Object.assign(this.cam, { x: this.cam.tx, y: this.cam.ty, z: this.cam.tz })
  }

  focusProject(pi: number, { instant = false }: Instant = {}) {
    this.focus = pi
    this.starUniforms.uFocus.value = pi
    if (pi >= 0) {
      const c = this.data.projects[pi].center
      const v = new THREE.Vector3(c[0], c[1], 0).applyMatrix4(this.world.matrixWorld)
      const r = this.data.projects[pi].radius || 0.3
      Object.assign(this.cam, { tx: v.x, ty: v.y, tz: Math.max(0.9, r * 4.2), tl: 0 })
    } else this.home()
    if (instant) Object.assign(this.cam, { x: this.cam.tx, y: this.cam.ty, z: this.cam.tz })
  }

  home({ instant = false }: Instant = {}) {
    Object.assign(this.cam, { tx: 0, ty: this.homeY || 0, tz: this.baseZ, tl: 0 })
    if (instant) Object.assign(this.cam, { x: this.cam.tx, y: this.cam.ty, z: this.cam.tz, l: 0 })
  }

  /** brightness of each project's nebula given the current day */
  #updateGlow() {
    const glow = this.nebula.uniforms.uGlow.value
    if (!this.projectBirths) {
      this.projectBirths = this.data.projects.map(() => [])
      const s = this.data.stars
      for (let i = 0; i < this.count; i++)
        if (s.kind[i] === 0) this.projectBirths[s.project[i]].push(s.birth[i])
      this.projectBirths.forEach((b) => b.sort((a, c) => a - c))
    }
    this.projectBirths.forEach((b, pi) => {
      let lo = 0,
        hi = b.length
      while (lo < hi) {
        const m = (lo + hi) >> 1
        if (b[m] <= this.day) lo = m + 1
        else hi = m
      }
      glow[pi] =
        Math.min(1, Math.sqrt(lo / 300)) + (pi === this.boost.project ? this.boost.value * 1.5 : 0)
    })
  }

  render(dt: number, reducedMotion: boolean) {
    this.time += dt
    const ease = reducedMotion ? 1 : 1 - Math.pow(0.0015, dt)
    const c = this.cam
    c.x += (c.tx - c.x) * ease
    c.y += (c.ty - c.y) * ease
    c.z += (c.tz - c.z) * ease
    c.l += (c.tl - c.l) * ease
    // slow orbit around the point we look at, so the depth of the sky shows
    const o = reducedMotion ? 0 : this.orbit
    const yaw = o * (0.2 * Math.sin(this.time * 0.05) + this.mouse.x * 0.05)
    const pitch = o * (0.1 * Math.sin(this.time * 0.037 + 1) + this.mouse.y * 0.035)
    const d = this.cam.z
    const l = this.cam.l || 0
    this.camera.position.set(
      this.cam.x + d * Math.sin(yaw) * Math.cos(pitch),
      this.cam.y + d * Math.sin(pitch),
      l + d * Math.cos(yaw) * Math.cos(pitch)
    )
    this.camera.lookAt(this.cam.x, this.cam.y, l)

    // effects
    // flare in quickly, fade out slowly into the afterglow
    const k = this.boost.target > this.boost.value ? 0.02 : 0.35
    this.boost.value += (this.boost.target - this.boost.value) * (1 - Math.pow(k, dt))
    if (this.releaseStart != null) {
      const t = (this.time - this.releaseStart) / this.releaseDur
      this.starUniforms.uRelease.value = t < 1 ? t : -1
      if (t >= 1) this.releaseStart = null
    }
    this.starUniforms.uBoost.value = this.boost.value
    this.starUniforms.uWaveT.value =
      this.waveStart == null ? -1 : (this.time - this.waveStart) * 0.75
    if (this.waveStart != null && this.time - this.waveStart > 5) this.waveStart = null
    for (const sh of this.shocks) {
      if (sh.mesh.userData.billboard) {
        // face the camera (in world-group space) so the ring sits exactly around the star
        sh.mesh.quaternion.copy(this.world.quaternion).invert().multiply(this.camera.quaternion)
      }
      sh.t += dt / sh.dur
      sh.mesh.material.uniforms.uT.value = Math.min(1, sh.t)
    }
    this.shocks = this.shocks.filter((sh) => {
      if (sh.t < 1) return true
      this.world.remove(sh.mesh)
      sh.mesh.material.dispose()
      return false
    })

    this.starUniforms.uDay.value = this.day
    this.starUniforms.uTime.value = this.time
    this.starUniforms.uDim.value += (this.dim - this.starUniforms.uDim.value) * ease
    this.lineUniforms.uDay.value = this.day
    this.lineUniforms.uOpacity.value +=
      ((this.focus >= 0 || this.selected != null ? 0.1 : 0.22) - this.lineUniforms.uOpacity.value) *
      ease
    this.nebula.uniforms.uTime.value = this.time
    this.#updateGlow()

    if (this.selected != null && this.collab.length) {
      const attr = this.collabLines.geometry.attributes.position
      const a = this.starPosition(this.selected),
        b = new THREE.Vector3()
      let n = 0
      for (const c of this.collab) {
        if (this.data.stars.birth[c] > this.day || this.data.stars.birth[this.selected] > this.day)
          continue
        this.starPosition(c, b)
        attr.setXYZ(n++, a.x, a.y, a.z)
        attr.setXYZ(n++, b.x, b.y, b.z)
      }
      attr.needsUpdate = true
      this.collabLines.geometry.setDrawRange(0, n)
      this.collabMaterial.opacity += (0.55 - this.collabMaterial.opacity) * ease * 0.5
    } else this.collabLines.geometry.setDrawRange(0, 0)

    this.composer.render()
  }
}
