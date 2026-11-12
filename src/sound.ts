// Sound follows what you see, not the clock (off by default):
//  - a soft pad that grows fuller and brighter as the sky fills, and ducks while scrubbing
//  - sparkles synced to the visible birth rings (incl. the cascade)
//  - every chapter is a phrase: a chord in the project's key swells in, and when the
//    ring collapses a reversed swell pulls inward and lands on a bell
//  - the finale resolves the progression as the wave crosses the sky
const A3 = 220
const PENTA = [0, 2, 4, 7, 9]
// each constellation has its own key (semitones from A)
const KEYS: number[] = [0, 7, 5, 3, 10, 2, 8, -2]
const hz = (semi: number): number => A3 * Math.pow(2, semi / 12)
// the pad wanders through a gentle progression instead of holding one chord:
// I – vi – IV – V – iii – IV – ii – V  (voicings kept close for smooth glides)
const PROGRESSION: number[][] = [
  [0, 7, 12, 16],
  [-3, 4, 9, 12],
  [-7, 5, 9, 12],
  [-5, 2, 7, 11],
  [-8, 4, 7, 11],
  [-7, 0, 5, 9],
  [-10, 2, 5, 9],
  [-5, 2, 7, 11]
]

interface PadVoice {
  o: OscillatorNode
}
type PadMode = 'off' | 'duck' | 'on'
interface VoiceOptions {
  freq: number
  type?: OscillatorType
  attack?: number
  decay?: number
  peak?: number
  when?: number
  out?: AudioNode
}

export class Sound {
  on = false
  budget = 0
  key = 0
  fullness = 0
  scrubbing = false
  mode: PadMode | null = null
  chord = 0
  chordIn = 7
  rest = 0
  // audio graph, created on first enable (needs a user gesture)
  ctx: AudioContext | null = null
  master!: GainNode
  reverb!: ConvolverNode
  wet!: GainNode
  dry!: GainNode
  bus!: GainNode
  padFilter!: BiquadFilterNode
  padGain!: GainNode
  pad: PadVoice[] = []

  /** the audio context, only valid while sound is on */
  get ac(): AudioContext {
    if (!this.ctx) throw new Error('sound not initialised')
    return this.ctx
  }

  #init() {
    const ctx = (this.ctx = new AudioContext())
    this.master = ctx.createGain()
    this.master.gain.value = 0
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 3
    this.master.connect(comp).connect(ctx.destination)

