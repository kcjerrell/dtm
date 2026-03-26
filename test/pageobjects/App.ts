import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

class App {
	get projectsButton() {
		return $("button=Projects");
	}
	get metadataButton() {
		return $("button=Metadata");
	}

	async selectView(view: "projects" | "metadata") {
		if (view === "projects") {
			await this.projectsButton.click();
			await expect(this.projectsButton).toHaveAttribute("aria-current", "page");
		} else if (view === "metadata") {
			await this.metadataButton.click();
			await expect(this.metadataButton).toHaveAttribute("aria-current", "page");
		}
	}

	async clearAllData() {
		await browser.executeAsync(async (done) => {
			try {
				await (window as any).__reset_db();
				done(true);
			} catch (e) {
				done(false);
			}
		});
		await browser.refresh();
		await new Promise((resolve) => setTimeout(resolve, 3000));
	}
}

export default new App();
