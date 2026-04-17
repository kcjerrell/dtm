import { Box, Table } from "@chakra-ui/react"
import { useEffect, useMemo } from "react"
import { DtpService, type ImageExtra } from "@/commands"
import { useProxyRef } from "@/hooks/valtioHooks"
import { invoke } from "@tauri-apps/api/core"
import { getKeyPaths } from "@/utils/helpers"

interface ExplorerProps extends ChakraProps {
    projectId: number
}

function Explorer(props: ExplorerProps) {
    const { projectId, ...restProps } = props

    const { state, snap } = useProxyRef(() => ({ data: [] as ImageExtra[] }))
    const columns = useMemo(() => getColumns(snap.data), [snap.data])

    useEffect(() => {
        invoke("dtp_dt_list_tensor_history_node", { projectId, skip: 0, take: 100 }).then((res) => {
            state.data = res ?? []
            console.log(res[0])
        })
    }, [projectId, state])

    return (
        <Box {...restProps}>
            <Table.Root>
                <Table.Header>
                    {columns.map((col) => (
                        <Table.ColumnHeader key={col}>{col.split(".").pop()}</Table.ColumnHeader>
                    ))}
                </Table.Header>

                <Table.Body>
                    {snap.data.map((row) => (
                        <Table.Row key={row.id}>
                            {columns.map((col) => (
                                <Table.Cell key={col}>{getValue(row, col)}</Table.Cell>
                            ))}
                        </Table.Row>
                    ))}
                </Table.Body>
            </Table.Root>
        </Box>
    )
}

export default Explorer

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
