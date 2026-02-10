const r$ = (...args) => browser.react$(...args)
const r$$ = (...args) => browser.react$$(...args)
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"

class App {
  get projectsButton() { return $("button=Projects") }
  get metadataButton() { return $("button=Metadata") }

  async selectView(view: "projects" | "metadata") {
    if (view === "projects") {
      await this.projectsButton.click();
      await expect(this.projectsButton).toHaveAttribute("aria-selected", "true")
    } else if (view === "metadata") {
      await this.metadataButton.click();
      await expect(this.metadataButton).toHaveAttribute("aria-selected", "true")
    }
  }

  clearAllData() {
    console.log("Clearing data...")
    try {
      fs.rmSync(path.join(os.homedir(), ".local/share/com.kcjer.dtm"), { recursive: true })
    } catch (e) {
    }
  }
}

export default new App()