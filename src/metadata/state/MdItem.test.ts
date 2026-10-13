import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MediaState } from "@/state/mediaStore/types"

const settings = vi.hoisted(() => ({
    clearHistoryOnExit: false,
    clearPinsOnExit: false,
}))
vi.mock("@/state/settings", () => ({
    getSetting: (key: string) =>
        key === "metadata.clearHistoryOnExit"
            ? settings.clearHistoryOnExit
            : settings.clearPinsOnExit,
}))

import { MdImage } from "./MdImage"

const media: MediaState = {
    id: "image",
    type: "png",
    url: "",
    thumbUrl: "",
    source: {},
    storage: { kind: "app", fname: "image.png" },
    createdAt: 0,
}

beforeEach(() => {
    settings.clearHistoryOnExit = false
    settings.clearPinsOnExit = false
})

describe("metadata exit policy", () => {
    it("evaluates current settings and pin state when exiting", () => {
        const state = { pin: null as number | null }
        const item = new MdImage(media, state)

        expect(item.clearOnExit).toBe(false)
        settings.clearHistoryOnExit = true
        expect(item.clearOnExit).toBe(true)
        state.pin = 1
        expect(item.clearOnExit).toBe(false)
        settings.clearPinsOnExit = true
        expect(item.clearOnExit).toBe(true)
        settings.clearHistoryOnExit = false
        expect(item.clearOnExit).toBe(false)
    })
})
