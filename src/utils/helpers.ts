import { open } from "@tauri-apps/plugin-dialog"

export function areEquivalent(a?: unknown[] | null, b?: unknown[] | null) {
    if (!a || !b) return false
    if (a?.length !== b?.length) return false
    for (let i = 0; i < a?.length; i++) {
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

    const files = await pickFileForImport(options)
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

/**
 * Returns the singular form or plural form based on n
 * if only a number is provided, an "s" is returned
 * @param n The number to check
 * @param singular The singular form of the word. If not given, will return ""
 * @param plural The plural form of the word. If not given, will return "s"
 */
export function plural(n?: number, singular?: string, plural?: string) {
    if (!Number.isNaN(n) && n === 1) return singular ?? ""
    return plural ?? (singular ? `${singular}s` : "s")
}

export interface CompareOptions {
    ignoreObjects?: boolean
    ignoreFunctions?: boolean
}

/**
 * Compares two arrays of objects, and returns a list of added, removed, and changed.
 * Items are only compared shallowly. For example:
 *
 * { id: 5, name: "test" }
 * { id: 5, name: "test2" }
 *
 * These would be considered changed
 *
 * { id: 5, data: { name: "test" }}
 * { id: 5, data: { name: "test" }}
 *
 * The name property will not be checked. These items will be considered the same only if
 * data is the same object reference - unless the ignore objects param is true
 *
 * @param a The original array. Items in a that are not in b will be considered removed
 * @param b The new array. Items in b that are not in a will be considered added
 * @param keyFn A function that returns a unique key for each item
 * @param opts Options for comparison
 * @returns An object containing the added, removed, and changed items
 */
export function compareItems<T extends Record<string, unknown>>(
    a: T[],
    b: T[],
    keyFn: (item: T) => string | number,
    opts: CompareOptions = {},
) {
    const aMap = new Map(a.map((item) => [keyFn(item), item]))
    const bMap = new Map(b.map((item) => [keyFn(item), item]))

    const added = []
    const removed = []
    const changed = []
    const same = []

    for (const [key, value] of bMap) {
        const aItem = aMap.get(key)
        if (aItem === undefined) {
            added.push(value)
            continue
        }
        if (shallowCompare(aItem, value, opts)) same.push(value)
        else changed.push(value)
        aMap.delete(key)
    }

    for (const [_key, value] of aMap) {
        removed.push(value)
    }

    return {
        added,
        removed,
        changed,
        same,
        itemsChanged: added.length > 0 || removed.length > 0 || changed.length > 0,
    }
}

function shallowCompare<T extends Record<string, unknown>>(a: T, b: T, opts: CompareOptions = {}) {
    const { ignoreObjects = false, ignoreFunctions = false } = opts
    for (const key of Object.keys(a)) {
        const valA = a[key]
        if (ignoreObjects && typeof valA === "object" && valA !== null) continue
        if (ignoreFunctions && typeof valA === "function") continue
        if (valA !== b[key]) {
            console.log("diff", key, valA, b[key])
            return false
        }
    }
    return true
}

export function everyNth<T>(arr: T[], n: number): T[] {
    return arr.filter((_, i) => i % n === 0)
}

export async function pickFileForImport(options?: Parameters<typeof open>[0]) {
    const e2eFilePath = (window as any).__E2E_FILE_PATH__
    console.debug("E2E file path:", e2eFilePath);
    if (e2eFilePath) {
        return e2eFilePath;
    }

    return await open(options);
}

export function truncate(text: string, length: number) {
    if (text.length <= length) return text
    return `${text.slice(0, length)}...`
}
