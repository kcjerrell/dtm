import type * as Monaco from "monaco-editor/editor/editor.api.js"
import { proxy } from "valtio/vanilla"
import type { AnalysisResponse } from "../analysis"
import type {
    ControlValue,
    InputRevision,
    ProjectId,
    SelectedInput,
    SourceRevision,
    ValueRevision,
} from "../contracts"
import type { EditorAnalysisClient } from "../editor/analysisClient"
import { createRuntimeInlayHintProvider, type RuntimeInlayHint } from "../editor/inlayHints"
import type { ScriptProjectModel } from "../editor/modelRegistry"
import {
    defaultValue,
    normalizeValue,
    type RuntimeControl,
    reconcileControls,
    validateSchema,
} from "./reconcile"

export interface ControlsState {
    controls: RuntimeControl[]
    analysisStatus: "pending" | "valid" | "invalid"
    analysisError: string | null
    valueRevision: ValueRevision
    inputRevision: InputRevision
}

export interface ImageSelectionRequest {
    projectId: ProjectId
    inputId: string
    signal: AbortSignal
}
/** Native approval/resource resolution belongs to the injected adapter. */
export type ImageSelector = (request: ImageSelectionRequest) => Promise<SelectedInput | null>

export interface ControlsChange {
    projectId: ProjectId
    valueRevision: ValueRevision
    inputRevision: InputRevision
    kind: "analysis" | "value" | "input"
    phase: "change" | "commit"
}

export interface ControlsControllerOptions {
    projectId: ProjectId
    project: ScriptProjectModel
    analysis: EditorAnalysisClient
    selectImage?: ImageSelector
}

/** One instance is bound to one project/model lifetime. The host schedules analyze()
 * and owns the injected analysis transport and Monaco model. Neither enters the proxy. */
export class ScriptControlsController {
    readonly state = proxy<ControlsState>({
        controls: [],
        analysisStatus: "pending",
        analysisError: null,
        valueRevision: 0 as ValueRevision,
        inputRevision: 0 as InputRevision,
    })
    readonly #listeners = new Set<(event: ControlsChange) => void>()
    readonly #hintListeners = new Set<() => void>()
    readonly #selections = new Map<string, AbortController>()
    readonly #providers = new Set<Monaco.IDisposable>()
    readonly #revisionSubscription: Monaco.IDisposable
    readonly #disposeSubscription: Monaco.IDisposable
    #analysisGeneration = 0
    #validRevision: SourceRevision | undefined
    #disposed = false

