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

    /** the tags this controller is interested in. e.g. "project" or "project:34" */
    protected tags?: string[]

    constructor(registerName: string, tagRoot?: string) {
        super(registerName)
        if (tagRoot) this.container.addTagHandler(tagRoot, this.handleTags.bind(this), this.formatTags.bind(this))
    }

    /** state controllers can override this to handle their registered tag type */
    protected handleTags(_tags: string, _desc?: object): boolean | Promise<boolean> {
        return false
    }

    protected formatTags(tags: string, data?: object): string {
        if (data && "desc" in data) {
            return `invalidate tag: ${tags} - ${data.desc}`
        }
        return `update tag: ${tags} ${String(data)}`
    }

    useSnap(): Snapshot<T> {
        return useSnapshot(this.state)
    }
}
