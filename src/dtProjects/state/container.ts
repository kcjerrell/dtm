import { listen } from "@tauri-apps/api/event"
import EventEmitter from "eventemitter3"
import { DTPStateController } from "./StateController"

type FutureServices<T extends object> = Partial<{
    [K in keyof T]: PromiseWithResolvers<T[K]>
}>

type TagHandler = (tag: string, data?: Record<string, unknown>) => void

export class Container<
    T extends object = object,
    E extends object = object,
> extends EventEmitter<E> {
    services: T = {} as T
    private futureServices: FutureServices<T> = {}
    private invalidateUnlistenPromise: Promise<() => void>
    private updateUnlistenPromise: Promise<() => void>
    private tagHandlers: Map<string, TagHandler> = new Map()

    constructor(servicesInit: () => T) {
        super()

        Container.constructorStack.push(this as Container)
        servicesInit()
        Container.constructorStack.pop()

        this.invalidateUnlistenPromise = listen("invalidate-tags", (event) => {
            const payload = event.payload as { tag: string; desc: string }
            this.handleTags(payload.tag, { desc: payload.desc })
        })
        this.updateUnlistenPromise = listen("update-tags", (event) => {
            const payload = event.payload as { tag: string; data: Record<string, unknown> }
            this.handleTags(payload.tag, payload.data)
        })
    }

    getService<K extends keyof T>(name: K): T[K] {
        return this.services[name]
    }

    getFutureService<K extends keyof T>(name: K): Promise<T[K]> {
        const existing = this.services[name]
        if (existing !== undefined) return Promise.resolve(existing)

        let future = this.futureServices[name]
        if (future === undefined) {
            future = Promise.withResolvers<T[K]>()
            this.futureServices[name] = future
        }

        return future.promise
    }

    addTagHandler(tagRoot: string, handler: TagHandler) {
        if (this.tagHandlers.has(tagRoot)) {
            throw new Error(`Tag handler for ${tagRoot} already exists`)
        }
        this.tagHandlers.set(tagRoot, handler)
    }

    async handleTags(tag: string, data?: Record<string, unknown>) {
        const root = tag.split(":")[0]
        const handler = this.tagHandlers.get(root)
        if (handler) {
            handler(tag, data)
        } else {
            console.warn("no handler for tag", tag)
        }
    }

    override emit(...args: Parameters<EventEmitter<E>["emit"]>): boolean {
        console.debug("emit", args)
        return super.emit(...args)
    }

    private _isDisposed = false
    get isDisposed() {
        return this._isDisposed
    }
    dispose() {
        for (const service of Object.values(this.services)) {
            if (service instanceof DTPStateController) {
                service.dispose()
            }
        }
        this.invalidateUnlistenPromise.then((u) => u())
        this.updateUnlistenPromise.then((u) => u())
        this.removeAllListeners()
        this._isDisposed = true
    }

    private static constructorStack: Container[] = []

    static register<T extends object, E extends object>(name: keyof T, service: T[typeof name]) {
        const container = Container.constructorStack.at(-1) as Container<T, E>
        if (!container) throw new Error("must call register within a container constructor")
        container.services[name] = service

        const future = container.futureServices[name]
        if (future) {
            future.resolve(service)
            delete container.futureServices[name]
        }

        return container
    }
}
