import { Box, Button, HStack, Input, Stack, Text } from "@chakra-ui/react"
import type { FormEvent } from "react"
import { useSnapshot } from "valtio"
import { useProxyRef } from "@/hooks/valtioHooks"
import type { ProjectId } from "../contracts"
import type { InstallPhase, LifecycleApproval } from "./adapters"
import type { ScriptPackageController } from "./controller"

const phaseLabels: Record<InstallPhase, string> = {
    preparing: "Preparing package install…",
    installing: "Installing packages…",
    lifecycleScripts: "Running approved install scripts…",
    verifying: "Verifying locked packages…",
    complete: "Package operation complete.",
    cancelled: "Package operation cancelled.",
    failed: "Package operation failed.",
}

export function ScriptPackagePanel({
    controller,
    projectId,
    canChange,
}: {
    controller: ScriptPackageController
    projectId: ProjectId
    canChange: boolean
}) {
    const snap = useSnapshot(controller.state)
    const { state, snap: form } = useProxyRef(() => ({ name: "", version: "" }), { sync: true })
    const { status, operation } = snap
    const blocked = !canChange || snap.loading || snap.loadingTypes || Boolean(operation) || !status
    const deps = Object.entries(status?.dependencies ?? {}).sort(([a], [b]) => a.localeCompare(b))
    const install = async (event: FormEvent) => {
        event.preventDefault()
        const name = state.name.trim()
        const version = state.version.trim()
        if (!status || blocked || !name || !version) return
        if (
            await controller.set(projectId, status.revision, {
                ...status.dependencies,
                [name]: version,
            })
        ) {
            state.name = ""
            state.version = ""
        }
    }

    return (
        <Box as="details" role="region" aria-label="Script packages">
            <Box as="summary" fontWeight="semibold" fontSize="sm" cursor="pointer">
                Packages
                {deps.length > 0 && ` (${deps.length})`}
                {operation && " · working"}
                {!operation && snap.statusError && " · unavailable"}
                {!operation && status?.revision && !status.installed && " · restore needed"}
            </Box>
            <Stack mt={2} gap={2} fontSize="sm">
                {snap.loading && <Text role="status">Loading packages…</Text>}
                {snap.statusError && <Text role="alert">{snap.statusError}</Text>}
                {status?.revision && !status.installed && (
                    <Text role="status">Restore the locked packages to run this script.</Text>
                )}
                {status && deps.length === 0 && <Text>No dependencies installed.</Text>}
                {deps.length > 0 && (
                    <Stack as="ul" gap={1}>
                        {deps.map(([name, version]) => (
                            <HStack as="li" key={name} justify="space-between">
                                <Text>
                                    {name}@{version}
                                </Text>
                                <Button
                                    size="xs"
                                    variant="ghost"
                                    aria-label={`Remove ${name}`}
                                    disabled={blocked}
                                    onClick={() => {
                                        if (status)
                                            void controller.set(
                                                projectId,
                                                status.revision,
                                                Object.fromEntries(
                                                    deps.filter(([other]) => other !== name),
                                                ),
                                            )
                                    }}
                                >
                                    Remove
                                </Button>
                            </HStack>
                        ))}
                    </Stack>
                )}
                {status && (
                    <Stack as="form" gap={1} onSubmit={(event) => void install(event)}>
                        <HStack>
                            <Input
                                aria-label="Package name"
                                placeholder="Package name"
                                size="xs"
                                value={form.name}
                                disabled={blocked}
                                onChange={(event) => {
                                    state.name = event.target.value
                                }}
                            />
                            <Input
                                aria-label="Exact package version"
                                placeholder="Exact version"
                                size="xs"
                                width="7rem"
                                value={form.version}
                                disabled={blocked}
                                onChange={(event) => {
                                    state.version = event.target.value
                                }}
                            />
                        </HStack>
                        <Button
                            type="submit"
                            size="xs"
                            alignSelf="start"
                            disabled={blocked || !form.name.trim() || !form.version.trim()}
                        >
                            Install package
                        </Button>
                    </Stack>
                )}
                {status?.revision && (
                    <>
                        <Button
                            size="xs"
                            alignSelf="start"
                            variant="outline"
                            disabled={blocked}
                            onClick={() => {
                                if (status.revision)
                                    void controller.restore(projectId, status.revision)
                            }}
                        >
                            Restore packages
                        </Button>
                        {status.lockFingerprint && (
                            <LifecycleRestore
                                key={status.revision}
                                names={deps.map(([name]) => name)}
                                lockFingerprint={status.lockFingerprint}
                                disabled={blocked}
                                onRestore={(approval) => {
                                    if (status.revision)
                                        void controller.restore(
                                            projectId,
                                            status.revision,
                                            approval,
                                        )
                                }}
                            />
                        )}
                    </>
                )}
                {operation && (
                    <Stack gap={1}>
                        <Text role="status">
                            {operation.projectId === projectId
                                ? phaseLabels[operation.phase]
                                : "Package operation in another project."}
                        </Text>
                        <Button
                            size="xs"
                            alignSelf="start"
                            variant="outline"
                            disabled={operation.cancelling || operation.phase === "complete"}
                            onClick={() => void controller.cancel()}
                        >
                            {operation.cancelling
                                ? "Cancelling package install…"
                                : "Cancel package install"}
                        </Button>
                        {operation.projectId === projectId && operation.messages && (
                            <Text as="pre" whiteSpace="pre-wrap" maxHeight="6rem" overflowY="auto">
                                {operation.messages}
                            </Text>
                        )}
                    </Stack>
                )}
                {snap.cancelled && <Text role="status">Package operation cancelled.</Text>}
                {snap.operationError && <Text role="alert">{snap.operationError}</Text>}
                {snap.loadingTypes && <Text role="status">Loading package declarations…</Text>}
                {snap.declarationTruncated && (
                    <Text role="status">
                        The editor reached its limit for package declarations. Some types may be
                        unavailable.
                    </Text>
                )}
                {snap.declarationError && <Text role="alert">{snap.declarationError}</Text>}
                {(snap.statusError || snap.declarationError) && (
                    <Button
                        size="xs"
                        alignSelf="start"
                        variant="outline"
                        disabled={snap.loading || operation?.projectId === projectId}
                        onClick={() => void controller.refresh()}
                    >
                        Refresh packages
                    </Button>
                )}
            </Stack>
        </Box>
    )
}

