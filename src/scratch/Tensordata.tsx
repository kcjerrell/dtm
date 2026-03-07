import { Box, Button, Grid, Menu, Portal, useMenu } from "@chakra-ui/react"
import { proxy, useSnapshot } from "valtio"
import { CheckRoot, Panel } from "@/components"

const store = proxy({
    a: 0,
    b: 0,
    c: 0,
})

function Empty() {
    const snap = useSnapshot(store)
    const menu = useMenu()

    return (
        <CheckRoot width={"full"} height={"full"}>
            <Panel margin={"auto"} alignSelf={"center"}>
                <Menu.RootProvider value={menu}>
                    <Menu.ContextTrigger
                        as={"div"}
                        // onContextMenu={(e) => e.stopPropagation()}
                        // onContextMenuCapture={(e) => e.stopPropagation()}
                    >
                        <Grid
                            width={"full"}
                            height={"full"}
                            justifyContent={"center"}
                            templateColumns={"1fr 1fr 1fr"}
                            gap={2}
                            alignItems={"center"}
                            position={"relative"}
                            onContextMenu={(e) => {
                                return
                                e.preventDefault()
                                e.stopPropagation()
                                const target = e.currentTarget
                                console.log(target)
                                menu.api.setOpen(true)
                                menu.api.reposition({
                                    // getAnchorElement: () => {
                                    //     console.log("getAnchorElement", target)
                                    //     return target
                                    // },
                                    getAnchorRect: () => ({
                                        x: e.clientX,
                                        y: e.clientY,
                                        width: 0,
                                        height: 0,
                                    }),
                                    offset: { mainAxis: 0, crossAxis: 0 },
                                    strategy: "fixed",
                                    placement: "bottom-start",
                                })
                            }}
                        >
                            <Button
                                onClick={() => store.a++}
                                onContextMenu={() => {
                                    store.a = 1
                                }}
                            >
                                A
                            </Button>
                            {/* </Menu.ContextTrigger> */}
                            <Box>{snap.a}</Box>
                            <Box></Box>
                            {/* <Menu.ContextTrigger asChild> */}
                            <Button
                                onClick={() => store.b++}
                                onContextMenu={() => {
                                    store.a = 2
                                }}
                            >
                                B
                            </Button>
                            {/* </Menu.ContextTrigger> */}
                            <Box>{snap.b}</Box>
                            <Box></Box>
                            {/* <Menu.ContextTrigger asChild> */}
                            <Button
                                onClick={() => store.c++}
                                onContextMenu={() => {
                                    store.a = 3
                                }}
                            >
                                C
                            </Button>
                            <Box>{snap.c}</Box>
                            <Box></Box>
                        </Grid>
                    </Menu.ContextTrigger>
                    <Portal>
                        <Menu.Positioner>
                            <Menu.Content>
                                <Menu.Item value="new-txt">New Text File {snap.a}</Menu.Item>
                                <Menu.Item value="new-file">New File...</Menu.Item>
                                <Menu.Item value="new-win">New Window</Menu.Item>
                                <Menu.Item value="open-file">Open File...</Menu.Item>
                                <Menu.Item value="export">Export</Menu.Item>
                            </Menu.Content>
                        </Menu.Positioner>
                    </Portal>
                </Menu.RootProvider>
            </Panel>
        </CheckRoot>
    )
}

export default Empty
