// @vitest-environment jsdom
import { ChakraProvider, defaultSystem } from "@chakra-ui/react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, expect, it, vi } from "vitest"
import type { SelectedInput } from "../contracts"
import { GeneratedControls } from "./GeneratedControls"
import { deferred, harness } from "./testHelpers"

beforeAll(() => {
    window.matchMedia ??= (query) =>
        ({
            matches: false,
            media: query,
            addEventListener() {},
            removeEventListener() {},
        }) as unknown as MediaQueryList
    globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
    window.requestAnimationFrame ??= (callback) => window.setTimeout(() => callback(0), 0)
    window.cancelAnimationFrame ??= (id) => window.clearTimeout(id)
    Element.prototype.scrollIntoView ??= () => {}
})
afterEach(cleanup)

it("renders named controls and supports text, checkbox, numeric and slider keyboard editing", async () => {
    const h = harness(`
 const strength = dtm.param(2, { id: "strength", label: "Strength", min: 0, max: 10 })
 const count = dtm.param(1, { id: "count", label: "Count" })
 const enabled = dtm.param(true, { id: "enabled", label: "Enabled" })
 const caption = dtm.param("Hello", { id: "caption", label: "Caption" })
 const photo = await dtm.input({ id: "photo", label: "Photo" })
`)
    await h.controller.analyze()
    render(
        <ChakraProvider value={defaultSystem}>
            <GeneratedControls controller={h.controller} />
        </ChakraProvider>,
    )
    expect(screen.getByRole("region", { name: "Script controls" })).toBeTruthy()
    const text = screen.getByRole("textbox", { name: "Caption" })
    fireEvent.change(text, { target: { value: "Updated" } })
    await waitFor(() => expect(h.controller.runtimeSnapshot().values.caption.value).toBe("Updated"))
    const checkbox = screen.getByRole("checkbox", { name: "Enabled" })
    // A focused native checkbox's Space activation generates a click in browsers.
    checkbox.focus()
    fireEvent.click(checkbox)
    await waitFor(() => expect(h.controller.runtimeSnapshot().values.enabled.value).toBe(false))
    const number = screen.getByRole("spinbutton", { name: "Count" })
    fireEvent.focus(number)
    fireEvent.input(number, { target: { value: "5" } })
    await waitFor(() => expect(h.controller.runtimeSnapshot().values.count.value).toBe(5))
    fireEvent.keyDown(number, { key: "ArrowUp" })
    await waitFor(() => expect(h.controller.runtimeSnapshot().values.count.value).toBe(6))
    const slider = screen.getByRole("slider", { name: "Strength" })
    slider.focus()
    fireEvent.keyDown(slider, { key: "ArrowRight" })
    fireEvent.keyUp(slider, { key: "ArrowRight" })
    await waitFor(() => expect(h.controller.runtimeSnapshot().values.strength.value).toBe(3))
    fireEvent.keyDown(slider, { key: "End" })
    fireEvent.keyUp(slider, { key: "End" })
    await waitFor(() => expect(h.controller.runtimeSnapshot().values.strength.value).toBe(10))
    fireEvent.click(screen.getByRole("button", { name: "Reset Caption" }))
    await waitFor(() => expect((text as HTMLInputElement).value).toBe("Hello"))
    expect(
        (screen.getByRole("button", { name: "Choose image for Photo" }) as HTMLButtonElement)
            .disabled,
    ).toBe(true)
    expect(h.project.revision).toBe(0)
    h.dispose()
})

it("announces validation/clamping and retains controls with no stale hints while source is invalid", async () => {
    const h = harness('const count = dtm.param(8, { id: "count", label: "Count" })')
    await h.controller.analyze()
    render(
        <ChakraProvider value={defaultSystem}>
            <GeneratedControls controller={h.controller} />
        </ChakraProvider>,
    )
    await act(async () => {
        await h.update('const count = dtm.param(8, { id: "count", label: "Count", max: 4 })')
    })
    expect(screen.getByRole("status").textContent).toContain("Adjusted from 8 to 4")
    const number = screen.getByRole("spinbutton", { name: "Count" })
    fireEvent.focus(number)
    fireEvent.input(number, { target: { value: "" } })
    await waitFor(() =>
        expect(screen.getByRole("alert").textContent).toContain("Enter a finite number"),
    )
    expect(number.getAttribute("aria-invalid")).toBe("true")
    expect(number.getAttribute("aria-describedby")).toBeTruthy()
    expect(h.controller.runtimeSnapshot().values.count.value).toBe(4)
    fireEvent.click(screen.getByRole("button", { name: "Reset Count" }))
    await act(async () => {
        h.project.model.setValue("createImageProcess(")
        await h.controller.analyze()
    })
    expect(screen.getByRole("spinbutton", { name: "Count" })).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toContain("last valid controls")
    expect(h.controller.getHints()).toEqual([])
    h.dispose()
})

it("selects images through a named button and shows pending, filename and reset state", async () => {
    const pending = deferred<SelectedInput | null>()
    const picker = vi.fn(() => pending.promise)
    const h = harness('await dtm.input({ id: "photo", label: "Photo" })', { selectImage: picker })
    await h.controller.analyze()
    const { unmount } = render(
        <ChakraProvider value={defaultSystem}>
            <GeneratedControls controller={h.controller} />
        </ChakraProvider>,
    )
    const button = screen.getByRole("button", { name: "Choose image for Photo" })
    button.focus()
    fireEvent.click(button)
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true))
    await act(async () => {
        pending.resolve({
            type: "localFile",
            inputId: "photo",
            displayName: "selected.png",
            selectionToken: "opaque",
        })
        await pending.promise
    })
    await waitFor(() => expect(screen.getByText("selected.png")).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Reset Photo" }))
    await waitFor(() => expect(screen.getByText("No image selected")).toBeTruthy())
    expect(h.project.revision).toBe(0)
    unmount()
    h.dispose()
})
