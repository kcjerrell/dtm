export function versionMap(version: string) {
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