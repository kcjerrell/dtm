import { toaster } from "@/components/ui/toaster"
import AppStore from "@/hooks/appState"

export async function addNewItem(data: Uint8Array, type: string, source: Record<string, unknown>) {
    const compareStore = await import("./state")
    const store = await compareStore.getCompareStore()
    await store.addNewItem(data, type, source)
    notifyCompareActivity()
}

export async function addMediaItem(id: string) {
    const compareStore = await import("./state")
    const store = await compareStore.getCompareStore()
    await store.addMediaItem(id)
    notifyCompareActivity()
}

function notifyCompareActivity() {
    toaster.create({ title: "Image sent to Compare" })
    AppStore.store.sidebarActivity.compare = true
}
