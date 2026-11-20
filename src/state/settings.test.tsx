// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { proxy } from "valtio"
import { beforeEach, expect, it, vi } from "vitest"

const savedSettings = vi.hoisted(() => ({ state: {} as Record<string, unknown> }))

vi.mock("@tauri-store/valtio", () => ({
    store: (_name: string, defaults: Record<string, unknown>) => {
        const state = proxy(defaults)
        return {
            state,
            start: async () => {
                Object.assign(state, savedSettings.state)
            },
        }
    },
}))

beforeEach(() => {
    vi.resetModules()
    savedSettings.state = {}
})

it("loads saved flags and adds or removes flags without duplicates", async () => {
    savedSettings.state = { "app.flags": ["mediastore_migration"] }
    const { getFlag, getSetting, loadSettingsStore, updateFlag } = await import("./settings")
    await loadSettingsStore()

    expect(getFlag("mediastore_migration")).toBe(true)
    expect(getFlag("notify_pinch_zoom")).toBe(false)
    updateFlag("notify_pinch_zoom")
    updateFlag("notify_pinch_zoom")
    expect(getSetting("app.flags")).toEqual(["mediastore_migration", "notify_pinch_zoom"])
    updateFlag("mediastore_migration", false)
    expect(getSetting("app.flags")).toEqual(["notify_pinch_zoom"])
})

it("reacts to the selected flag and follows changes to the flag name", async () => {
    const { getFlag, loadSettingsStore, updateFlag, updateSetting, useFlag } = await import(
        "./settings"
    )
    await loadSettingsStore()

    const { result, rerender } = renderHook(useFlag, { initialProps: "notify_pinch_zoom" })
    expect(result.current[0]).toBe(false)

    await act(async () => updateFlag("unrelated"))
    expect(result.current[0]).toBe(false)

    await act(async () => updateSetting("app.flags", ["notify_pinch_zoom"]))
    expect(result.current[0]).toBe(true)

    rerender("another_tip")
    expect(result.current[0]).toBe(false)
    await act(async () => result.current[1]())
    expect(result.current[0]).toBe(true)
    expect(getFlag("another_tip")).toBe(true)

    await act(async () => result.current[1](false))
    expect(result.current[0]).toBe(false)
    expect(getFlag("another_tip")).toBe(false)
    expect(getFlag("notify_pinch_zoom")).toBe(true)
})
