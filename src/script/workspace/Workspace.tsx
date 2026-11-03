import { Box, Button, Flex, HStack, Input, Stack, Text } from "@chakra-ui/react"
import { invoke } from "@tauri-apps/api/core"
import * as monaco from "monaco-editor/editor/editor.api.js"
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react"
import { useSnapshot } from "valtio"
import type { ProjectId, ScriptDiagnostic } from "../contracts"
import { GeneratedControls } from "../controls"
import { ScriptEditorSession } from "../editor/modelRegistry"
import { createScriptModelRegistry } from "../editor/monacoApi"
import { createWorkerAnalysisClient } from "../editor/workerAnalysisClient"
import { ScriptPreview } from "../preview"
import { createLocalProjectSessionStorage, createProjectEditorBindings } from "../project"
import { ScriptLogs, ScriptProblems, ScriptRunPanel } from "../run"
import { redactLocalPaths } from "../run/presentation"
import {
    projectCommands,
    revokeScriptInput,
    runCommands,
    runEvents,
    scriptInputSelector,
    scriptPreviewUrl,
} from "./adapters"
import { controlsReady, ScriptWorkspaceController, type WorkspaceProject } from "./controller"

export default function ScriptWorkspace(props: ChakraProps) {
    const editorHost = useRef<HTMLDivElement>(null)
    const resourceId = useRef<number | undefined>(undefined)
    const setImageId = useCallback((id: number | undefined) => {
        resourceId.current = id
    }, [])
    const [opened, setOpened] = useState(true)
    const [workspace, setWorkspace] = useState<ScriptWorkspaceController | null>(null)

    useEffect(() => {
        if (!opened || !editorHost.current) return
        const registry = createScriptModelRegistry()
        const editor = new ScriptEditorSession(
            monaco.editor.create(editorHost.current, {
                model: null,
                automaticLayout: true,
                ariaLabel: "Script source",
                minimap: { enabled: false },
                wordWrap: "on",
                scrollBeyondLastLine: false,
            }),
        )
        const controller = new ScriptWorkspaceController({
            ...createProjectEditorBindings(registry, editor, monaco.Uri),
            session: createLocalProjectSessionStorage(window.localStorage),
            commands: projectCommands,
            run: runCommands,
            events: runEvents,
            analysis: createWorkerAnalysisClient(),
            selectImage: scriptInputSelector(() => resourceId.current),
            revokeInput: revokeScriptInput,
            bindHints: (controls) => controls.bindInlayHints(monaco),
            disposeEditor: () => {
                editor.dispose()
                registry.dispose()
            },
        })
        const updateTypeScriptProblems = (uris?: readonly monaco.Uri[]) => {
            const project = controller.getProject(controller.projects.state.currentProjectId)
            if (
                project &&
                (!uris || uris.some((uri) => uri.toString() === project.model.uri.toString()))
            )
                controller.setTypeScriptProblems(project, typeScriptProblems(project.model.uri))
        }
        const markers = monaco.editor.onDidChangeMarkers(updateTypeScriptProblems)
        const model = editor.editor.onDidChangeModel(() => updateTypeScriptProblems())
        setWorkspace(controller)
        void controller.projects.initialize().catch(() => {})
        return () => {
            markers.dispose()
            model.dispose()
            void controller.dispose().catch(() => {})
        }
    }, [opened])

    return (
        <Stack {...props} width="100%" minW={0} minH={0} overflow="hidden" bg="bg" gap={0}>
            {!opened ? (
                <Button alignSelf="start" m={3} onClick={() => setOpened(true)}>
                    Open Image Scripts
                </Button>
            ) : (
                <>
                    {workspace && (
                        <ProjectBar
                            workspace={workspace}
                            close={async () => {
                                await workspace.dispose()
                                resourceId.current = undefined
                                setWorkspace(null)
                                setOpened(false)
                            }}
                        />
                    )}
                    <Flex flex="1" minH={0} minW={0}>
                        <Box ref={editorHost} flex="1 1 55%" minW={0} overflow="hidden" />
                        {workspace && <Inspector workspace={workspace} setImageId={setImageId} />}
                    </Flex>
                </>
            )}
        </Stack>
    )
}

