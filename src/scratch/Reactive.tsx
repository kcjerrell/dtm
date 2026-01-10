import { Box, Button, Grid } from "@chakra-ui/react"
import { proxy, useSnapshot } from "valtio"
import { CheckRoot, Panel } from "@/components"
import { computed } from "valtio-reactive"

const store = proxy({
    a: 0,
    b: 0,
    c: 0,
})

function log(msg: string) {
    console.log(msg)
}

const preSum = computed({
    a: () => {
        const { a, b, c } = store
        return { a, b, c }
    },
})

const preDoubleA = computed({
    a: () => store.a,
})

const something = computed({
    sum: () => {
        log("sum computed")
        return preSum.a + preSum.b + preSum.c
    },
    doubleA: () => {
        log("doubleA computed")
        return preDoubleA.a * 2
    },
})

function Empty() {
    const snap = useSnapshot(store)
    const snap2 = useSnapshot(something)
    // const snaplog = useSnapshot(logproxy)
    console.log(snap2)
    return (
        <CheckRoot display={"flex"} flexDir={"row"} width={"full"} height={"full"}>
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
                    <Box>{snap2.sum}</Box>
                    <Button onClick={() => store.b++}>B</Button>
                    <Box>{snap.b}</Box>
                    <Box></Box>
                    <Button onClick={() => store.c++}>C</Button>
                    <Box>{snap.c}</Box>
                </Grid>
            </Panel>
            <Panel margin={"auto"} alignSelf={"center"}>
                {/* <Box whiteSpace={"pre"}>{snaplog.log.join("\n")}</Box> */}
            </Panel>
        </CheckRoot>
    )
}

export default Empty
