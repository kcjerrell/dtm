import { type Snapshot, useSnapshot } from "valtio"
import type { IContainer, IStateController } from "./interfaces"
import { Service } from "./Service"

export interface ContainerEvent<T extends string, E = undefined> {
    on: (fn: EventHandler<E>) => void
    once: (fn: EventHandler<E>) => void
    off: (fn: EventHandler<E>) => void
}
export type EventHandler<E = undefined> = (e: E) => void

export abstract class StateController<
        C extends IContainer = IContainer,
        T extends { [K in keyof T]: unknown } = object,
    >
    extends Service<C>
    implements IStateController<C, T>
{
    abstract state: T

    constructor(registerName: string) {
        super(registerName)
    }

    useSnap(): Snapshot<T> {
        return useSnapshot(this.state)
    }
}
