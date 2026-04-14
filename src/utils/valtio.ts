function clear<T>(arr: T[]) {
    return arr.splice(0, arr.length)
}

function remove<T>(arr: T[], item: T) {
    const index = arr.indexOf(item)
    let removed = 0
    if (index > -1) {
        removed = arr.splice(index, 1).length
    }
    return !!removed
}

function set<T>(arr: T[], items: T[]) {
    arr.splice(0, arr.length, ...items)
}

function sum<T>(arr: T[], fn: (item: T) => number) {
    return arr.reduce((acc, item) => acc + fn(item), 0)
}

const va = {
    clear,
    remove,
    set,
    sum,
}

export default va

/**
 * Binds methods of a proxy to the proxy itself, so that methods are still usable
 * from a snapshot. Can be used with class instances
 *
 * @param proxyInstance The object to be bound - should be a proxy already
 */
export function bindProxy<T extends object>(proxyInstance: T): T {
    if (isBindingAware(proxyInstance)) {
        proxyInstance.$isBinding = true
    }
    const proto = Object.getPrototypeOf(proxyInstance)
    const descriptors = Object.getOwnPropertyDescriptors(proto)

    try {
        for (const [key, descriptor] of Object.entries(descriptors)) {
            if (key === "constructor") continue

            // Only bind plain methods (not getters/setters)
            if (typeof descriptor.value === "function") {
                const method = descriptor.value

                ;(proxyInstance as Record<string, unknown>)[key] = (...args: unknown[]) =>
                    method.apply(proxyInstance, args)
            }
        }
    } finally {
        if (isBindingAware(proxyInstance)) {
            proxyInstance.$isBinding = false
        }
    }

    return proxyInstance
}

function isBindingAware<T>(obj: T): obj is { $isBinding: boolean } & T {
    if (obj && typeof obj === "object" && "$isBinding" in obj && obj.$isBinding) {
        return true
    }
    return false
}
