import fse from "fs-extra"
import path from "path"
import { getTestDataRootDir } from "./paths"

export function getFile(filename: string, checkExists = true) {
    const filePath = path.join(getTestDataRootDir(), filename)
    if (checkExists && !fse.pathExistsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`)
    }
    return filePath
}

export async function waitForFile(filePath: string, timeout = 10000, interval = 100) {
    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
        if (await fse.pathExists(filePath)) {
            return
        }
        await new Promise((resolve) => setTimeout(resolve, interval))
    }
    throw new Error(`File not found: ${filePath}`)
}
