import type EventEmitter from "eventemitter3"
import type { Snapshot } from "valtio"
import type { Container } from "./container"

export interface IContainer<
    T extends { [K in keyof T]: IStateService } = object,
    E extends EventMap = EventMap,
> extends EventEmitter<{ [K in keyof E]: E[K] }> {
    //static register<T extends object, E extends object>(name: keyof T, service: T[typeof name]): IContainer<T, E>;
    services: T
    getService<K extends keyof T>(name: K): T[K]
    getFutureService<K extends keyof T>(name: K): Promise<T[K]>
    addTagHandler(tagRoot: string, handler: TagHandler): void
    handleTags(tag: string, data?: Record<string, unknown>): Promise<void>
    suppressTags(tags: string[]): void
    stopSuppressingTags(tags: string[]): void
    get isDisposed(): boolean
    dispose(): void
}

export type TagHandler<D = object> = (tag: string, data?: D) => boolean | Promise<boolean>

export type EventMap = {
    [eventName: string]: ContainerEventHandler
}

export type ContainerEventHandler<P extends object | never = never> = (payload: P) => void

export interface IStateService<C extends IContainer = IContainer> extends IDisposable {}

/**
 * Abstract base class for controllers using valtio state proxies
 */
export interface IStateController<C extends IContainer, T extends object = object>
    extends IStateService<C> {
    /**
     * The state proxy - this must be a valtio proxy object
     */
    state: T

    /**
     * Returns a snapshot of the state.
     * This is a hook and must be called within a React component.
     */
    useSnap(): Snapshot<T>
}

export interface IDisposable {
    get isDisposed(): boolean
    dispose(): void
}

export function isDisposable(obj: unknown): obj is IDisposable {
    return (
        obj !== null &&
        typeof obj === "object" &&
        "dispose" in obj &&
        typeof obj.dispose === "function"
    )
}

export type UnwrapContainer<T> = T extends Container<infer U> ? U : never
