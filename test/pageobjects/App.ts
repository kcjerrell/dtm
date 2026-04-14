import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"

class App {
    get projectsButton() {
        return $("button=Projects")
    }
    get metadataButton() {
        return $("button=Metadata")
    }

    async selectView(view: "projects" | "metadata") {
        if (view === "projects") {
            await this.projectsButton.click()
            await expect(this.projectsButton).toHaveAttribute("aria-current", "page", {
                wait: 10000,
            })
        } else if (view === "metadata") {
            await this.metadataButton.click()
            await expect(this.metadataButton).toHaveAttribute("aria-current", "page", {
                wait: 10000,
            })
        }
    }

    async clearAllData() {
        await browser.executeAsync(async (done) => {
            let attempts = 0
            const promise = Promise.withResolvers<void>()
            const reset = async () => {
                attempts++
                if ("__reset_db" in window) {
                    try {
                        await (window as any).__reset_db()
                        promise.resolve()
                        return
                    } catch (e) {
                        console.error(e)
                    }
                }
                if (attempts === 3) promise.reject("couldn't reset db")
                else setTimeout(reset, 1000)
            }
            reset()
            await promise.promise
            return done(true)
        })
        await browser.refresh()
        await new Promise((resolve) => setTimeout(resolve, 3000))
    }
}

export default new App()
