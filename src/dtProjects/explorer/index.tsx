import { Box, HStack, Table, Text, VStack } from "@chakra-ui/react"
import { Fragment, useCallback, useEffect, useMemo } from "react"
import type { TensorDataRow, TensorHistoryNodeRow } from "@/commands"
import DTProject from "@/commands/DTProject"
import urls from "@/commands/urls"
import { useProxyRef } from "@/hooks/valtioHooks"
import { useDTP } from "../state/context"
import { motion } from "motion/react"

interface ExplorerProps extends ChakraProps {
    projectId: number
}

function Explorer(props: ExplorerProps) {
    const { projectId, ...restProps } = props
    const { projects } = useDTP()
    const { state, snap } = useProxyRef(() => ({
        data: [] as (TensorHistoryNodeRow & { tensorData?: TensorDataRow[] })[],
        pageStatus: [] as ("loading" | "loaded" | undefined)[],
    }))
    const columns = useMemo(() => ["rowid", "lineage", "logical_time"], [])

    const project = projects.getProject(projectId)

    const loadPage = useCallback(
        async (pageIndex: number) => {
            if (!project || state.pageStatus[pageIndex] !== undefined) return
            state.pageStatus[pageIndex] = "loading"
            const rows = (await DTProject.listTensorHistoryNodes(
                projectId,
                pageIndex * 50,
                50,
            )) as (TensorHistoryNodeRow & { tensorData?: TensorDataRow[] })[]
            for (const row of rows) {
                const tensorData = await DTProject.tensorData(project.full_path, {
                    lineage: row.lineage,
                    logicalTime: row.logical_time,
                })
                row.tensorData = tensorData
            }
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
                        {[...columns, "generated", "preview"].map((col) => (
                            <Table.ColumnHeader key={col}>
                                {col.split(".").pop()}
                            </Table.ColumnHeader>
                        ))}
                    </Table.Row>
                    {snap.data.map((row, rowIndex) => (
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
                                <PreviewCell item={row} />
                            </Table.Row>
                            {row.tensorData?.map((t) => (
                                <TensorData key={t.idx} item={t} projectId={row.projectId} />
                            ))}
                            {rowIndex % 50 === 25 &&
                                snap.pageStatus[Math.floor(rowIndex / 50) + 1] === undefined && (
                                    <motion.div
                                        onViewportEnter={async () => {
                                            await loadPage(Math.floor(rowIndex / 50) + 1)
                                        }}
                                    />
                                )}
                        </Fragment>
                    ))}
                </Table.Body>
            </Table.Root>
        </Box>
    )
}

export default Explorer

interface CellProps<T> extends ChakraProps {
    item: MaybeReadonly<T>
}

function TensorData(props: CellProps<TensorDataRow> & { projectId: number }) {
    const { item, projectId, ...restProps } = props
    const tensorName = getTensorName(item)
    return (
        <Table.Row _dark={{ bgColor: "grayc.15" }}>
            <Table.Cell width={"5rem"} bgColor={"grayc.14"} />
            <Table.Cell colSpan={4} bgColor={"grayc.10"}>
                <HStack width={"100%"} justifyContent={"flex-end"}>
                    <Text>{tensorName}</Text>
                    <img
                        style={{ width: "50px", height: "50px" }}
                        src={urls.tensor(projectId, tensorName, { size: 50 })}
                        alt={tensorName}
                    />
                </HStack>
            </Table.Cell>
        </Table.Row>
    )
}

function getTensorName(data: TensorDataRow) {
    if (data.color_palette_id) return `color_palette_${data.color_palette_id}`
    if (data.custom_id) return `custom_${data.custom_id}`
    if (data.pose_id) return `pose_${data.pose_id}`
    if (data.scribble_id) return `scribble_${data.scribble_id}`
    if (data.depth_map_id) return `depth_map_${data.depth_map_id}`
    if (data.mask_id) return `binary_mask_${data.mask_id}`
    if (data.tensor_id) return `tensor_history_${data.tensor_id}`
    return "unknown"
}

function PreviewCell(props: CellProps<TensorHistoryNodeRow>) {
    const { item, ...restProps } = props
    console.log(item)

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

function getColumns(data: Record<string, unknown>[]) {
    const keys = new Set<string>()
    for (const row of data) {
        // const itemKeys = getKeyPaths(row)
        // if (!itemKeys) continue
        for (const key of Object.keys(row)) {
            keys.add(key)
        }
    }
    return Array.from(keys)
}

function getValue(data: Record<string, unknown>, key: string) {
    const keys = key.split(".")
    let value = data
    for (const k of keys) {
        value = value[k]
    }
    return JSON.stringify(value, null, 2)
}
