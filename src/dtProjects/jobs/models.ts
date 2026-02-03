import { path } from "@tauri-apps/api"
import { writeTextFile } from "@tauri-apps/plugin-fs"
import { pdb } from "@/commands"
import type { JobCallback } from "@/utils/container/queue"
import type { DTPJobSpec } from "../state/types"
import type { ListModelInfoFilesResult } from "../state/watchFolders"

async function getRemoteCombinedModels(lastUpdated?: string) {
    const res = await fetch("https://kcjerrell.github.io/dt-models/combined_models.json")
    const data = await res.json()

    if (lastUpdated && lastUpdated >= data.lastUpdate) {
        return null
    }

    const check = (key: string) => key in data && Array.isArray(data[key])

    const modelInfoFiles = [] as ListModelInfoFilesResult[]

    const models = []
    if (check("officialModels")) models.push(...data.officialModels)
    if (check("communityModels")) models.push(...data.communityModels)
    if (check("uncuratedModels")) models.push(...data.uncuratedModels)
    if (models.length) {
        const filePath = await path.join(await path.appDataDir(), "combined_models.json")
        await writeTextFile(filePath, JSON.stringify(models, null, 2))
        modelInfoFiles.push({ path: filePath, modelType: "Model" })
    }

    const cnets = []
    if (check("officialCnets")) cnets.push(...data.officialCnets)
    if (check("communityCnets")) cnets.push(...data.communityCnets)
    if (cnets.length) {
        const filePath = await path.join(await path.appDataDir(), "combined_cnets.json")
        await writeTextFile(filePath, JSON.stringify(cnets, null, 2))
        modelInfoFiles.push({ path: filePath, modelType: "Cnet" })
    }

    const loras = []
    if (check("officialLoras")) loras.push(...data.officialLoras)
    if (check("communityLoras")) loras.push(...data.communityLoras)
    if (loras.length) {
        const filePath = await path.join(await path.appDataDir(), "combined_loras.json")
        await writeTextFile(filePath, JSON.stringify(loras, null, 2))
        modelInfoFiles.push({ path: filePath, modelType: "Lora" })
    }

    return [modelInfoFiles, data.lastUpdate] as [ListModelInfoFilesResult[], string]
}

export function syncModelInfoJob(
    modelInfoFiles: ListModelInfoFilesResult[],
    callback?: JobCallback,
): DTPJobSpec<"models-scan"> {
    return {
        type: "models-scan",
        label: `Syncing models from files: ${modelInfoFiles.map((m) => m.path.split("/").pop())}`,
        callback,
        data: modelInfoFiles,
        execute: async (data) => {
            for (const { path, modelType } of data) {
                await pdb.scanModelInfo(path, modelType)
            }
        },
    }
}

export function syncRemoteModelsJob(callback?: JobCallback): DTPJobSpec<"models-scan-remote"> {
    return {
        type: "models-scan-remote",
        label: "Checking models from remote",
        data: undefined,
        callback,
        execute: async (_, container) => {
            const settings = container.getService("settings")
            const lastUpdate = settings?.state?.models?.lastUpdated

            const update = await getRemoteCombinedModels(lastUpdate)

            if (!update) return undefined

            const [modelInfoFiles, newLastUpdate] = update

            const syncJob = syncModelInfoJob(modelInfoFiles, () => {
                settings?.updateSetting("models", "lastUpdated", newLastUpdate)
            })

            return { jobs: [syncJob] }
        },
    }
}
