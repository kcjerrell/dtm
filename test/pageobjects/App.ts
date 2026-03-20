import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"

class App {
  get projectsButton() { return $("button=Projects") }
  get metadataButton() { return $("button=Metadata") }

  async selectView(view: "projects" | "metadata") {
    if (view === "projects") {
      await this.projectsButton.click();
      await expect(this.projectsButton).toHaveAttribute("aria-current", "page")
    } else if (view === "metadata") {
      await this.metadataButton.click();
      await expect(this.metadataButton).toHaveAttribute("aria-current", "page")
    }
  }

  async clearAllData() {
    console.log("Clearing data...")
    try {
      const dataPath = os.platform() === 'darwin'
        ? path.join(os.homedir(), "Library/Application Support/com.kcjer.dtm")
        : path.join(os.homedir(), ".local/share/com.kcjer.dtm");
      fs.rmSync(dataPath, { recursive: true });
    } catch (e) {
    }
  }
}

export default new App()