function LifecycleRestore({
    names,
    lockFingerprint,
    disabled,
    onRestore,
}: {
    names: readonly string[]
    lockFingerprint: string
    disabled: boolean
    onRestore(approval: LifecycleApproval): void
}) {
    const { state, snap } = useProxyRef(() => ({ packages: [] as string[], approve: false }))
    return (
        <Box as="details">
            <Box as="summary" cursor="pointer">
                Install script approval
            </Box>
            <Stack gap={1} mt={1}>
                <Text>
                    Install scripts can access your files and network. Approval covers every
                    occurrence of the selected names in the current lockfile for one restore.
                </Text>
                {names.map((name) => (
                    <label key={name}>
                        <input
                            type="checkbox"
                            checked={snap.packages.includes(name)}
                            disabled={disabled}
                            onChange={(event) => {
                                state.packages = event.target.checked
                                    ? [...state.packages, name]
                                    : state.packages.filter((selected) => selected !== name)
                                state.approve = false
                            }}
                        />{" "}
                        {name}
                    </label>
                ))}
                <label>
                    <input
                        type="checkbox"
                        checked={snap.approve}
                        disabled={disabled || snap.packages.length === 0}
                        onChange={(event) => {
                            state.approve = event.target.checked
                        }}
                    />{" "}
                    I approve these install scripts for this restore
                </label>
                <Button
                    size="xs"
                    alignSelf="start"
                    variant="outline"
                    disabled={disabled || !snap.approve || snap.packages.length === 0}
                    onClick={() => {
                        if (!state.approve || !state.packages.length) return
                        const packages = [...state.packages]
                        state.approve = false
                        onRestore({ lockFingerprint, packages })
                    }}
                >
                    Restore with approved scripts
                </Button>
            </Stack>
        </Box>
    )
}
