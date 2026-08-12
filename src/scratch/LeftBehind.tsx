import { Box, Button, Grid, HStack, Input } from "@chakra-ui/react"
import { invoke } from "@tauri-apps/api/core"
import { proxy, useSnapshot } from "valtio"
import { ArchivePlan } from "@/commands"
import urls from "@/commands/urls"
import { CheckRoot, Panel } from "@/components"
import TensorThumbnail from "@/dtProjects/detailsOverlay/TensorThumbnail"

const store = proxy({
    project: "",
    items: undefined as ArchivePlan | undefined,
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
                    templateColumns={"repeat(1fr,5)"}
                    gap={2}
                    alignItems={"center"}
                >
                    <HStack gridColumn={"1 / span 5"}>
                        <Input
                            value={snap.project}
                            onChange={(e) => (store.project = e.target.value)}
                            flex={"1 1 auto"}
                            placeholder={"Project id"}
                        />
                        <Button
                            flex={"0 1 auto"}
                            onClick={async () => {
                                const start = performance.now()
                                store.items = await invoke("create_dt_archive_plan", {
                                    projectId: Number.parseInt(store.project, 10),
                                })
                                console.log(performance.now() - start)
                            }}
                        >
                            Load
                        </Button>
                        <Button
                            flex={"0 1 auto"}
                            onClick={async () => {
                                const start = performance.now()
                                store.items = await invoke("create_dt_archive", {
                                    projectId: Number.parseInt(store.project, 10),
                                })
                                const end = performance.now()
                                console.log(`create_dt_archive took ${end - start} ms`)
                            }}
                        >
                            Do it
                        </Button>
                    </HStack>
                    {snap.items?.unused_tensors.map((item) => {
                        return (
                            <TensorThumbnail
                                key={item}
                                projectId={Number(snap.project)}
                                tensorId={item}
                                width={"100px"}
                                height={"100px"}
                            />
                            // <Box key={item}>
                            //     <img
                            //         src={urls.tensor(parseInt(snap.project, 10), item, {
                            //             size: 100,
                            //         })}
                            //         width={100}
                            //         height={100}
                            //         alt={item}
                            //     />
                            // </Box>
                        )
                    })}
                </Grid>
            </Panel>
        </CheckRoot>
    )
}

export default Empty
