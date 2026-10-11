import { Box, Button, Grid } from "@chakra-ui/react"
import { Fragment } from "react/jsx-runtime"
import { useSnapshot } from "valtio"
import { CheckRoot, Panel } from "@/components"
import { addItem, useCollection } from "@/state/mediaStore/scratch"
import MediaStore from "@/state/mediaStore"

await MediaStore.waitForReady()

function Empty() {
    return (
        <CheckRoot width={"full"} height={"full"}>
            <Panel margin={"auto"} alignSelf={"center"}>
                <Grid
                    width={"full"}
                    height={"full"}
                    justifyContent={"center"}
                    templateColumns={"1fr 1fr 1fr 1fr"}
                    gap={2}
                    alignItems={"center"}
                >
                    <Computed key={"ic"} cid={"ic"} col={1} />
                    <Computed key={"md"} cid={"md"} col={3} />

                    <Button gridColumn={"1 / span 4"} onClick={() => addItem()}>
                        Add
                    </Button>
                </Grid>
            </Panel>
        </CheckRoot>
    )
}

function Computed(props) {
    const cid = props.cid
    console.log(cid, "render")

    const state = useCollection(cid)
    const snap = useSnapshot(state)
    // const snap = state
    const count = snap.items.length
    console.log(state)

    return (
        <Fragment>
            {Array.from({ length: count }).map((_, i) => (
                <Item key={state.items[i].id} state={state.items[i]} cid={cid} row={i + 1} col={props.col} />
            ))}
        </Fragment>
    )
}

function Item(props) {
    const { state, cid, row, col } = props
    const snap = useSnapshot(state)
    // const snap = state

    return (
        <Fragment key={snap.id}>
            <Box gridColumn={col} gridRow={row}>
                {snap.name} {snap.pin}
            </Box>
            <Button
                gridColumn={col + 1}
                gridRow={row}
                onClick={() => {
                    state.pin += 1
                    // const source = state.items.find((it) => it.id === item.id)
                    // source.collection[cid].pin += 1
                }}
            >
                Click
            </Button>
        </Fragment>
    )
}

export default Empty