    // generated reverb: decaying noise impulse
    this.reverb = ctx.createConvolver()
    const len = ctx.sampleRate * 3.2
    const ir = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
    }
    this.reverb.buffer = ir
    this.wet = ctx.createGain()
    this.wet.gain.value = 0.55
    this.dry = ctx.createGain()
    this.dry.gain.value = 0.8
    this.bus = ctx.createGain()
    this.bus.connect(this.dry).connect(this.master)
    this.bus.connect(this.reverb).connect(this.wet).connect(this.master)

    // pad: detuned oscillators through a lowpass filter
    this.padFilter = ctx.createBiquadFilter()
    this.padFilter.type = 'lowpass'
    this.padFilter.frequency.value = 300
    this.padFilter.Q.value = 0.6
    this.padGain = ctx.createGain()
    this.padGain.gain.value = 0
    this.padFilter.connect(this.padGain).connect(this.bus)
    // soft voices (no sawtooth buzz); each one breathes on its own slow cycle
    this.pad = PROGRESSION[0].map((semi, k) => {
      const o = ctx.createOscillator()
      o.type = k === 0 ? 'triangle' : 'sine'
      o.frequency.value = hz(semi - 12)
      o.detune.value = (k - 1.5) * 4
      const g = ctx.createGain()
      g.gain.value = k === 0 ? 0.34 : 0.2
      const breath = ctx.createOscillator()
      breath.frequency.value = 0.045 + k * 0.023
      const depth = ctx.createGain()
      depth.gain.value = k === 0 ? 0.08 : 0.12
      breath.connect(depth).connect(g.gain)
      breath.start()
      o.connect(g).connect(this.padFilter)
      o.start()
      return { o }
    })
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.05
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 90
    lfo.connect(lfoGain).connect(this.padFilter.frequency)
    lfo.start()
    this.chord = 0
    this.chordIn = 7
    this.rest = 0
  }

  enable() {
    if (!this.ctx) this.#init()
    void this.ac.resume()
    this.on = true
    this.master.gain.setTargetAtTime(0.9, this.ac.currentTime, 0.4)
  }

  disable() {
    this.on = false
    if (!this.ctx) return
    this.master.gain.setTargetAtTime(0, this.ac.currentTime, 0.15)
    setTimeout(() => {
      if (!this.on) void this.ctx?.suspend()
    }, 600)
  }

  /** called every frame */
  update(
    dt: number,
    { fullness, scrubbing, playing }: { fullness: number; scrubbing: boolean; playing: boolean }
  ) {
    this.budget = Math.min(5, this.budget + dt * 14)
    if (!this.on) return
    const t = this.ac.currentTime
    // the pad only lives while the story moves; paused, finished or reading a story = silence
    const mode = !playing ? 'off' : scrubbing ? 'duck' : 'on'
    // move to the next chord every 6–9 s; every fourth chord the pad steps back for a while
    let changed = false
    if (mode === 'on') {
      this.chordIn -= dt
      if (this.chordIn <= 0) {
        this.chord = (this.chord + 1) % PROGRESSION.length
        this.chordIn = 6 + Math.random() * 3
        this.rest = this.chord % 4 === 3 ? 1 : 0
        this.#glide(1.6)
        changed = true
      }
    }
    if (changed || Math.abs(fullness - this.fullness) > 0.01 || mode !== this.mode) {
      this.fullness = fullness
      const f = Math.sqrt(fullness)
      this.padFilter.frequency.setTargetAtTime(240 + 900 * f, t, 1.2)
      const level = (0.028 + 0.042 * f) * (this.rest ? 0.35 : 1)
      const target = mode === 'off' ? 0 : mode === 'duck' ? 0.01 : level
      const tau = mode === 'off' ? 1.4 : mode === 'duck' ? 0.08 : 0.9 // ~4 s fade to silence
      this.padGain.gain.setTargetAtTime(target, t, tau)
      this.mode = mode
    }
  }

  /** glide the pad into the key of a constellation */
  setKey(project: number) {
    if (!this.on || project < 0) return
    this.key = KEYS[project] ?? 0
    this.#glide(0.7)
  }

  #glide(tau: number) {
    const t = this.ac.currentTime
    const chord = PROGRESSION[this.chord]
    this.pad.forEach((p, k) => p.o.frequency.setTargetAtTime(hz(this.key + chord[k] - 12), t, tau))
  }

  #voice({
    freq,
    type = 'sine',
    attack = 0.005,
    decay = 1.2,
    peak = 0.2,
    when = 0,
    out = this.bus
  }: VoiceOptions) {
    const t = this.ac.currentTime + when
    const o = this.ac.createOscillator()
    o.type = type
    o.frequency.value = freq
    const g = this.ac.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + attack + decay + 0.1)
  }

  /** a star lit up (matches the visible birth ring) */
  sparkle(project: number, weight = 1, when = 0) {
    if (!this.on || this.budget < 1) return
    this.budget -= 1
    const key = KEYS[project] ?? 0
    const deg = PENTA[Math.floor(Math.random() * PENTA.length)]
    const big = weight > 9
    const oct = big ? 12 : 24 + (Math.random() < 0.3 ? 12 : 0)
    const f = hz(key + deg + oct)
    const peak = Math.min(0.16, 0.035 + weight * 0.008)
    this.#voice({ freq: f, type: 'sine', decay: big ? 2.2 : 0.9, peak, when })
    this.#voice({ freq: f * 2.0, type: 'triangle', decay: 0.4, peak: peak * 0.25, when })
  }

  /** many arrivals at once, spread over `spread` seconds */
  cascade(project: number, count: number, spread: number) {
    if (!this.on) return
    const n = Math.min(36, count)
    for (let k = 0; k < n; k++) {
      this.budget = 5
      this.sparkle(project < 0 ? k % 8 : project, 2 + Math.random() * 6, Math.random() * spread)
    }
  }

  /** a chapter begins: a chord in the constellation's key swells in */
  chapterStart(project: number, { gold = false }: { gold?: boolean } = {}) {
    if (!this.on) return
    this.setKey(Math.max(0, project))
    const key = KEYS[Math.max(0, project)] ?? 0
    const chord = gold ? [0, 4, 7, 11, 14] : [0, 7, 12, 16, 19]
    chord.forEach((semi, k) => {
      this.#voice({
        freq: hz(key + semi - 12),
        type: k < 2 ? 'triangle' : 'sine',
        attack: 0.9 + k * 0.12,
        decay: 4.2,
        peak: 0.07 - k * 0.008
      })
    })
    // shimmer on top
    for (let k = 0; k < 5; k++)
      this.#voice({ freq: hz(key + PENTA[k] + 24), decay: 1.4, peak: 0.035, when: 0.35 + k * 0.16 })
  }

  /** the ring collapses: a reversed swell pulling inward, landing on a bell */
  chapterRelease(land = 1.2) {
    if (!this.on) return
    const ctx = this.ac,
      t = ctx.currentTime
    // filtered noise, swelling and closing in
    const len = Math.ceil(ctx.sampleRate * (land + 0.2))
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 2.5
    bp.frequency.setValueAtTime(3200, t)
    bp.frequency.exponentialRampToValueAtTime(380, t + land)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.09, t + land * 0.92)
    g.gain.exponentialRampToValueAtTime(0.0001, t + land + 0.05)
    src.connect(bp).connect(g).connect(this.bus)
    src.start(t)
    src.stop(t + land + 0.2)
    // the bell where it lands (inharmonic partials)
    const f = hz(this.key + 12)
    ;[
      [1, 0.12, 3.2],
      [2.76, 0.05, 2.2],
      [5.4, 0.025, 1.4]
    ].forEach(([m, p, dec]) => this.#voice({ freq: f * m, decay: dec, peak: p, when: land }))
  }

  /** the finale: the progression resolves as the wave crosses the sky */
  finale() {
    if (!this.on) return
    this.setKey(0)
    const chords = [
      [5, 9, 12, 16],
      [7, 11, 14, 19],
      [0, 4, 7, 12, 16, 19]
    ]
    chords.forEach((ch, k) =>
      ch.forEach((semi, j) =>
        this.#voice({
          freq: hz(semi - 12),
          type: j === 0 ? 'triangle' : 'sine',
          attack: 0.5,
          decay: k === 2 ? 6 : 1.6,
          peak: 0.06,
          when: k * 1.1 + j * 0.04
        })
      )
    )
    for (let k = 0; k < 8; k++)
      this.#voice({
        freq: hz(PENTA[k % 5] + 24 + (k > 4 ? 12 : 0)),
        decay: 1.6,
        peak: 0.03,
        when: 2.2 + k * 0.12
      })
  }
}
