import type EventEmitter from "eventemitter3"
import type { Snapshot } from "valtio"
import type { Container } from "./container"

export interface IContainer<T extends object = object, E extends object = object>
    extends EventEmitter {
    //static register<T extends object, E extends object>(name: keyof T, service: T[typeof name]): IContainer<T, E>;
    services: T
    getService<K extends keyof T>(name: K): T[K]
    getFutureService<K extends keyof T>(name: K): Promise<T[K]>
    addTagHandler(tagRoot: string, handler: TagHandler): void
    handleTags(tag: string, data?: Record<string, unknown>): Promise<void>
    get isDisposed(): boolean
    dispose(): void
}

export interface IStateService<C extends IContainer = IContainer> extends IDisposable {

}

/**
 * Abstract base class for controllers using valtio state proxies
 */
export interface IStateController<T extends object = object> extends IStateService<IContainer<T>> {
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
