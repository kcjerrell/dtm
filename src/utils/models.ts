import { getUnknown } from "./helpers"

/**
 * Downloads the most recent ModelZoo file for the model type from the community repo
 * And parses the model Specifications into JS
 * It is expected that some Specifications will not parse properly (because they aren't models)
 * Also, this is potentially dangerious because it uses eval
 * @param {"Model" | "ControlNet" | "LoRA" | "TextualInversion"} name
 * @returns
 */
export async function compileOfficialModels(
	name: "Model" | "ControlNet" | "LoRA" | "TextualInversion",
) {
	const res = await fetch(
		`https://api.github.com/repos/drawthingsai/draw-things-community/contents/Libraries/ModelZoo/Sources/${name}Zoo.swift`,
	)
	const { content } = await res.json()
	const bytes = Uint8Array.from(atob(content), (x) => x.charCodeAt(0))
	const src = new TextDecoder().decode(bytes)

	const specs = extractSpecifications(src)
	const parsed = await specs.map((s) => toJS(s)).filter((s) => !!s)
	return parsed
}

/**
 * Since the swift objects are mostly compatible with JS code, we just touch up or remove
 * any of the parts that aren't compatible (i'm not familiar with swift but they seem to be
 * enums or function calls).
 *
 * uses eval()
 * @param {string} spec
 * @returns
 */
function toJS(spec: string) {
	const json = spec
		.replace(/^\s+/gm, "")
		.replace(/^Specification\($/gm, "{")
		.replace(/^\)$/gm, "}")
		.replace(/^version: \.(\w+)(,?)$/gm, '"version": "$1"$2')
		.replace(/^modifier: \.(\w+)(,?)$/gm, '"modifier": "$1"$2')
		.replace(/^type: \.(\w+)(,?)$/gm, '"type": "$1"$2')
		.replace(/^alternativeDecoderVersion: \.(\w+)(,?)$/gm, '"alternativeDecoderVersion": "$1"$2')
		.replace(/^mmdit.*$/gm, "")
		.replace(/^conditioning.*$/gm, "")
		.replace(/^objective.*$/gm, "")
		.replace(/^noiseDiscretization.*$/gm, "")
		.replace(/^weight:.*$/gm, "")
		.replace(/: nil/gm, ": null")

	try {
		// biome-ignore lint/security/noGlobalEval: parsing into js objects
		const obj = eval(`Object(${json})`)
		return obj
	} catch (e) {
		if (getUnknown<string>(e, "message")?.includes("Unexpected identifier 'specification'"))
			return null
		console.log(e)
		return null
	}
}

function extractSpecifications(input: string) {
	const text = input.replace(/^\s+/gm, "").replace(/\n/g, " ")
	const brackets = { "(": ")", "[": "]", "{": "}" } as Record<string, string>
	const specs = []
	let i = 0
	while (true) {
		const start = text.indexOf("Specification(", i)
		if (start === -1) break

		const bstack: string[] = []
		let inQuote = false
		let escaped = false
		let j = text.indexOf("(", start)
		// j++ // skip first '('

		let output = "Specification"

		for (; j < text.length; j++) {
			const ch = text[j]
			output += ch

			if (inQuote) {
				if (escaped) escaped = false
				else if (ch === "\\") escaped = true
				else if (ch === '"') inQuote = false
			} else {
				if (ch === '"') inQuote = true
				else if (brackets[ch]) bstack.push(brackets[ch])
				else if (ch === bstack.at(-1)) {
					bstack.pop()
					if (bstack.length === 0) break
				} else if (ch === "," && bstack.length === 1) output += "\n"

				if (ch === "(" && bstack.length === 1) output += "\n"
			}
		}

		const block = `${output.slice(0, -1)}\n)`
		specs.push(block)
		i = j + 1
	}
	return specs
}

export function versionMap(version?: string) {
	switch (version) {
		case "v1":
			return "v1"
		case "v2":
			return "v2"
		case "kandinsky21":
			return "kandinsky2.1"
		case "sdxlBase":
			return "sdxl_base_v0.9"
		case "sdxlRefiner":
			return "sdxl_refiner_v0.9"
		case "ssd1b":
			return "ssd_1b"
		case "svdI2v":
			return "svd_i2v"
		case "wurstchenStageC":
			return "wurstchen_v3.0_stage_c"
		case "wurstchenStageB":
			return "wurstchen_v3.0_stage_b"
		case "sd3":
			return "sd3"
		case "pixart":
			return "pixart"
		case "auraflow":
			return "auraflow"
		case "flux1":
			return "flux1"
		case "sd3Large":
			return "sd3_large"
		case "hunyuanVideo":
			return "hunyuan_video"
		case "wan21_1_3b":
			return "wan_v2.1_1.3b"
		case "wan21_14b":
			return "wan_v2.1_14b"
		case "hiDreamI1":
			return "hidream_i1"
		case "qwenImage":
			return "qwen_image"
		case "wan22_5b":
			return "wan_v2.2_5b"
		default:
			return version
	}
}

export function getVersionLabel(version?: string) {
	switch (version) {
		case "v1":
			return "SD"
		case "v2":
			return "SD2"
		case "kandinsky21":
		case "kandinsky2.1":
			return "Kandinsky"
		case "sdxlBase":
		case "sdxl_base_v0.9":
		case "sdxlRefiner":
		case "sdxl_refiner_v0.9":
			return "SDXL"
		case "ssd1b":
		case "ssd_1b":
			return "SSD"
		case "svdI2v":
		case "svd_i2v":
			return "SV"
		case "wurstchenStageC":
		case "wurstchen_v3.0_stage_c":
			return "WurstchenC"
		case "wurstchenStageB":
			return "WurstchenB"
		case "sd3":
			return "SD3"
		case "pixart":
			return "Pixart"
		case "auraflow":
			return "Auraflow"
		case "flux1":
			return "Flux1"
		case "sd3Large":
		case "sd3_large":
			return "SD3Large"
		case "hunyuanVideo":
		case "hunyuan_video":
			return "Hunyuan"
		case "wan21_1_3b":
		case "wan_v2.1_1.3b":
			return "Wan 2.1 1.3b"
		case "wan21_14b":
		case "wan_v2.1_14b":
			return "Wan 2.1 14b"
		case "hiDreamI1":
		case "hidream_i1":
			return "HiDream I1"
		case "qwenImage":
		case "qwen_image":
			return "Qwen Image"
		case "wan22_5b":
		case "wan_v2.2_5b":
			return "Wan 2.2 5b"
		default:
			return version
	}
}
