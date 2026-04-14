import { store } from "@tauri-store/valtio"
import { type RefObject, useCallback, useRef } from "react"
import { useSnapshot } from "valtio"
import { getStoreName } from "@/utils/helpers"

let settingStore: ReturnType<typeof initStore> | undefined
const subscriptions = new Map<SettingsKey, Set<(value: Settings[SettingsKey]) => void>>()

const defaultSettings = {
    "vidExport.framesFilenamePattern": "clip_%%%_frame_###",
    "vidExport.framesOutputDir": "",
    "vidExport.framesSource": "preview",
    "vidExport.videoSource": "preview",
    "ui.imageSize": 200,
    "ui.defaultMute": true,
    "app.currentView": "metadata",
    "app.isSidebarVisible": true,
    "metadata.clearHistoryOnExit": true,
    "metadata.clearPinsOnExit": false,
}
type Settings = typeof defaultSettings
type SettingsKey = keyof Settings

function initStore() {
    const storeInstance = store(
        getStoreName("settings"),
        {
            ...defaultSettings,
        },
        {
            autoStart: true,
            saveOnChange: true,
            saveStrategy: "immediate",
            syncStrategy: "immediate",
        },
    )

    for (const key in defaultSettings) {
        if (key in storeInstance.state) continue
        update(storeInstance.state, key as SettingsKey, defaultSettings[key as keyof Settings])
    }

    return storeInstance
}

export async function loadSettingsStore() {
    const store = getSettingStore()
    await store.start()
}

function getSettingStore() {
    if (!settingStore) {
        settingStore = initStore()
    }
    return settingStore
}

// this is to help with type issues, specifically in the initializer
function update<K extends SettingsKey, V extends Settings[K]>(state: Settings, key: K, value: V) {
    state[key] = value
}

/** update a setting by key */
export function updateSetting<K extends SettingsKey, V extends Settings[K]>(key: K, value: V) {
    update(getSettingStore().state, key, value)
}

/** get a setting by key */
export function getSetting<K extends SettingsKey>(key: K) {
    return getSettingStore().state[key]
}

export function subscribeSetting<K extends SettingsKey>(
    key: K,
    callback: (value: Settings[K]) => void,
) {
    if (!subscriptions.has(key)) {
        subscriptions.set(key, new Set())
    }
    const callbacks = subscriptions.get(key) as Set<(value: Settings[K]) => void>
    callbacks.add(callback)
    return () => {
        callbacks.delete(callback)
    }
}

/**
 * Hook to use an app-wide setting. Mirrors the useState() api
 * @param key The setting key
 * @returns A tuple of [value, setValue]
 */
export function useSetting<K extends SettingsKey>(
    key: K,
): [Settings[K], (value: Settings[K] | ((prevState: Settings[K]) => Settings[K])) => void] {
    const store = getSettingStore()
    const snap = useSnapshot(store.state)

    const updateSetting = useCallback(
        (value: Settings[K] | ((prevState: Settings[K]) => Settings[K])) => {
            const newValue = typeof value === "function" ? value(store.state[key]) : value
            update(store.state, key, newValue)
        },
        [key, store],
    )

    return [snap[key], updateSetting] as const
}

/**
 * Hook to use an app-wide setting in a non-reactive context. Mirrors the useRef() api
 * @param key The setting key
 * @returns A ref to the setting value
 */
export function useSettingRef<K extends SettingsKey>(key: K): RefObject<Settings[K]> {
    const store = getSettingStore()

    const ref = useRef<RefObject<Settings[K]>>(null)

    if (ref.current === null) {
        ref.current = {
            get current() {
                return store.state[key]
            },
            set current(value: Settings[K]) {
                update(store.state, key, value)
            },
        }
    }

    return ref.current
}
