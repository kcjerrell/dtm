// @vitest-environment jsdom

import { ChakraProvider, defaultSystem, Popover } from "@chakra-ui/react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import ToolbarButton from "./ToolbarButton"
import { ToolbarSection } from "./ToolbarSection"

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

it("shows its tooltip and still works as a popover trigger", async () => {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    )
    render(
        <ChakraProvider value={defaultSystem}>
            <ToolbarSection>
                <Popover.Root>
                    <Popover.Trigger asChild>
                        <ToolbarButton
                            itemId="settings"
                            aria-label="Settings"
                            tipTitle="Adjust alignment"
                        >
                            Settings
                        </ToolbarButton>
                    </Popover.Trigger>
                    <Popover.Positioner>
                        <Popover.Content aria-label="Alignment settings" />
                    </Popover.Positioner>
                </Popover.Root>
            </ToolbarSection>
        </ChakraProvider>,
    )

    const button = screen.getByRole("button", { name: "Settings" })
    expect(button.getAttribute("aria-expanded")).toBe("false")
    fireEvent.pointerOver(button, { pointerType: "mouse" })
    const tooltip = await screen.findByRole("tooltip", {}, { timeout: 2000 })
    expect(tooltip.textContent).toBe("Adjust alignment")
    expect(button.getAttribute("aria-describedby")).toBe(tooltip.id)

    fireEvent.click(button)
    await screen.findByRole("dialog", { name: "Alignment settings" })
    expect(button.getAttribute("aria-expanded")).toBe("true")
})
