import { Box, Button, Grid, HStack, Input, VStack } from "@chakra-ui/react"
import { invoke } from "@tauri-apps/api/core"
import { proxy, useSnapshot } from "valtio"
import urls from "@/commands/urls"
import { CheckRoot, Panel } from "@/components"

const store = proxy({
    imageId: "",
    items: [] as { image_id: number; distance: number }[],
})

function EmbeddingPage() {
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
                            value={snap.imageId}
                            onChange={(e) => (store.imageId = e.target.value)}
                            flex={"1 1 auto"}
                            placeholder={"Image id"}
                        />
                        <Button
                            flex={"0 1 auto"}
                            onClick={async () => {
                                store.items = await invoke("dtp_get_embedding", {
                                    imageId: Number.parseInt(store.imageId, 10),
                                })
                            }}
                        >
                            Search
                        </Button>
                    </HStack>
                    {snap.items.map((item) => {
                        return (
                            <VStack key={item.image_id} width={"100%"}>
                                <img
                                    src={`dtm://dtm_pdb/thumb/${item.image_id}`}
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                    }}
                                    alt={item.image_id.toString()}
                                />
                                <Box>{item.distance}</Box>
                            </VStack>
                        )
                    })}
                </Grid>
            </Panel>
        </CheckRoot>
    )
}

export default EmbeddingPage
