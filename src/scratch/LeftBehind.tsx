import { Box, Button, Grid, HStack, Input } from "@chakra-ui/react"
import { proxy, useSnapshot } from "valtio"
import { CheckRoot, Panel } from "@/components"
import { invoke } from "@tauri-apps/api/core"
import urls from "@/commands/urls"

const store = proxy({
    project: "",
    items: [] as string[],
})

function Empty() {
    const snap = useSnapshot(store)

    return (
        <CheckRoot width={"full"} height={"full"}>
            <Panel
                width={"80%"}
                height={"80%"}
                overflowY={"scroll"}
                margin={"auto"}
                alignSelf={"center"}
            >
                <Grid
                    width={"full"}
                    height={"full"}
                    justifyContent={"center"}
                    templateColumns={"1fr 1fr 1fr"}
                    gap={2}
                    alignItems={"center"}
                >
                    <HStack gridColumn={"1 / span 3"}>
                        <Input
                            value={snap.project}
                            onChange={(e) => (store.project = e.target.value)}
                            flex={"1 1 auto"}
                            placeholder={"Project id"}
                        />
                        <Button
                            flex={"0 1 auto"}
                            onClick={async () => {
                                store.items = await invoke("create_dt_archive", {
                                    projectId: Number.parseInt(store.project, 10),
                                })
                            }}
                        >
                            Load
                        </Button>
                    </HStack>
                    {snap.items.map((item) => {
                        return (
                            <Box key={item}>
                                <img
                                    src={urls.tensor(parseInt(snap.project, 10), item, {
                                        size: 100,
                                    })}
                                    width={100}
                                    height={100}
                                    alt={item}
                                />
                            </Box>
                        )
                    })}
                </Grid>
            </Panel>
        </CheckRoot>
    )
}

export default Empty
