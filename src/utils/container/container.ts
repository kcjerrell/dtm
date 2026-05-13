import type { Channel } from "@tauri-apps/api/core"
import EventEmitter from "eventemitter3"
import { type EventMap, type IContainer, type IStateService, isDisposable } from "./interfaces"

type FutureServices<T extends Record<string, object> = Record<string, object>> = Partial<{
    [K in keyof T]: PromiseWithResolvers<T[K]>
}>

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
    private channel?: Channel<{ type: string; data: unknown }>

    constructor(channel: Channel<{ type: string; data: unknown }>, servicesInit: () => T) {
        super()

        buildContainer<Container<T, E>>(
            this,
            servicesInit,
            (name: keyof T, service: T[keyof T]) => {
                this.services[name] = service

                const future = this.futureServices[name]
                if (future) {
                    future.resolve(service)
                    delete this.futureServices[name]
                }
            },
        )

        this.channel = channel
        this.channel.onmessage = (event) => {
            const eventType = event.type as EventEmitter.EventNames<E>
            const data = [event.data] as EventEmitter.EventArgs<E, typeof eventType>
            this.emit(eventType, ...data)
        }
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

    override emit<EN extends EventEmitter.EventNames<E>>(
        eventName: EN,
        ...args: EventEmitter.EventArgs<E, EN>
    ): boolean {
        console.debug("emit", eventName, args)
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
        this.removeAllListeners()
        this._isDisposed = true
    }
}

const _containerStack: {
    container: IContainer<any, any>
    register: (name: any, service: any) => void
}[] = []
export function registerContainerService<C extends IContainer>(name: string, service: object) {
    const container = _containerStack.at(-1)
    if (!container) throw new Error("must call register within a container constructor")
    container.register(name, service)
    return container.container as C
}

function buildContainer<C extends Container<any, any>>(
    container: C,
    servicesInit: () => C["services"],
    register: (name: any, service: any) => void,
) {
    _containerStack.push({ container, register })
    const services = servicesInit()
    _containerStack.pop()
    return services
}
