export async function addNewItem(data: Uint8Array, type: string, source: Record<string, unknown>) {
    const compareStore = await import("./state")
    const store = await compareStore.getCompareStore()
    await store.addNewItem(data, type, source)
}

export async function addMediaItem(id: string) {
    const compareStore = await import("./state")
    const store = await compareStore.getCompareStore()
    await store.addMediaItem(id)
}
