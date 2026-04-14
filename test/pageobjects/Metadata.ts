import "dotenv/config"

export type WaitForOpts = Parameters<ChainablePromiseElement["waitForDisplayed"]>[0]

class Metadata {
    get dropHere() {
        return $("text=Drop image here")
    }

    get detailsTab() {
        return $("aria/Details tab")
    }
    get configTab() {
        return $("aria/Config tab")
    }
    async selectTab(tab: "details" | "config") {
        const tabEl = tab === "details" ? this.detailsTab : this.configTab
        await tabEl.click()
        await expect(tabEl).toHaveAttribute("aria-selected", "true")
    }

    get currentImage() {
        return $(`//img[@data-testid="current-image"]`)
    }
    async isImageLoaded() {
        await this.currentImage.waitForDisplayed()
        return this.currentImage.execute((el: HTMLImageElement) => {
            return el.complete && el.naturalWidth > 0
        })
    }

    async getDataItemValue(label: string, opts?: WaitForOpts & { noThrow?: boolean }) {
        const el = $(`//dt[.='${label}']/following-sibling::dd`)
        try {
            await el.waitForDisplayed(opts)
            const text = await el.getText()
            console.debug(`Data item ${label}: ${text}`)
            return text
        } catch (e) {
            if (opts?.noThrow) {
                console.log(`No data item found for label: ${label}`)
                return null
            }
            throw e
        }
    }

    async triggerDrop() {
        await browser.execute(() => {
            const event = new DragEvent("drop", {
                bubbles: true,
                cancelable: true,
                dataTransfer: new DataTransfer(),
            })

            document.getElementById("check-root")?.dispatchEvent(event)
        })
    }

    toolbar = {
        get loadFromClipboard() {
            return $("aria/Load image from clipboard")
        },
        get copyImage() {
            return $("aria/Copy image")
        },
        get pinImage() {
            return $("aria/Pin image")
        },
        get unpinImage() {
            return $("aria/Unpin image")
        },
        get clearUnpinned() {
            return $("aria/Clear unpinned images")
        },
        get saveImage() {
            return $("aria/Save a copy")
        },
        get openFolder() {
            return $("aria/Open folder")
        },
        get openUrl() {
            return $("aria/Open URL")
        },
    }

    history = {
        get items() {
            return $$('[role="tablist"][aria-label="Image history"] [role="tab"]')
        },
        async getItemCount() {
            return (await this.items).length
        },
        getItem(index: number) {
            return $(`#image-item-${index}`)
        },
        async clickItem(index: number) {
            await this.getItem(index).click()
        },
        async isItemSelected(index: number) {
            return (await this.getItem(index).getAttribute("aria-selected")) === "true"
        },
        async getSelectedIndex() {
            const items = await this.items
            for (let i = 0; i < items.length; i++) {
                if ((await items[i].getAttribute("aria-selected")) === "true") {
                    return i + 1
                }
            }
            return -1
        },
    }
}

export default new Metadata()
