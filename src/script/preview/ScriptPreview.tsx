import { Image, Stack, Text } from "@chakra-ui/react"
import { useSnapshot } from "valtio"
import { type ScriptRunController, sameRevisions } from "../run/controller"

/** The service owns the last-good output lease. Do not revoke its URL when a new
 * run starts or fails; S40 keeps the registry alive for the workspace lifetime. */
export function ScriptPreview({ controller }: { controller: ScriptRunController }) {
    const snap = useSnapshot(controller.state)
    const preview = snap.preview
    const stale = Boolean(preview && snap.desired && !sameRevisions(preview.identity, snap.desired))
    return (
        <Stack role="region" aria-label="Script preview" gap={2}>
            {preview ? (
                <>
                    <Text role="status">
                        {stale ? "Stale preview" : "Last successful preview"} · source{" "}
                        {preview.identity.sourceRevision}, values {preview.identity.valueRevision},
                        inputs {preview.identity.inputRevision}
                    </Text>
                    <Image
                        src={preview.output.previewUrl}
                        alt="Script output"
                        objectFit="contain"
                        maxWidth="100%"
                        maxHeight="100%"
                    />
                </>
            ) : (
                <Text>No successful output yet.</Text>
            )}
        </Stack>
    )
}
