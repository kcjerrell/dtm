import { proxy } from "valtio"
import { type Model, pdb } from "@/commands"
import { DTPStateController } from "@/hooks/StateController"
import { getVersionLabel } from "@/utils/models"
import type { ModelVersionInfo, VersionModel } from "../types"

type ModelsList = (Model | VersionModel)[]

export type ModelsControllerState = {
	models: ModelsList
	loras: ModelsList
	controls: ModelsList
	versions: Record<string, ModelVersionInfo>
}

class ModelsController extends DTPStateController<ModelsControllerState> {
	state = proxy<ModelsControllerState>({
		models: [],
		loras: [],
		controls: [],
		versions: {},
	})

	async refreshModels() {
		const dbModels = await pdb.listModels()

		const versions = {
			"": { models: 0, controls: 0, loras: 0, label: "Unknown" },
		} as Record<string, { models: number; controls: number; loras: number; label?: string }>

		for (const model of dbModels) {
			const version = model.version ?? ""
			if (!versions[version])
				versions[version] = { models: 0, controls: 0, loras: 0, label: getVersionLabel(version) }
			if (model.model_type === "Model") versions[version].models++
			else if (model.model_type === "Lora") versions[version].loras++
			else if (model.model_type === "Cnet") versions[version].controls++
		}

		const models: ModelsList = dbModels.filter((it) => it.model_type === "Model")
		const loras: ModelsList = dbModels.filter((it) => it.model_type === "Lora")
		const controls: ModelsList = dbModels.filter((it) => it.model_type === "Cnet")

		let versionModelId = -1
		for (const [version, info] of Object.entries(versions)) {
			const baseVersionModel = {
				filename: "",
				name: info.label,
				version: version,
				isVersion: true,
			}

			if (info.models > 0) {
				const versionModels = models.filter((m) => m.version === version)
				const imageCount = versionModels.reduce((acc, m) => acc + (m.count ?? 0), 0)
				const modelIds = versionModels.map((m) => m.id)
				models.push({
					...baseVersionModel,
					id: versionModelId--,
					model_type: "Model",
					modelCount: info.models,
					count: imageCount,
					modelIds,
				})
			}

			if (info.loras > 0) {
				const versionModels = loras.filter((m) => m.version === version)
				const imageCount = versionModels.reduce((acc, m) => acc + (m.count ?? 0), 0)
				const modelIds = versionModels.map((m) => m.id)
				loras.push({
					...baseVersionModel,
					id: versionModelId--,
					model_type: "Lora",
					modelCount: info.loras,
					count: imageCount,
					modelIds,
				})
			}

			if (info.controls > 0) {
				const versionModels = controls.filter((m) => m.version === version)
				const imageCount = versionModels.reduce((acc, m) => acc + (m.count ?? 0), 0)
				const modelIds = versionModels.map((m) => m.id)
				controls.push({
					...baseVersionModel,
					id: versionModelId--,
					model_type: "Cnet",
					modelCount: info.controls,
					count: imageCount,
					modelIds,
				})
			}
		}

		this.state.models = models
		this.state.loras = loras
		this.state.controls = controls
		this.state.versions = versions
	}
}

export default ModelsController
