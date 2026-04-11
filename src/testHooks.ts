const overrideData: E2ETestOverrides = {}

export function addTestHooks() {
    window.__E2E_TEST_OVERRIDE = (name: string, data: unknown) => {
        console.log("setting override", name, data)
        overrideData[name] = data
    }
    window.__E2E_TEST_OVERRIDE_DATA = overrideData
}

export async function getOverrideOr<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
    if (name in overrideData && overrideData[name]) {
        const data = overrideData[name]
        overrideData[name] = undefined
        return data as T
    }
    return fn() as Promise<T>
}
