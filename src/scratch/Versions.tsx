import { Box, Button, Grid, Input } from "@chakra-ui/react"
import { proxy, useSnapshot } from "valtio"
import { CheckRoot, Panel } from "@/components"
import { useRef } from "react"

class Version {
    constructor(
        public version: string,
        public features: string[] = [],
    ) {}
    toJSON() {
        return {
            version: this.version,
            features: this.features,
        }
    }
    static fromJSON(json: Version) {
        return new Version(json.version, json.features)
    }
}

const versions = [
    "auraflow",
    "flux1",
    "flux2",
    "flux2_4b",
    "flux2_9b",
    "hidream_i1",
    "hunyuan_video",
    "kandinsky2.1",
    "ltx2",
    "ltx2.3",
    "pixart",
    "qwen_image",
    "sd3",
    "sd3_large",
    "sdxl_base_v0.9",
    "sdxl_refiner_v0.9",
    "ssd_1b",
    "svd_i2v",
    "v1",
    "v2",
    "wan_v2.1_1.3b",
    "wan_v2.1_14b",
    "wan_v2.2_5b",
    "wurstchen_v3.0_stage_c",
    "z_image",
]

const store = proxy({
    versions: versions.map((v) => new Version(v)),
    features: [] as string[],
})

async function copyStore() {
    navigator.clipboard.writeText(JSON.stringify(toJSON(store)))
}
async function pasteStore() {
    const text = await navigator.clipboard.readText()
    const json = JSON.parse(text)
    store.versions = json.versions.map(Version.fromJSON)
    store.features = json.features
}

function Empty() {
    const snap = useSnapshot(store)
    const inputRef = useRef<HTMLInputElement>(null)

    return (
        <CheckRoot width={"full"} height={"full"} overflow={"scroll"}>
            <Panel margin={"auto"} alignSelf={"center"}>
                <Grid
                    width={"full"}
                    height={"full"}
                    justifyContent={"center"}
                    templateRows={`repeat(${snap.versions.length + 1}, auto)`}
                    templateColumns={`repeat(${snap.features.length + 1}, auto)`}
                    gap={0.5}
                    alignItems={"center"}
                >
                    <Box></Box>
                    {snap.features.map((f) => (
                        <Box key={f} px={0.5}>{f}</Box>
                    ))}
                    {snap.versions.map((v) => {
                        const versionState = store.versions.find((vv) => vv.version === v.version)
                        if (!versionState) return null
                        return (
                            <>
                                <Box key={v.version}>{v.version}</Box>
                                {snap.features.map((f) => (
                                    <Box
                                        display={"flex"}
                                        alignContent={"center"}
                                        alignItems={"center"}
                                        justifyContent={"center"}
                                        padding={1}
                                        bgColor={"bg.2"}
                                        key={f}
                                        onClick={() => {
                                            if (versionState.features.includes(f)) {
                                                versionState.features =
                                                    versionState.features.filter((x) => x !== f)
                                            } else {
                                                versionState.features.push(f)
                                            }
                                        }}
                                    >
                                        {v.features.includes(f) ? "✓" : "_"}
                                    </Box>
                                ))}
                            </>
                        )
                    })}
                </Grid>
                <Button onClick={copyStore}>Copy</Button>
                <Button onClick={pasteStore}>Paste</Button>
                <Input ref={inputRef} />
                <Button
                    onClick={() => {
                        const v = inputRef.current?.value
                        if (v) {
                            store.features.push(v)
                            inputRef.current.value = ""
                        }
                    }}
                >
                    Add
                </Button>
            </Panel>
        </CheckRoot>
    )
}

export default Empty
