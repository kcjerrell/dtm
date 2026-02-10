import type { PropsWithChildren } from "react"
import type { Snapshot } from "valtio"
import type { DTImageFull } from "@/commands"
import { useDTP } from "../state/context"
import { DTImageContext } from "./DTImageContext"

type DTImageProviderProps = PropsWithChildren<{
	image?: Snapshot<DTImageFull>
}>

export function DTImageProvider(props: DTImageProviderProps) {
	const { children, image } = props
	const { models } = useDTP()
	const model = models.getModel("Model", image?.config?.model)
	const loras = image?.node?.loras?.map((l) => models.getModel("Lora", l.file))
	const controls = image?.node?.controls?.map((c) => models.getModel("Cnet", c.file))
	const refiner = models.getModel("Model", image?.groupedConfig?.refiner?.model || undefined)

	return <DTImageContext value={{ image, model, loras, controls, refiner }}>{children}</DTImageContext>
}
