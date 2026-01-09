import { watch } from "valtio/utils"
import { registerContainerService } from "./container"
import type { IContainer } from "./interfaces"

export abstract class Service<C extends IContainer = IContainer> {
    protected container: C

    constructor(registerName: string) {
        this.container = registerContainerService<C>(registerName, this)
    }

    protected _isDisposed = false
    get isDisposed() {
        return this._isDisposed
    }
    protected unwatchFns: (() => void)[] = []

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
