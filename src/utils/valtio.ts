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
    const props = Object.getOwnPropertyNames(Object.getPrototypeOf(proxyInstance))

    for (const prop of props) {
        const method = proxyInstance[prop as keyof T]
        if (prop === "constructor" || typeof method !== "function") continue
        ;(proxyInstance as Record<string, unknown>)[prop] = (...args: unknown[]) =>
            method.apply(proxyInstance, args)
    }

    return proxyInstance
}
