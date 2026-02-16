import { motion } from "motion/react"
import { CheckRoot, Panel } from "@/components"
import { Button, Grid, Text, VStack } from "@chakra-ui/react"
import { Channel, invoke } from "@tauri-apps/api/core"
import { useRef } from "react"
import { useProxyRef } from "@/hooks/valtioHooks"
import { ProjectExtra } from "@/generated/types"

function Empty() {
    const channel = useRef<Channel>(null)

    const { state, snap } = useProxyRef(() => ({
        events: [] as unknown[],
        projects: [] as ProjectExtra[],
    }))

    return (
        <CheckRoot width={"full"} height={"full"} padding={8}>
            <Panel
                width={"full"}
                height={"full"}
                justifyContent={"center"}
                alignItems={"center"}
                asChild
            >
                <Grid templateColumns={"repeat(2, 1fr)"} gap={6}>
                    <Button
                        onClick={() => {
                            channel.current = new Channel()
                            channel.current.onmessage = (event) => {
                                state.events.push(event)
                            }
                            invoke("dtp_connect", { channel: channel.current })
                        }}
                    >
                        Connect
                    </Button>
                    <VStack>
                        {snap.events.map((event, index) => (
                            <Text key={`event_${index}`}>{JSON.stringify(event)}</Text>
                        ))}
                    </VStack>
                    <Button
                        onClick={async () => {
                            state.projects = await invoke("dtp_list_projects")
                        }}
                    >
                        List Projects
                    </Button>
                    <VStack>
                        {snap.projects.map((project, index) => (
                            <Text key={`project_${index}`}>{project.name}</Text>
                        ))}
                    </VStack>
                </Grid>
            </Panel>
        </CheckRoot>
    )
}

export default Empty
