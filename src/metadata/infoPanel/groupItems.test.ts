import { describe, expect, it } from "vitest"
import { groupItems } from "./groupItems"

describe("groupItems", () => {
    it("keeps a top-level string as one item instead of splitting it into characters", () => {
        const comment = `ASCII\0${"a".repeat(2860)}`

        expect(groupItems({ userComment: comment })).toEqual([
            { name: "userComment", items: [{ key: "userComment", value: comment }] },
        ])
    })

    it("decodes an EXIF ASCII userComment byte array into one item", () => {
        const comment = `A prompt with unicode: 🐈 ${"a".repeat(2800)}`
        const bytes = new TextEncoder().encode(`ASCII\0\0\0${comment}`)

        expect(groupItems({ userComment: bytes })).toEqual([
            { name: "userComment", items: [{ key: "userComment", value: comment }] },
        ])
    })

    it("does not split other byte arrays into indexed cells", () => {
        const bytes = new Uint8Array([1, 2, 3])
        expect(groupItems({ binary: bytes })).toEqual([
            { name: "binary", items: [{ key: "binary", value: bytes }] },
        ])
    })

    it("still splits object groups into their fields", () => {
        expect(groupItems({ ihdr: { ImageWidth: 768, ColorType: "RGB with Alpha" } })).toEqual([
            {
                name: "ihdr",
                items: [
                    { key: "ImageWidth", value: 768 },
                    { key: "ColorType", value: "RGB with Alpha" },
                ],
            },
        ])
    })
})
