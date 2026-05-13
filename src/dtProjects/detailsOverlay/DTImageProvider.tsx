import type { PropsWithChildren } from "react"
import type { Snapshot } from "valtio"
import type { DTImageFull } from "@/commands"
import { useDTP } from "../state/context"
import { DTImageContext } from "./DTImageContext"
import { TensorHistoryNode } from "@/commands/DTProjectTypes"

type DTImageProviderProps = PropsWithChildren<{
    image?: Snapshot<TensorHistoryNode>
}>

/**
 * Provider for the DTImageContext, which provides the image and models
 * @param props
 * @returns
 */
export function DTImageProvider(props: DTImageProviderProps) {
    const { children, image } = props
    const { models } = useDTP()
    const model = models.getModel("Model", image?.config?.model)
    const loras = image?.data?.loras?.map((l) => models.getModel("Lora", l.file))
    const controls = image?.data?.controls?.map((c) => models.getModel("Cnet", c.file))
    const refiner = models.getModel("Model", image?.groupedConfig?.refiner?.model || undefined)

    return (
        <DTImageContext value={{ image, model, loras, controls, refiner }}>
            {children}
        </DTImageContext>
    )
}
