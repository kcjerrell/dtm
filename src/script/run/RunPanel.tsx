import { Button, HStack, Stack, Text } from "@chakra-ui/react"
import { useId, useState } from "react"
import { useSnapshot } from "valtio"
import type { ScriptRunController } from "./controller"

export const TRUST_WARNING =
    "Only run scripts you trust. Scripts run with your account's access to files, network, and other programs. Bun does not sandbox scripts."

/** The workspace prepares/validates a snapshot in onRun and calls controller.run.
 * It also displays any save/analysis errors from that preparation. */
export function ScriptRunPanel({
    controller,
    onRun,
    canRun = true,
}: {
    controller: ScriptRunController
    onRun: () => void
    canRun?: boolean
}) {
    const snap = useSnapshot(controller.state)
    const [acknowledged, setAcknowledged] = useState(false)
    const warningId = useId()
    return (
        <Stack role="region" aria-label="Script execution" gap={3}>
            <Text role="status" aria-live="polite">
                Run status: {snap.phase}
            </Text>
            <Text>Trust: {snap.trust}</Text>
            {snap.trust !== "trusted" && (
                <Stack gap={2}>
                    <Text id={warningId}>{TRUST_WARNING}</Text>
                    <label>
                        <input
                            type="checkbox"
                            checked={acknowledged}
                            aria-describedby={warningId}
                            disabled={snap.trust === "pending"}
                            onChange={(event) => setAcknowledged(event.target.checked)}
                        />{" "}
                        I understand and trust this script
                    </label>
                    <Button
                        alignSelf="start"
                        disabled={!acknowledged || snap.trust === "pending"}
                        onClick={() => {
                            void controller.trust(acknowledged)
                        }}
                    >
                        {snap.trust === "pending" ? "Trusting script…" : "Trust this script"}
                    </Button>
                </Stack>
            )}
            <HStack>
                <Button
                    disabled={
                        snap.trust !== "trusted" || !canRun || snap.admitting || snap.stopping
                    }
                    onClick={onRun}
                >
                    Run
                </Button>
                <Button
                    disabled={!snap.active || snap.stopping}
                    onClick={() => {
                        void controller.stop()
                    }}
                >
                    {snap.stopping ? "Stopping…" : "Stop"}
                </Button>
            </HStack>
            {snap.error && <Text role="alert">{snap.error}</Text>}
            {snap.trust === "trusted" && snap.phase === "failed" && (
                <Button
                    alignSelf="start"
                    variant="outline"
                    onClick={() => {
                        controller.invalidateTrust()
                        setAcknowledged(false)
                    }}
                >
                    Review trust
                </Button>
            )}
        </Stack>
    )
}

export function ScriptProblems({ controller }: { controller: ScriptRunController }) {
    const snap = useSnapshot(controller.state)
    const problems = [...snap.editorProblems, ...snap.runtimeProblems]
    return (
        <Stack role="region" aria-label="Script problems" gap={2}>
            <Text fontWeight="bold">Problems</Text>
            {problems.length === 0 ? (
                <Text>No problems.</Text>
            ) : (
                <ul>
                    {problems.map((problem) => (
                        <li
                            key={`${problem.source}-${problem.severity}-${problem.code ?? ""}-${problem.message}`}
                        >
                            {problem.severity} · {problem.source}
                            {problem.code ? ` (${problem.code})` : ""}: {problem.message}
                        </li>
                    ))}
                </ul>
            )}
        </Stack>
    )
}

export function ScriptLogs({ controller }: { controller: ScriptRunController }) {
    const snap = useSnapshot(controller.state)
    return (
        <Stack role="region" aria-label="Script logs" gap={2}>
            <Text fontWeight="bold">Logs</Text>
            <Text
                as="pre"
                maxHeight="18rem"
                overflow="auto"
                whiteSpace="pre-wrap"
                overflowWrap="anywhere"
                aria-label="Run output"
            >
                {snap.logs.length
                    ? snap.logs.map((entry) => `[${entry.stream}] ${entry.message}`).join("")
                    : "No logs."}
            </Text>
            {snap.logsTruncated && <Text role="status">Logs truncated at the display limit.</Text>}
        </Stack>
    )
}
