import { Box, Button, Grid } from "@chakra-ui/react"
import { useRef, useState } from "react"
import { Fragment } from "react/jsx-runtime"
import { CheckRoot, Panel } from "@/components"
import { useFlag } from "@/state/settings"

function Empty() {
    const [flags, setFlags] = useState(["hello_flag", "another_flag"])
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
                    {flags.map((flag, i) => (
                        <Item key={flag} flagName={flag} col={2 * i + 1} />
                    ))}

                    <Button
                        gridColumn={"1 / span 4"}
                        onClick={() => {
                            setFlags(["hello_flag"])
                        }}
                    >
                        Add
                    </Button>
                </Grid>
            </Panel>
        </CheckRoot>
    )
}

function Item(props: { row?: number; col: number; flagName: string }) {
    const { row, col, flagName } = props

    const [flag, setFlag] = useFlag(flagName)

    const renderCountRef = useRef(0)
    renderCountRef.current += 1

    return (
        <Fragment key={flagName}>
            <Box gridColumn={col} gridRow={row}>
                {flagName} {String(flag)} ({renderCountRef.current})
            </Box>
            <Button
                gridColumn={col + 1}
                gridRow={row}
                onClick={() => {
                    setFlag(!flag)
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
