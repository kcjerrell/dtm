import { type Snapshot, useSnapshot } from "valtio"
import { watch } from "valtio/utils"
import { registerContainerService } from "./container"
import type { IContainer, IStateController } from "./interfaces"

export interface ContainerEvent<T extends string, E = undefined> {
    on: (fn: EventHandler<E>) => void
    once: (fn: EventHandler<E>) => void
    off: (fn: EventHandler<E>) => void
}
export type EventHandler<E = undefined> = (e: E) => void

export abstract class StateService<C extends IContainer = IContainer> {
    protected container: C

    constructor(registerName: string) {
        this.container = registerContainerService<C>(registerName, this)
    }

    protected _isDisposed = false
    get isDisposed() {
        return this._isDisposed
    }
    unwatchFns: (() => void)[] = []

    /** prefer this over valtio's watch() - this will track unwatch and call when disposed */
    protected watchProxy(
        watchFn: Parameters<typeof watch>[0],
        options?: Parameters<typeof watch>[1],
    ) {
        const unwatch = watch(watchFn, options)
        this.unwatchFns.push(unwatch)
        return unwatch
    }

    /** must call super.dispose() when overriding! */
    dispose() {
        this.unwatchFns.forEach((unwatch) => {
            unwatch()
        })
        this._isDisposed = true
    }
}

export abstract class StateController<C extends IContainer = IContainer, T extends object = object>
    extends StateService<C>
    implements IStateController<T>
{
    abstract state: T

    /** the tags this controller is interested in. e.g. "project" or "project:34" */
    protected tags?: string[]

    constructor(registerName: string, tagRoot?: string) {
        super(registerName)
        console.log("registering", this.container.addTagHandler)
        if (tagRoot) this.container.addTagHandler(tagRoot, this.handleTags.bind(this))
    }

    /** state controllers can override this to handle their registered tag type */
    protected handleTags(_tags: string, _desc?: Record<string, unknown>) {}

    useSnap(): Snapshot<T> {
        return useSnapshot(this.state)
    }
}
