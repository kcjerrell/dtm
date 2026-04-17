import { Box, Table } from "@chakra-ui/react"
import { useEffect } from "react"
import { DtpService, type ImageExtra } from "@/commands"
import { useProxyRef } from "@/hooks/valtioHooks"
import { invoke } from "@tauri-apps/api/core"

interface ExplorerProps extends ChakraProps {
    projectId: number
}

function Explorer(props: ExplorerProps) {
    const { projectId, ...restProps } = props

    const { state, snap } = useProxyRef(() => ({ data: [] as ImageExtra[] }))

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
                    <Table.ColumnHeader>id</Table.ColumnHeader>
                    <Table.ColumnHeader>model</Table.ColumnHeader>
                    <Table.ColumnHeader>prompt</Table.ColumnHeader>
                    <Table.ColumnHeader>prompt</Table.ColumnHeader>
                </Table.Header>

                <Table.Body>
                    {snap.data.map((row) => (
                        <Table.Row key={row.id}>
                            <Table.Cell>{row.rowid}</Table.Cell>
                            <Table.Cell>{row.lineage}</Table.Cell>
                            <Table.Cell>{row.logical_time}</Table.Cell>
                            <Table.Cell>{row.data.text_prompt}</Table.Cell>
                        </Table.Row>
                    ))}
                </Table.Body>
            </Table.Root>
        </Box>
    )
}

export default Explorer