    constructor(private readonly options: ControlsControllerOptions) {
        if (options.project.model.isDisposed())
            throw new Error("Cannot bind controls to a disposed model")
        this.#revisionSubscription = options.project.onDidChangeRevision(() => {
            ++this.#analysisGeneration
            this.#validRevision = undefined
            this.state.analysisStatus = "pending"
            this.state.analysisError = null
            this.#refreshHints()
        })
        this.#disposeSubscription = options.project.model.onWillDispose(() => this.dispose())
    }

    get canSelectImage(): boolean {
        return Boolean(this.options.selectImage) && !this.#disposed
    }

    /** Captures identity, source and revision together. A response has no project
     * identity in the frozen wire contract, so it is only accepted through this
     * request closure, never by revision number alone. Returns whether it applied. */
    async analyze(): Promise<boolean> {
        if (this.#disposed) return false
        const generation = ++this.#analysisGeneration
        const { project, analysis } = this.options
        const revision = project.revision
        const source = project.model.getValue()
        const current = () =>
            !this.#disposed &&
            generation === this.#analysisGeneration &&
            project.revision === revision
        try {
            const response = await analysis.analyze({
                source,
                sourceRevision: revision,
                fileName: project.uri.toString(),
            })
            if (!current()) return false
            if (response.sourceRevision !== revision) {
                this.#invalid("Analysis response revision mismatch.")
                return false
            }
            return this.#applyAnalysis(response, source.length)
        } catch {
            if (current())
                this.#invalid("Control analysis failed. Retry analysis to refresh controls.")
            return false
        }
    }

    #applyAnalysis(response: AnalysisResponse, sourceLength: number): boolean {
        if (
            response.instrumentedSource === undefined ||
            response.diagnostics.some((d) => d.severity === "error")
        ) {
            this.#invalid("Source analysis is invalid. Showing the last valid controls.")
            return false
        }
        let controls: RuntimeControl[]
        try {
            validateSchema(response.controls, sourceLength)
            controls = reconcileControls(this.state.controls, response.controls)
        } catch (error) {
            this.#invalid(error instanceof Error ? error.message : "Invalid control schema.")
            return false
        }
        const before = this.runtimeSnapshot()
        this.#cancelSelections()
        this.state.controls = controls
        this.state.analysisStatus = "valid"
        this.state.analysisError = null
        this.#validRevision = response.sourceRevision
        const after = this.runtimeSnapshot()
        if (
            Object.keys(before.values).length !== Object.keys(after.values).length ||
            Object.entries(before.values).some(
                ([id, value]) =>
                    !Object.hasOwn(after.values, id) ||
                    value.type !== after.values[id].type ||
                    value.value !== after.values[id].value,
            )
        )
            this.state.valueRevision = (this.state.valueRevision + 1) as ValueRevision
        const nextInputs = new Map(after.inputs.map((input) => [input.inputId, input]))
        if (
            before.inputs.length !== after.inputs.length ||
            before.inputs.some(
                (input) => JSON.stringify(input) !== JSON.stringify(nextInputs.get(input.inputId)),
            )
        )
            this.state.inputRevision = (this.state.inputRevision + 1) as InputRevision
        this.#refreshHints()
        this.#emit("analysis")
        return true
    }

    #invalid(message: string): void {
        this.#validRevision = undefined
        this.state.analysisStatus = "invalid"
        this.state.analysisError = message
        this.#refreshHints()
    }

    /** Fresh plain data for a later immutable run request; no source or model. */
    runtimeSnapshot(): {
        values: Record<string, ControlValue>
        inputs: SelectedInput[]
        valueRevision: ValueRevision
        inputRevision: InputRevision
    } {
        return {
            values: Object.fromEntries(
                this.state.controls.flatMap((item) =>
                    item.value ? [[item.descriptor.id, { ...item.value }]] : [],
                ),
            ),
            inputs: this.state.controls.flatMap((item) =>
                item.selection ? [{ ...item.selection }] : [],
            ),
            valueRevision: this.state.valueRevision,
            inputRevision: this.state.inputRevision,
        }
    }

    setValue(id: string, value: ControlValue): boolean {
        const item = this.#item(id)
        if (!item?.value) return false
        try {
            const normalized = normalizeValue(item.descriptor, value)
            const changed = item.value.value !== normalized.value.value
            item.value = normalized.value
            item.touched = true
            item.notice = normalized.notice
            item.error = null
            item.draft = null
            if (changed) this.state.valueRevision = (this.state.valueRevision + 1) as ValueRevision
            this.#refreshHints()
            this.#emit("value")
            return true
        } catch (error) {
            item.error = error instanceof Error ? error.message : "Invalid value."
            return false
        }
    }

    editNumber(id: string, text: string): void {
        const item = this.#item(id)
        if (item?.value?.type !== "number") return
        const number = text.trim() === "" ? NaN : Number(text)
        if (this.setValue(id, { type: "number", value: number }) && item.value.value !== number)
            return
        // Incomplete input is renderable draft state, never an invalid run value.
        item.draft = text
    }

    commitNumber(id: string): void {
        const item = this.#item(id)
        if (item?.value?.type !== "number") return
        item.draft = null
        this.commitValue()
    }

    commitValue(): void {
        if (!this.#disposed) this.#emit("value", "commit")
    }

    reset(id: string): void {
        const item = this.#item(id)
        if (!item) return
        this.#cancelSelection(id)
        const value = defaultValue(item.descriptor)
        if (value) this.setValue(id, value)
        else {
            if (item.selection)
                this.state.inputRevision = (this.state.inputRevision + 1) as InputRevision
            item.selection = null
            item.error = null
            item.notice = null
            this.#refreshHints()
            this.#emit("input")
        }
        item.touched = false
        item.selecting = false
    }

    async selectImage(id: string): Promise<void> {
        const item = this.#item(id)
        const select = this.options.selectImage
        if (item?.descriptor.type !== "image" || !select) return
        this.#cancelSelection(id)
        const request = new AbortController()
        this.#selections.set(id, request)
        item.selecting = true
        item.error = null
        const current = () =>
            !this.#disposed && this.#selections.get(id) === request && this.#item(id) === item
        try {
            const result = await select({
                projectId: this.options.projectId,
                inputId: id,
                signal: request.signal,
            })
            if (!current() || result === null) return
            if (result.inputId !== id) throw new Error("Image selection ID mismatch")
            const fileName = result.displayName.split(/[\\/]/).at(-1) ?? ""
            const displayName =
                [...fileName]
                    .filter(
                        (character) =>
                            character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
                    )
                    .join("") || "Image"
            // Copy only the frozen contract fields, never paths/bytes/adapter extras.
            const selection: SelectedInput =
                result.type === "localFile"
                    ? {
                          type: "localFile",
                          inputId: id,
                          displayName,
                          selectionToken: result.selectionToken,
                      }
                    : {
                          type: "drawThings",
                          inputId: id,
                          displayName,
                          resourceId: result.resourceId,
                      }
            if (!(selection.type === "localFile" ? selection.selectionToken : selection.resourceId))
                throw new Error("Missing image approval")
            const changed = JSON.stringify(item.selection) !== JSON.stringify(selection)
            item.selection = selection
            item.touched = true
            if (changed) this.state.inputRevision = (this.state.inputRevision + 1) as InputRevision
            this.#refreshHints()
            this.#emit("input")
        } catch {
            if (current()) item.error = "Image selection failed. Try selecting an image again."
        } finally {
            if (current()) {
                item.selecting = false
                this.#selections.delete(id)
            }
        }
    }

    onDidChange(listener: (event: ControlsChange) => void): Monaco.IDisposable {
        if (this.#disposed) return { dispose() {} }
        this.#listeners.add(listener)
        return {
            dispose: () => {
                this.#listeners.delete(listener)
            },
        }
    }

    getHints(): RuntimeInlayHint[] {
        if (this.#disposed || this.#validRevision !== this.options.project.revision) return []
        return this.state.controls.flatMap((item) => {
            const label = item.selection
                ? JSON.stringify(item.selection.displayName)
                : item.value
                  ? JSON.stringify(item.value.value)
                  : "No image selected"
            return [{ offset: item.descriptor.sourceRange.end.offset, label }]
        })
    }

    /** Optional leaf binding; the host supplies Monaco when composing the workspace. */
    bindInlayHints(monaco: typeof Monaco): Monaco.IDisposable {
        if (this.#disposed) throw new Error("Controls controller has been disposed")
        const listeners = new Set<() => void>()
        let released = false
        const provider = createRuntimeInlayHintProvider(monaco, () => this.getHints(), {
            model: this.options.project.model,
            onDidChangeInlayHints: (listener, thisArgs) => {
                if (released) return { dispose() {} }
                const bound = () => listener.call(thisArgs)
                listeners.add(bound)
                this.#hintListeners.add(bound)
                const subscription = {
                    dispose: () => {
                        listeners.delete(bound)
                        this.#hintListeners.delete(bound)
                    },
                }
                return subscription
            },
        })
        const providerRegistration = monaco.languages.registerInlayHintsProvider(
            "typescript",
            provider,
        )
        const registration = this.options.project.addProvider({
            dispose: () => {
                released = true
                providerRegistration.dispose()
                for (const listener of listeners) this.#hintListeners.delete(listener)
                listeners.clear()
            },
        })
        this.#providers.add(registration)
        return {
            dispose: () => {
                if (this.#providers.delete(registration)) registration.dispose()
            },
        }
    }

    #item(id: string): RuntimeControl | undefined {
        if (this.#disposed) return undefined
        return this.state.controls.find((item) => item.descriptor.id === id)
    }
    #cancelSelection(id: string): void {
        this.#selections.get(id)?.abort()
        this.#selections.delete(id)
    }
    #cancelSelections(): void {
        for (const id of this.#selections.keys()) this.#cancelSelection(id)
    }
    #refreshHints(): void {
        for (const listener of this.#hintListeners) listener()
    }
    #emit(kind: ControlsChange["kind"], phase: ControlsChange["phase"] = "change"): void {
        const { valueRevision, inputRevision } = this.state
        for (const listener of this.#listeners)
            listener({
                projectId: this.options.projectId,
                valueRevision,
                inputRevision,
                kind,
                phase,
            })
    }

    dispose(): void {
        if (this.#disposed) return
        this.#disposed = true
        ++this.#analysisGeneration
        this.#validRevision = undefined
        this.#cancelSelections()
        for (const item of this.state.controls) item.selecting = false
        this.#refreshHints()
        for (const provider of this.#providers) provider.dispose()
        this.#providers.clear()
        this.#revisionSubscription.dispose()
        this.#disposeSubscription.dispose()
        this.#hintListeners.clear()
        this.#listeners.clear()
    }
}
