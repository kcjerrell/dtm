import { chakra, VStack } from "@chakra-ui/react"
import { motion } from "motion/react"
import { Fragment } from "react/jsx-runtime"
import type { Snapshot } from "valtio"
import type { ImageExtra } from "@/commands"
import { DataItem, Panel } from "@/components"
import { useDTP } from "../state/context"

interface DetailsFallbackProps extends ChakraProps {
    item?: Snapshot<ImageExtra> | null
}

function DetailsFallback(props: DetailsFallbackProps) {
    const { item, ...restProps } = props
    const { projects, models } = useDTP()

    if (!item) return null

    const model = models.getModel("Model", item.model_file)

    return (
        <Panel
            flex={"1 1 auto"}
            overflow={"clip"}
            onClick={(e) => e.stopPropagation()}
            padding={0}
            {...restProps}
            asChild
        >
            <motion.div
                variants={{
                    open: {
                        opacity: 1,
                        transition: {
                            duration: 0.25,
                            ease: "easeInOut",
                        },
                    },
                    closed: {
                        opacity: 0,
                        transition: { duration: 0.25 },
                    },
                }}
                initial={"closed"}
                animate={"open"}
                exit={"closed"}
            >
                <VStack data-solid padding={2} alignItems={"stretch"} {...restProps}>
                    <Fragment key={item.id}>
                        <Row>
                            <DataItem
                                label={"Project"}
                                data={projects
                                    .getProject(item.project_id)
                                    ?.name.replace(/\.sqlite3$/, "")}
                            />
                            <DataItem
                                label={"Created"}
                                data={new Date(item.wall_clock).toLocaleString()}
                            />
                        </Row>
                        <Row>
                            <DataItem.Size
                                value={{
                                    width: item.start_width * 64,
                                    height: item.start_height * 64,
                                }}
                            />
                            <DataItem.Seed value={{ value: item.seed }} />
                        </Row>
                        <Row>
                            <DataItem.Model value={model?.name ?? item.model_file ?? undefined} />
                        </Row>

                        {/* <Row>
                            <DataItem label={"LoRA"} data={`Reconnect folder to see lora info`} />
                        </Row>

                        <Row>
                            <DataItem
                                label={"Control"}
                                data={`Reconnect folder to see control info`}
                            />
                        </Row> */}

                        <Row>
                            <DataItem.Sampler value={{ value: item.sampler }} />
                            <DataItem.Steps value={item.steps} />
                        </Row>
                        <Row>
                            <DataItem.Strength value={item.strength} />
                            <DataItem.GuidanceScale value={item.guidance_scale} />
                            <DataItem.Shift
                                value={{ value: item.shift, resDependentShift: false }}
                            />
                        </Row>
                        <DataItem label={"Prompt"} data={item.prompt} maxLines={6} />
                        <DataItem
                            label={"Negative Prompt"}
                            data={item.negative_prompt}
                            maxLines={6}
                        />
                        <DataItem.NumFrames value={item.num_frames ?? undefined} />
                    </Fragment>
                </VStack>
            </motion.div>
        </Panel>
    )
}

export default DetailsFallback

const Row = chakra("div", {
    base: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "flex-start",
        alignItems: "center",
        mb: 2,
        gap: 2,
        "&>*": {
            flex: "1 1 auto",
        },
    },
})
