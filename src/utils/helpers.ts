import { open } from "@tauri-apps/plugin-dialog"

export function areEquivalent(a: unknown[], b: unknown[]) {
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false
	}
	return true
}

export async function uint8ArrayToBase64(uint8: Uint8Array<ArrayBuffer>): Promise<string> {
	// Wrap in a Blob and read it as a DataURL
	const blob = new Blob([uint8])
	const reader = new FileReader()

	return new Promise((resolve, reject) => {
		reader.onloadend = () => {
			const dataUrl = reader.result as string
			// Strip the "data:*/*;base64," prefix
			const base64 = dataUrl.split(",")[1]
			resolve(base64)
		}
		reader.onerror = reject
		reader.readAsDataURL(blob)
	})
}

/**
 * Determines if a click is in the actual image area for an img that is object-fit: contain
 * @param e the event
 * @param img the image
 * @returns whether or not the click is inside the image
 */
export function isInsideImage(e: React.MouseEvent, img: HTMLImageElement): boolean {
	const rect = img.getBoundingClientRect()

	// mouse coords relative to element
	const x = e.clientX - rect.left
	const y = e.clientY - rect.top

	// calculate contained image size
	const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight)
	const drawnWidth = img.naturalWidth * scale
	const drawnHeight = img.naturalHeight * scale
	const offsetX = (rect.width - drawnWidth) / 2
	const offsetY = (rect.height - drawnHeight) / 2

	return x >= offsetX && x <= offsetX + drawnWidth && y >= offsetY && y <= offsetY + drawnHeight
}

/**
 * Fisher–Yates shuffle
 * Shuffles the array in-place and also returns it
 */
export function shuffle<T>(array: T[]): T[] {
	let m = array.length

	while (m > 0) {
		// Pick a random index
		const i = Math.floor(Math.random() * m--)

		// Swap element at m with element at i
		;[array[m], array[i]] = [array[i], array[m]]
	}

	return array
}

export function capitalize(text: string) {
	return text.charAt(0).toUpperCase() + text.slice(1)
}

export function getStoreName(name: string) {
	if (import.meta.env.DEV) return `dev_${name}`
	return name
}

export async function settledValues<T>(promises: Promise<T>[]): Promise<NonNullable<T>[]> {
	const results = await Promise.allSettled(promises)

	function isFulfilled<U>(r: PromiseSettledResult<U>): r is PromiseFulfilledResult<U> {
		return r.status === "fulfilled"
	}

	return results
		.filter(isFulfilled)
		.map((r) => r.value)
		.filter((v): v is Awaited<NonNullable<T>> => v !== null)
}

type OpenOptions = Parameters<typeof open>[0]
type SingleOpenOptions = OpenOptions & { multiple: false | undefined }
type SingleOpenAndCallback<T> = (f: string) => T | Promise<T>
type MultipleOpenOptions = OpenOptions & { multiple: true }
type MultiOpenAndCallback<T> = (f: string[]) => T | Promise<T>

export async function openAnd<T>(
	callback: SingleOpenAndCallback<T>,
	options: SingleOpenOptions,
): Promise<T | null>
export async function openAnd<T>(
	callback: MultiOpenAndCallback<T>,
	options: MultipleOpenOptions,
): Promise<T | null>
export async function openAnd<T>(
	callback: SingleOpenAndCallback<T> | MultiOpenAndCallback<T>,
	options: Parameters<typeof open>[0] = {},
) {
	const files = await open(options)
	if (!files || (Array.isArray(files) && files.length === 0)) return null

	if (options.multiple) {
		const arg = Array.isArray(files) ? (files as string[]) : [files]
		return (callback as MultiOpenAndCallback<T>)(arg)
	} else {
		return (callback as SingleOpenAndCallback<T>)(files)
	}
}

export function arrayIfOnly<T>(arg: T | readonly T[]): T[] {
	return Array.isArray(arg) ? [...arg] : [arg as T]
}

export function chunk<T>(values: T[], chunkSize: number): T[][] {
	const chunks: T[][] = []
	for (let i = 0; i < values.length; i += chunkSize) {
		chunks.push(values.slice(i, i + chunkSize))
	}
	return chunks
}

export function clearArray<T>(arr: T[], newItems: T[] = []) {
	arr.splice(0, arr.length, ...newItems)
}

export function filterObject<T extends object>(
	obj: T,
	predicate: (key: keyof T, value: T[keyof T]) => boolean,
) {
	return Object.fromEntries(
		Object.entries(obj).filter(([key, value]) => predicate(key as keyof T, value)),
	)
}

export function getUnknown<T>(obj: unknown, key: string): T | undefined {
	if (obj === null || typeof obj !== "object") return undefined
	if (key in obj) return obj[key as keyof typeof obj]
	return undefined
}