function ProjectBar({
    workspace,
    close,
}: {
    workspace: ScriptWorkspaceController
    close(): Promise<void>
}) {
    const snap = useSnapshot(workspace.projects.state)
    const state = useSnapshot(workspace.state)
    const [name, setName] = useState("")
    const [actionError, setActionError] = useState<string | null>(null)
    const [editingName, setEditingName] = useState(false)
    const current = snap.currentProjectId
    const project = snap.projects.find(({ projectId }) => projectId === current)
    const document = current ? snap.documents[current] : undefined
    const blocked = snap.loading || state.closing

    const act = (action: () => Promise<void>) => {
        setActionError(null)
        void action().catch((error) => {
            setActionError(redactLocalPaths(error instanceof Error ? error.message : String(error)))
        })
    }
    const create = (event: FormEvent) => {
        event.preventDefault()
        if (!name.trim()) return
        act(async () => {
            await workspace.create(name.trim())
            setName("")
        })
    }

    return (
        <Stack borderBottomWidth="1px" p={2} gap={2}>
            <HStack gap={2} flexWrap="wrap">
                <Text fontWeight="bold">Image Scripts</Text>
                <Box as="label" fontSize="sm">
                    Project{" "}
                    <select
                        aria-label="Script project"
                        value={current ?? ""}
                        disabled={blocked}
                        onChange={(event) => {
                            const id = event.target.value as ProjectId
                            if (id) act(() => workspace.open(id))
                        }}
                    >
                        <option value="" disabled>
                            Choose a project
                        </option>
                        {snap.projects.map(({ projectId, displayName }) => (
                            <option key={projectId} value={projectId}>
                                {displayName}
                            </option>
                        ))}
                    </select>
                </Box>
                <HStack as="form" gap={1} onSubmit={create}>
                    <Input
                        aria-label="New script project name"
                        placeholder="New project name"
                        size="xs"
                        maxLength={100}
                        width="9rem"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                    <Button type="submit" size="xs" disabled={blocked || !name.trim()}>
                        Create
                    </Button>
                </HStack>
                <Button
                    size="xs"
                    variant="outline"
                    disabled={blocked || !project}
                    onClick={() => setEditingName((value) => !value)}
                >
                    Rename
                </Button>
                <Button
                    size="xs"
                    variant="outline"
                    disabled={blocked || !document?.dirty}
                    onClick={() => act(() => workspace.projects.flush())}
                >
                    {document?.status === "save-error" ? "Retry save" : "Save"}
                </Button>
                <Button
                    size="xs"
                    variant="ghost"
                    disabled={blocked || state.preparing || Boolean(state.owner)}
                    onClick={() => act(close)}
                >
                    Close workspace
                </Button>
            </HStack>
            {editingName && project && (
                <RenameForm
                    key={project.projectId}
                    displayName={project.displayName}
                    onRename={(displayName) =>
                        act(async () => {
                            await workspace.projects.rename(project.projectId, displayName)
                            setEditingName(false)
                        })
                    }
                />
            )}
            {state.owner && state.owner !== current && (
                <HStack>
                    <Text fontSize="sm">A script is running in another project.</Text>
                    <Button
                        size="xs"
                        disabled={state.stopPending}
                        onClick={() => void workspace.stop()}
                    >
                        {state.stopPending ? "Stopping active script…" : "Stop active script"}
                    </Button>
                </HStack>
            )}
            {document && (
                <Text role="status" fontSize="xs">
                    Save status: {document.status}
                </Text>
            )}
            {(actionError || snap.error || state.error || document?.error || snap.sessionError) && (
                <Text role="alert" fontSize="sm" overflowWrap="anywhere">
                    {redactLocalPaths(
                        actionError ||
                            snap.error ||
                            state.error ||
                            document?.error ||
                            snap.sessionError ||
                            "",
                    )}
                </Text>
            )}
            {!current && !snap.loading && (
                <Text fontSize="sm">Create or open a script project to start.</Text>
            )}
        </Stack>
    )
}

function RenameForm({
    displayName,
    onRename,
}: {
    displayName: string
    onRename(name: string): void
}) {
    const [name, setName] = useState(displayName)
    return (
        <HStack
            as="form"
            onSubmit={(event) => {
                event.preventDefault()
                if (name.trim()) onRename(name.trim())
            }}
        >
            <Input
                aria-label="Rename script project"
                size="xs"
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
            />
            <Button size="xs" type="submit" disabled={!name.trim()}>
                Apply name
            </Button>
        </HStack>
    )
}

