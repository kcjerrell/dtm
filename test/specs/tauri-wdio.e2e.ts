describe("Tauri WebdriverIO Plugin", () => {
    it("should have plugin available", async () => {
        expect(typeof browser.tauri?.execute).toBe("function")

        const available = await browser.tauri.execute(() => {
            return typeof window.wdioTauri?.execute === "function"
        })

        expect(available).toBe(true)
    })
})
