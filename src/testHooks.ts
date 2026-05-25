import { invoke } from "@tauri-apps/api/core"

const overrideData: E2ETestOverrides = {}

export async function getOverrideOr<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
    if (name in overrideData && overrideData[name]) {
        const data = overrideData[name]
        overrideData[name] = undefined
        return data as T
    }
    return fn() as Promise<T>
}

async function reset_db() {
    const { preloadDTP } = await import("./dtProjects/state/context")
    console.log("resetting db")
    // this ensures the db has started
    await preloadDTP()
    await invoke("dtp_reset_db")
}

export function addTestHooks() {
    window.__E2E_TEST_OVERRIDE = (name: string, data: unknown) => {
        console.log("setting override", name, data)
        overrideData[name] = data
    }
    window.__E2E_TEST_OVERRIDE_DATA = overrideData

    window.__reset_metadata_store = async () => {
        const { resetMetadataStore } = await import("./metadata/state/metadataStore")
        resetMetadataStore()
    }

    window.__reset_db = reset_db
}
