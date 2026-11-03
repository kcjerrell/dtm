import type { EventTarget } from "@tauri-apps/api/event"

const listeners = new Map<string, Map<number, (payload: unknown) => void>>()
let nextId = 0

export async function listen<T>(
    event: string,
    handler: (event: { event: string; id: number; payload: T }) => void,
) {
    const id = ++nextId
    let group = listeners.get(event)
    if (!group) {
        group = new Map()
        listeners.set(event, group)
    }
    group.set(id, (payload) => handler({ event, id, payload: payload as T }))
    return () => {
        group.delete(id)
        if (group.size === 0 && listeners.get(event) === group) listeners.delete(event)
    }
}

export async function emit(event: string, payload?: unknown) {
    for (const handler of [...(listeners.get(event)?.values() ?? [])]) handler(payload)
}

export async function emitTo(_target: EventTarget | string, event: string, payload?: unknown) {
    await emit(event, payload)
}
