import { listen } from "@tauri-apps/api/event"
import EventEmitter from "eventemitter3"
import {
    type EventMap,
    type IContainer,
    type IStateService, 
    isDisposable
} from "./interfaces"

type FutureServices<T extends Record<string, object> = Record<string, object>> = Partial<{
    [K in keyof T]: PromiseWithResolvers<T[K]>
}>

type TagHandler = (tag: string, data?: Record<string, unknown>) => void

export class Container<
        T extends { [K in keyof T]: IStateService<IContainer<T>> } = object,
        E extends EventMap = EventMap,
    >
    extends EventEmitter<E>
    // extends EventEmitter<{ [K in keyof E]: E[K] }>
    implements IContainer<T, E>
{
    services: T = {} as T
    private futureServices: FutureServices<T> = {}
    private invalidateUnlistenPromise: Promise<() => void>
    private updateUnlistenPromise: Promise<() => void>
    private tagHandlers: Map<string, TagHandler> = new Map()

    constructor(servicesInit: () => T) {
        super()

        buildContainer<Container<T, E>>(this, servicesInit, (name: keyof T, service: T[keyof T]) => {
            this.services[name] = service

            const future = this.futureServices[name]
            if (future) {
                future.resolve(service)
                delete this.futureServices[name]
            }
        })

        this.invalidateUnlistenPromise = listen("invalidate-tags", (event) => {
            // console.debug("invalidate-tags", event)
            const payload = event.payload as { tag: string; desc: string }                                                                                                                                  
            this.handleTags(payload.tag, { desc: payload.desc })
        })
        this.updateUnlistenPromise = listen("update-tags", (event) => {
            // console.debug("update-tags", event)
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

    override emit<EN extends EventEmitter.EventNames<E>>(eventName: EN, ...args: EventEmitter.EventArgs<E, EN>): boolean {
        // console.debug("emit", eventName, args)
        return super.emit(eventName, ...args)
    }

    private _isDisposed = false
    get isDisposed() {
        return this._isDisposed
    }
    dispose() {
        for (const service of Object.values(this.services)) {
            if (isDisposable(service)) {
                service.dispose()
            }
        }
        this.invalidateUnlistenPromise.then((u) => u())
        this.updateUnlistenPromise.then((u) => u())
        this.removeAllListeners()
        this._isDisposed = true
    }
}

const _containerStack: {
    container: IContainer
    register: (name: string, service: object) => void
}[] = []
export function registerContainerService<C extends IContainer>(name: string, service: object) {
    const container = _containerStack.at(-1)
    if (!container) throw new Error("must call register within a container constructor")
    container.register(name, service)
    return container.container as C
}

function buildContainer<C extends Container = Container>(
    container: C,
    servicesInit: () => C["services"],
    register: (name: keyof C["services"], service: C["services"][keyof C["services"]] ) => void,
) {
    _containerStack.push({ container, register })
    const services = servicesInit()
    _containerStack.pop()
    return services
}
