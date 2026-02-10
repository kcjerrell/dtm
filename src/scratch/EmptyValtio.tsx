import { Box, Button, Grid } from "@chakra-ui/react"
import { proxy, useSnapshot } from "valtio"
import { CheckRoot, Panel } from "@/components"

const store = proxy({
    a: 0,
    b: 0,
    c: 0,
})

function Empty() {
    const snap = useSnapshot(store)

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
                    <Button onClick={() => store.a++}>A</Button>
                    <Box>{snap.a}</Box>
                    <Box></Box>
                    <Button onClick={() => store.b++}>B</Button>
                    <Box>{snap.b}</Box>
                    <Box></Box>
                    <Button onClick={() => store.c++}>C</Button>
                    <Box>{snap.c}</Box>
                    <Box></Box>
                </Grid>
            </Panel>
        </CheckRoot>
    )
}

export default Empty
