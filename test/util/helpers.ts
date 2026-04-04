import { execSync } from "child_process";

export async function shiftClick(el: ChainablePromiseElement) {
	await el.execute((elem) => {
		const event = new PointerEvent("click", {
			shiftKey: true,
			bubbles: true,
			cancelable: true,
		});
		elem.dispatchEvent(event);
	});
}

export async function cmdClick(el: ChainablePromiseElement) {
	await el.execute((elem) => {
		const event = new PointerEvent("click", {
			metaKey: true,
			bubbles: true,
			cancelable: true,
		});
		elem.dispatchEvent(event);
	});
}

/** copies a file to the clipboard (macOS only) */
export function copyFileToClipboard(filePath: string) {
	execSync(`osascript -e 'set the clipboard to (POSIX file "${filePath}")'`);
}

/** copies files to the clipboard (macOS only) */
export function copyFilesToClipboard(files: string[]) {
	const applescript = `
	set the clipboard to {${files.map((f) => `POSIX file "${f}"`).join(", ")}}
	`;

	execSync(`osascript -e '${applescript}'`);
}
