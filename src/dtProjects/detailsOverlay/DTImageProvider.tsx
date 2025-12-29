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

	return <DTImageContext value={{ image, model }}>{children}</DTImageContext>
}