function Inspector({
    workspace,
    setImageId,
}: {
    workspace: ScriptWorkspaceController
    setImageId(id: number | undefined): void
}) {
    const { currentProjectId } = useSnapshot(workspace.projects.state)
    const project = workspace.getProject(currentProjectId)
    if (!project) return null
    return (
        <ProjectInspector
            key={project.id}
            workspace={workspace}
            project={project}
            setImageId={setImageId}
        />
    )
}

function ProjectInspector({
    workspace,
    project,
    setImageId,
}: {
    workspace: ScriptWorkspaceController
    project: WorkspaceProject
    setImageId(id: number | undefined): void
}) {
    const controls = useSnapshot(project.controls.state)
    const session = useSnapshot(workspace.state)
    const state = useSnapshot(project.state)
    const run = useSnapshot(project.run.state)
    const { loading } = useSnapshot(workspace.projects.state)
    const [images, setImages] = useState<{ id: number; prompt: string }[]>([])
    const [imageError, setImageError] = useState<string | null>(null)
    const [choice, setChoice] = useState("")
    useEffect(() => {
        setImageId(undefined)
    }, [setImageId])

    return (
        <Stack
            flex="0 0 min(45%, 26rem)"
            minW={0}
            minH={0}
            overflowY="auto"
            overflowWrap="anywhere"
            borderLeftWidth="1px"
            p={3}
            gap={4}
        >
            <label>
                <input
                    type="checkbox"
                    role="switch"
                    aria-checked={session.live}
                    checked={session.live}
                    disabled={run.trust !== "trusted" || loading || session.closing}
                    onChange={(event) => workspace.setLive(event.target.checked)}
                />{" "}
                Live run
            </label>
            <ScriptRunPanel
                controller={project.run}
                onRun={() => void workspace.run(project)}
                canRun={
                    state.analysisReady &&
                    controlsReady(controls.controls) &&
                    !loading &&
                    !session.closing &&
                    !session.preparing &&
                    !session.stopPending &&
                    (!session.owner || session.owner === project.id)
                }
            />
            <ScriptPreview controller={project.run} resolveUrl={scriptPreviewUrl} />
            <Button
                size="xs"
                alignSelf="start"
                variant="outline"
                onClick={() => void workspace.analyzeCurrent()}
            >
                Analyze source
            </Button>
            {controls.controls.some(({ descriptor }) => descriptor.type === "image") && (
                <Stack gap={1}>
                    <Text fontSize="sm">Source for the next image selection</Text>
                    <select
                        aria-label="Image selection source"
                        value={choice}
                        onChange={(event) => {
                            const value = event.target.value
                            setChoice(value)
                            setImageId(value ? Number(value) : undefined)
                        }}
                    >
                        <option value="">Local file</option>
                        {images.map(({ id, prompt }) => (
                            <option key={id} value={id}>
                                {prompt.trim().slice(0, 100) || `Draw Things image ${id}`}
                            </option>
                        ))}
                    </select>
                    <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                            setImageError(null)
                            void invoke<{ images?: typeof images }>("dtp_list_images", {
                                showImage: true,
                                showVideo: false,
                                showDisconnected: false,
                                take: 50,
                            }).then(
                                (result) => {
                                    setImages(result.images ?? [])
                                    if (!result.images?.length)
                                        setImageError(
                                            "No indexed Draw Things images are available.",
                                        )
                                },
                                () => {
                                    setImageError(
                                        "Open Projects and connect an indexed library to choose a Draw Things image.",
                                    )
                                },
                            )
                        }}
                    >
                        Load recent Draw Things images
                    </Button>
                    {imageError && (
                        <Text role="status" fontSize="xs">
                            {imageError}
                        </Text>
                    )}
                </Stack>
            )}
            <GeneratedControls controller={project.controls} />
            <ScriptProblems controller={project.run} />
            <ScriptLogs controller={project.run} />
        </Stack>
    )
}

function typeScriptProblems(uri: monaco.Uri): ScriptDiagnostic[] {
    return monaco.editor.getModelMarkers({ owner: "typescript", resource: uri }).map((marker) => ({
        source: "typescript",
        severity:
            marker.severity >= monaco.MarkerSeverity.Error
                ? "error"
                : marker.severity >= monaco.MarkerSeverity.Warning
                  ? "warning"
                  : "info",
        message: marker.message,
        code: typeof marker.code === "string" ? marker.code : marker.code?.value,
    }))
}
