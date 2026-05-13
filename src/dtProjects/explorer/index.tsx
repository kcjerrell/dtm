import { Box, HStack, Table, Text } from "@chakra-ui/react"
import { motion } from "motion/react"
import { Fragment, useCallback, useEffect, useMemo } from "react"
import DTProject from "@/commands/DTProject"
import type { TensorHistoryNode } from "@/commands/DTProjectTypes"
import urls from "@/commands/urls"
import { useProxyRef } from "@/hooks/valtioHooks"
import { useDTP } from "../state/context"

interface ExplorerProps extends ChakraProps {
    projectId: number
}

function Explorer(props: ExplorerProps) {
    const { projectId, ...restProps } = props
    const { projects } = useDTP()
    const { state, snap } = useProxyRef(() => ({
        data: [] as TensorHistoryNode[],
        pageStatus: [] as ("loading" | "loaded" | undefined)[],
    }))
    const columns = useMemo(() => ["rowid", "lineage", "logical_time"], [])

    const project = projects.getProject(projectId)

    const loadPage = useCallback(
        async (pageIndex: number) => {
            if (!project || state.pageStatus[pageIndex] !== undefined) return
            state.pageStatus[pageIndex] = "loading"
            const rows = await DTProject.listTensorHistoryNodes({
                projectId,
                skip: pageIndex * 50,
                take: 50,
                select: ["tensordata", "moodboard", "clip"],
            })
            state.pageStatus[pageIndex] = "loaded"
            state.data.splice(pageIndex * 50, 50, ...rows)
        },
        [projectId, state, project],
    )

    useEffect(() => {
        loadPage(0)
    }, [loadPage])

    if (!project) return null

    return (
        <Box {...restProps}>
            <Table.Root>
                <Table.Header></Table.Header>

                <Table.Body>
                    <Table.Row key="what">
                        {[...columns, "generated", "ids", "moodboard", "clip", "preview"].map(
                            (col) => (
                                <Table.ColumnHeader key={col}>
                                    {col.split(".").pop()}
                                </Table.ColumnHeader>
                            ),
                        )}
                    </Table.Row>
                    {snap.data.map((row, rowIndex) => {
                        console.log(row)
                        return (
                            <Fragment key={row.rowid}>
                                <Table.Row
                                    key={row.rowid}
                                    bgColor={"grayc.14"}
                                    // _dark={{ bgColor: "grayc.13" }}
                                >
                                    {columns.map((col) => (
                                        <Table.Cell key={col}>{getValue(row, col)}</Table.Cell>
                                    ))}
                                    <Table.Cell>{row.data.generated ? "✅" : "❌"}</Table.Cell>
                                    <IdsCell item={row} />
                                    <Table.Cell>
                                        {row.moodboard?.length && `${row.moodboard.length} images`}
                                    </Table.Cell>
                                    <Table.Cell whiteSpace={"pre"}>
                                        {row.clip &&
                                            JSON.stringify(row.clip, null, 1)
                                                .replace(/["{},]/g, "")
                                                .replace("frames_per_second", "fps")}
                                    </Table.Cell>
                                    <PreviewCell item={row} />
                                </Table.Row>
                                {row.tensordata?.map((t) => (
                                    <TensorData key={t.idx} item={t} projectId={row.projectId} />
                                ))}
                                {rowIndex % 50 === 25 &&
                                    snap.pageStatus[Math.floor(rowIndex / 50) + 1] ===
                                        undefined && (
                                        <motion.div
                                            onViewportEnter={async () => {
                                                await loadPage(Math.floor(rowIndex / 50) + 1)
                                            }}
                                        />
                                    )}
                            </Fragment>
                        )
                    })}
                </Table.Body>
            </Table.Root>
        </Box>
    )
}

export default Explorer

interface CellProps<T> extends ChakraProps {
    item: MaybeReadonly<T>
}

function TensorData(
    props: CellProps<NonNullable<TensorHistoryNode["tensordata"]>[0]> & { projectId: number },
) {
    const { item, projectId } = props
    const tensorName = item.tensor_name
    return (
        <Table.Row _dark={{ bgColor: "grayc.15" }}>
            <Table.Cell width={"5rem"} bgColor={"grayc.14"} />
            <Table.Cell colSpan={7} bgColor={"grayc.10"}>
                <HStack width={"100%"} justifyContent={"flex-end"}>
                    <Text>{tensorName}</Text>
                    <img
                        style={{ width: "50px", height: "50px" }}
                        src={urls.tensor(projectId, tensorName, { size: 25 })}
                        alt={tensorName}
                    />
                </HStack>
            </Table.Cell>
        </Table.Row>
    )
}

function PreviewCell(props: CellProps<TensorHistoryNode>) {
    const { item, ...restProps } = props

    return (
        <Table.Cell {...restProps}>
            {item.data.preview_id && (
                <img
                    width={item.data.start_width}
                    height={item.data.start_height}
                    style={{ width: "50px", height: "50px" }}
                    src={urls.thumb(item.projectId, item.data.preview_id)}
                    alt={item.data.preview_id.toString()}
                />
            )}
        </Table.Cell>
    )
}

function IdsCell(props: CellProps<TensorHistoryNode>) {
    const { item, ...restProps } = props
    const tensorNames: string[] = []
    if (item.data.tensor_id) tensorNames.push(`tensor_history_${item.data.tensor_id}`)
    if (item.data.scribble_id) tensorNames.push(`scribble_${item.data.scribble_id}`)
    if (item.data.pose_id) tensorNames.push(`pose_${item.data.pose_id}`)
    if (item.data.mask_id) tensorNames.push(`binary_mask_${item.data.mask_id}`)
    if (item.data.depth_map_id) tensorNames.push(`depth_map_${item.data.depth_map_id}`)
    if (item.data.color_palette_id) tensorNames.push(`color_palette_${item.data.color_palette_id}`)
    if (item.data.custom_id) tensorNames.push(`custom_${item.data.custom_id}`)

    return (
        <Table.Cell {...restProps}>
            <ul>
                {tensorNames.map((tensorName) => (
                    <li key={tensorName}>{tensorName}</li>
                ))}
            </ul>
        </Table.Cell>
    )
}

function getValue(data: Record<string, unknown>, key: string) {
    const keys = key.split(".")
    let value: unknown = data
    for (const k of keys) {
        if (!value || typeof value !== "object") return undefined
        value = (value as Record<string, unknown>)[k]
    }
    return JSON.stringify(value, null, 2)
}
