const r$ = (...args) => browser.react$(...args)
const r$$ = (...args) => browser.react$$(...args)
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"

class AppPage {
  get projectsButton() { return $("button=Projects") }
  get metadataButton() { return $("button=Metadata")}

  clearAllData() {
    console.log("Clearing data...")
   try {
    fs.rmSync(path.join(os.homedir(), ".local/share/com.kcjer.dtm"), {recursive: true})
   } catch (e) {
   }
  }
}

export default new AppPage()