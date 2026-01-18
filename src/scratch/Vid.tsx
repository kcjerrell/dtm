import { Box, Button, Grid } from "@chakra-ui/react"
import { listen } from "@tauri-apps/api/event"
import { useEffect } from "react"
import { proxy, useSnapshot } from "valtio"
import * as vid from "@/commands/vid"
import { CheckRoot, Panel } from "@/components"

const store = proxy({
    a: undefined as boolean | undefined,
    progress: 0,
    total: 0,
    received: 0,
    downloadResult: undefined,
    callResult: "",
})

function Empty() {
    const snap = useSnapshot(store)

    useEffect(() => {
        listen("ffmpeg_download_progress", (e) => {
            store.progress = e.payload.progress
            store.total = e.payload.total
            store.received = e.payload.received
        })
    }, [])

    return (
        <CheckRoot width={"full"} height={"full"}>
            <Panel margin={"auto"} alignSelf={"center"}>
                <Grid
                    width={"full"}
                    height={"full"}
                    justifyContent={"center"}
                    templateColumns={"1fr 1fr 1fr"}
                    gap={2}
                    alignItems={"center"}
                >
                    <Button
                        onClick={async () => {
                            const res = await vid.ffmpegCheck()
                            store.a = res
                        }}
                    >
                        A
                    </Button>
                    <Box>{`Check: ${snap.a}`}</Box>
                    <Box></Box>
                    <Button
                        onClick={async () => {
                            store.downloadResult = await vid.ffmpegDownload()
                        }}
                    >
                        B
                    </Button>
                    <Box>{`Progress: ${snap.progress}, Total: ${snap.total}, Received: ${snap.received}`}</Box>
                    <Box>{`Result: ${snap.downloadResult}`}</Box>
                    <Button
                        onClick={async () => {
                            store.callResult = await vid.ffmpegCall(["-version"])
                        }}
                    >
                        C
                    </Button>
                    <Box>{snap.callResult}</Box>
                    <Box></Box>
                </Grid>
            </Panel>
        </CheckRoot>
    )
}

export default Empty
