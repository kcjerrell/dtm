// @vitest-environment jsdom

import { ChakraProvider, defaultSystem } from "@chakra-ui/react"
import { act, cleanup, render, renderHook, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import AltMode from "./AltMode"
import { ImageCompareContext } from "./state"

afterEach(cleanup)

it("alternates the overlay and indicator only while both images are selected", async () => {
    const { result } = renderHook(() => ImageCompareContext.useCreateState())
    const [Provider, state] = result.current
    state.mode = "alt"
    const { container } = render(
        <ChakraProvider value={defaultSystem}>
            <Provider>
                <AltMode.View />
                <AltMode.Settings />
            </Provider>
        </ChakraProvider>,
    )
    const overlay = () => container.querySelector("#img-b-alt")?.parentElement
    const hasBlink = (element: HTMLElement | null | undefined) =>
        element?.classList.contains("blink-anim")
    const select = async (a?: string, b?: string) => {
        await act(async () => {
            state.imageASrc = a
            state.imageBSrc = b
        })
    }

    expect(overlay()).toBeUndefined()
    expect(screen.queryByText("B")).toBeNull()

    await select("a.png", "b.png")
    expect(hasBlink(overlay())).toBe(true)
    expect(hasBlink(screen.getByText("B"))).toBe(true)

    await select(undefined, "b.png")
    expect(overlay()?.style.display).toBe("block")
    expect(hasBlink(overlay())).toBe(false)
    expect(hasBlink(screen.getByText("B"))).toBe(false)

    await select("a.png", "b.png")
    expect(hasBlink(overlay())).toBe(true)
    expect(hasBlink(screen.getByText("B"))).toBe(true)

    await select("a.png")
    expect(overlay()).toBeUndefined()
    expect(screen.queryByText("B")).toBeNull()
})
