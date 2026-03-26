import { MotionValue } from "motion/react"
import type { RefObject } from "react"

export interface IFrameSync {
    play(): void
    pause(): void
    jump(pos: number): void
    get posMv(): MotionValue<number>
    get state(): "playing" | "paused" | "seeking" | null
    seek(pos: number): void
    endSeek(resume?: boolean): void
    dispose(): void
}

type FrameSyncOpts = {
    fps: number
    nFrames: number
    autoStart?: boolean
    onFrameChanged?: (frame: number) => void
    onStateChanged?: (state: "playing" | "paused" | "seeking") => void
}

export class FrameSync implements IFrameSync {
    readonly fps: number
    readonly nFrames: number
    private onFrameChanged?: (frame: number) => void
    private onStateChanged?: (state: "playing" | "paused" | "seeking") => void

    private rafId: number | null = null
    private tOrigin: DOMHighResTimeStamp | null = null
    private frameOffset: number = 0
    private frame: number = 0

    constructor(opts: FrameSyncOpts) {
        this.fps = opts.fps
        this.nFrames = opts.nFrames
        this.onFrameChanged = opts.onFrameChanged
        this.onStateChanged = opts.onStateChanged

        this.state = opts.autoStart ? "playing" : "paused"

        this.startLoop()
    }

    private startLoop() {
        if (this.rafId) return
        this.rafId = requestAnimationFrame((t) => this.tick(t))
    }

    private tick(t: DOMHighResTimeStamp) {
        if (this.state === "playing") {
            if (this.tOrigin === null) this.tOrigin = t
            const elapsed = t - this.tOrigin
            const frame =
                (Math.floor((elapsed / 1000) * this.fps) + this.frameOffset) % this.nFrames
            this.setFrame(frame)
        } else if (this.state === "seeking") {
            this.setFrame(this.frameOffset)
        } else {
            this.tOrigin = null
        }

        this.rafId = requestAnimationFrame((t) => this.tick(t))
    }

    private setFrame(frame: number) {
        if (this.frame === frame) return
        this.frame = frame
        this.onFrameChanged?.(frame)
        this._posMv.set(frame / (this.nFrames - 1))
    }

    play(): void {
        this.state = "playing"
    }

    pause(): void {
        this.state = "paused"
    }

    jump(pos: number): void {
        this.frameOffset = Math.floor(pos * (this.nFrames - 1))
        // this.setFrame(this.frameOffset)
    }

    _posMv = new MotionValue(0)
    get posMv(): MotionValue<number> {
        return this._posMv
    }

    _state: "playing" | "paused" | "seeking" | null = null
    get state(): "playing" | "paused" | "seeking" | null {
        return this._state
    }
    private set state(state: "playing" | "paused" | "seeking" | null) {
        if (this._state === state) return
        this._state = state
        if (state) this.onStateChanged?.(state)
    }

    seek(pos: number): void {
        this.state = "seeking"
        this.frameOffset = Math.floor(pos * (this.nFrames - 1))
        // this.setFrame(this.frameOffset)
    }

    endSeek(resume?: boolean): void {
        this.state = resume ? "playing" : "paused"
    }

    dispose(): void {
        this.onFrameChanged = undefined
        this.onStateChanged = undefined
        if (this.rafId) cancelAnimationFrame(this.rafId)
        this._posMv.destroy()
    }
}

interface AudioFrameSyncOptions extends FrameSyncOpts {
    audio: RefObject<HTMLAudioElement | null>
}

export class AudioFrameSync implements IFrameSync {
    readonly fps: number
    readonly nFrames: number
    private onFrameChanged?: (frame: number) => void
    private onStateChanged?: (state: "playing" | "paused" | "seeking") => void

    private rafId: number | null = null
    private frame: number = 0

    private audio: RefObject<HTMLAudioElement | null>

    constructor(opts: AudioFrameSyncOptions) {
        this.fps = opts.fps
        this.nFrames = opts.nFrames
        this.onFrameChanged = opts.onFrameChanged
        this.onStateChanged = opts.onStateChanged

        this.audio = opts.audio
        this.state = opts.autoStart ? "playing" : "paused"
        this.startLoop()
    }

    private startLoop() {
        if (this.rafId) return
        this.rafId = requestAnimationFrame((t) => this.tick(t))
    }

    private tick(_t: DOMHighResTimeStamp) {
        const audio = this.audio.current
        if (audio) {
            const pos = audio.currentTime / audio.duration
            const frame = Math.floor(pos * (this.nFrames - 1))
            this.setFrame(frame)
        }

        this.rafId = requestAnimationFrame((t) => this.tick(t))
    }

    private setFrame(frame: number) {
        if (this.frame === frame) return
        this.frame = frame
        this.onFrameChanged?.(frame)
        this._posMv.set(frame / (this.nFrames - 1))
    }

    play(): void {
        this.state = "playing"
        this.audio.current?.play()
    }

    pause(): void {
        this.state = "paused"
        this.audio.current?.pause()
    }

    jump(pos: number): void {
        if (!this.audio.current) return
        this.audio.current.currentTime = pos * this.audio.current.duration
        // this.state = "seeking"
    }

    _posMv = new MotionValue(0)
    get posMv(): MotionValue<number> {
        return this._posMv
    }

    _state: "playing" | "paused" | "seeking" | null = null
    get state(): "playing" | "paused" | "seeking" | null {
        return this._state
    }
    private set state(state: "playing" | "paused" | "seeking" | null) {
        if (this._state === state) return
        if (state === "playing") this.audio.current?.play()
        else this.audio.current?.pause()
        this._state = state
        if (state) this.onStateChanged?.(state)
    }

    seek(pos: number): void {
        if (!this.audio.current) return
        this.audio.current.pause()
        this.audio.current.currentTime = pos * this.audio.current.duration
        this.state = "seeking"
    }

    endSeek(resume?: boolean): void {
        if (resume) this.play()
        else this.pause()
    }

    dispose(): void {
        this.onFrameChanged = undefined
        this.onStateChanged = undefined
        if (this.rafId) cancelAnimationFrame(this.rafId)
        this._posMv.destroy()
    }
}
