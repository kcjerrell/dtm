import { proxy, useSnapshot } from "valtio"
import { proxySet } from "valtio/utils"
import type { DTImageFull, ImageExtra, TensorHistoryExtra } from "@/commands"
import DTPService from "@/commands/DtpService"
import type { ScanProgress, TensorDataRow } from "@/commands/DtpServiceTypes"
import urls from "@/commands/urls"
import { uint8ArrayToBase64 } from "@/utils/helpers"
import { drawPose, pointsToPose, tensorToPoints } from "@/utils/pose"
import type { DialogState } from "../dialog/types"
import type { CanvasStack, SubItem, TensorType } from "../types"
import type { ProjectState } from "./projects"
import { DTPStateController } from "./types"

export type UIControllerState = {
    selectedTab: "projects" | "search"
    shouldFocus?: string
    detailsView: {
        project?: ProjectState
        item?: ImageExtra
        itemDetails?: DTImageFull
        showSpinner: boolean
        subItem?: SubItem | CanvasStack
        subItemSourceRect?: DOMRect | null
        lastItem?: ImageExtra | null
        candidates?: TensorHistoryExtra[]
        sourceRect?: DOMRect | null
        width?: number
        height?: number
        minimizeContent: boolean
    }
    isSettingsOpen: boolean
    isGridInert: boolean
    importLock: boolean
    importLockCount: number
    importProgress?: {
        found: number
        scanned: number
        imageCount: number
    }
    dialog?: DialogState
    imageSpinner: Set<number>
}

type Handler<T> = (payload: T) => void

export class UIController extends DTPStateController<UIControllerState> {
    state = proxy<UIControllerState>({
        selectedTab: "projects",
        shouldFocus: undefined,
        detailsView: {
            showSpinner: false,
            item: undefined,
            itemDetails: undefined,
            subItem: undefined,
            subItemSourceRect: null,
            lastItem: undefined,
            candidates: [],
            sourceRect: null,
            width: 0,
            height: 0,
            minimizeContent: false,
        },
        isSettingsOpen: false,
        isGridInert: false,
        importLock: false,
        importLockCount: 0,
        dialog: undefined,
        imageSpinner: proxySet(),
    })

    constructor() {
        super("uiState")

        this.container.on("import_started", () => this.startImport())
        this.container.on("import_progress", (progress) => this.updateImport(progress))
        this.container.on("import_completed", () => this.endImport())

        this.container.once("watchFoldersLoaded", (e) => {
            if (e?.foldersCount === 0) {
                this.showSettings(true)
            }
        })
    }

    onItemChanged: Handler<{ item: ImageExtra | null }>[] = []
    onSubItemChanged: Handler<{ projectId: number; tensorId: string }>[] = []

    raise<T>(event: "onItemChanged" | "onSubItemChanged", payload: T) {
        const handlers = this[event] as Handler<T>[]
        if (!handlers || !handlers.length) {
            console.warn(`No handlers for event ${event}`)
            return
        }
        for (const handler of handlers) {
            handler(payload)
        }
    }

    setSelectedTab(tab: "projects" | "search", focusElement?: string) {
        this.state.selectedTab = tab
        this.state.shouldFocus = focusElement
    }

    /** show/hide the settings panel. If no value is provided, the state will toggle */
    showSettings(show?: boolean) {
        // this.state.isSettingsOpen = show ?? !this.state.isSettingsOpen
        if (show === undefined) show = this.state.dialog?.dialogType !== "settings"
        if (show) this.showDialog({ dialogType: "settings", props: {} })
        else this.hideDialog()
    }

    /** show/hide the grid inert state */
    setGridInert(inert?: boolean) {
        this.state.isGridInert = inert ?? !this.state.isGridInert
    }

    _importLockPromise = Promise.resolve()
    _importLockResolver: (() => void) | null = null
    get importLockPromise() {
        return this._importLockPromise
    }
    startImport() {
        this.state.importLock = true
        const { promise, resolve } = Promise.withResolvers<void>()
        this._importLockPromise = promise
        this._importLockResolver = resolve
        this.state.importLockCount++
        this.state.importProgress = {
            found: 0,
            scanned: 0,
            imageCount: 0,
        }
    }
    endImport() {
        this.state.importLock = false
        this.state.importProgress = undefined
        this._importLockResolver?.()
        this._importLockResolver = null
    }
    updateImport(progress: ScanProgress) {
        const total = this.state.importProgress
        if (!total) return
        total.found += progress.projects_found
        total.scanned += progress.projects_scanned
        total.imageCount += progress.images_scanned
    }

    async showDetailsOverlay(item: ImageExtra) {
        const detailsOverlay = this.state.detailsView
        detailsOverlay.item = item
        detailsOverlay.lastItem = item
        detailsOverlay.project = await this.container
            .getService("projects")
            ?.getProject(item.project_id)

        detailsOverlay.width = item.start_width
        detailsOverlay.height = item.start_height

        const itemDetails = await this.container.getService("details")?.getDetails(item)
        detailsOverlay.itemDetails = itemDetails

        const candidates = await this.container
            .getService("details")
            ?.getPredecessorCandidates(item)
        detailsOverlay.candidates = candidates ?? []

        this.raise("onItemChanged", { item })
    }

    useDetailsOverlay() {
        return useSnapshot(this.state.detailsView)
    }

    hideDetailsOverlay() {
        const detailsOverlay = this.state.detailsView
        detailsOverlay.item = undefined
        detailsOverlay.candidates = []
        detailsOverlay.subItem = undefined
        detailsOverlay.subItemSourceRect = null
        detailsOverlay.itemDetails = undefined
        detailsOverlay.sourceRect = null
        detailsOverlay.width = undefined
        detailsOverlay.height = undefined
    }

    async showSubItem(
        projectId: number,
        tensorId: string,
        sourceElement: HTMLElement,
        maskId?: string,
    ) {
        const details = this.state.detailsView
        if (!details.item) return
        details.subItem = {
            projectId,
            tensorId,
            type: tensorId.split("_")[0] as TensorType,
            maskUrl: maskId ? urls.tensor(projectId, maskId, { invert: false }) : undefined,
            applyMask: !!maskId,
            thumbUrl: urls.tensor(projectId, tensorId, { size: 100 }),
            isLoading: true,
        }
        details.subItemSourceRect = toJSON(sourceElement.getBoundingClientRect())
        if (tensorId?.startsWith("pose")) await this.showSubItemPose(projectId, tensorId)
        else await this.showSubItemImage(projectId, tensorId)
    }

    async showCanvasStack(details: MaybeReadonly<DTImageFull>) {
        const detailsOverlay = this.state.detailsView
        if (!detailsOverlay.item || !details.tensorData?.length) return
        detailsOverlay.subItem = {
            projectId: details.project.id,
            tensorData: details.tensorData as TensorDataRow[],
            nodeId: details.id,
            isLoading: false,
            width: details.config.width,
            height: details.config.height,
        }
        detailsOverlay.subItemSourceRect = null
    }

    toggleSubItemMask() {
        const details = this.state.detailsView
        if (!details.subItem || !details.subItem.maskUrl) return
        details.subItem.applyMask = !details.subItem.applyMask
    }

    async showSubItemPose(projectId: number, tensorId: string) {
        const poseData = await DTPService.decodeTensor(projectId, tensorId, false)
        const points = tensorToPoints(poseData)
        const pose = pointsToPose(points, 1024, 1024)
        const image = await drawPose(pose, 4)
        const details = this.state.detailsView
        if (!image || !details.item) return
        if (details.subItem) {
            details.subItem.url = `data:image/png;base64,${await uint8ArrayToBase64(image)}`
            details.subItem.isLoading = false
            details.subItem.width = 1024
            details.subItem.height = 1024
            details.subItem.pose = pose
        }
    }

    async showSubItemImage(projectId: number, tensorId: string) {
        const size = await DTPService.getTensorSize(projectId, tensorId)
        const loadImg = new Image()
        loadImg.onload = () => {
            const details = this.state.detailsView
            if (!details.item) return
            if (
                details.subItem &&
                details.subItem.tensorId === tensorId &&
                details.subItem.projectId === projectId
            ) {
                details.subItem.url = urls.tensor(projectId, tensorId)
                details.subItem.isLoading = false
                details.subItem.width = size.width
                details.subItem.height = size.height
            }
        }
        loadImg.src = urls.tensor(projectId, tensorId)
    }

    hideSubItem() {
        this.state.detailsView.subItem = undefined
    }

    callWithSpinner<T>(fn: () => Promise<T>, minTime = 200) {
        this.state.detailsView.showSpinner = true
        let execFinished = false
        let timerFinished = false
        setTimeout(() => {
            timerFinished = true
            if (execFinished) this.state.detailsView.showSpinner = false
        }, minTime)

        return fn().finally(() => {
            execFinished = true
            if (timerFinished) this.state.detailsView.showSpinner = false
        })
    }

    callWithImageSpinner<T>(imageId: number, fn: () => Promise<T>) {
        this.state.imageSpinner.add(imageId)
        return fn().finally(() => {
            this.state.imageSpinner.delete(imageId)
        })
    }

    showDialog(dialogState: DialogState) {
        this.state.dialog = dialogState
    }

    hideDialog() {
        this.state.dialog = undefined
    }

    minimizeContent(value?: boolean) {
        this.state.detailsView.minimizeContent = value ?? !this.state.detailsView.minimizeContent
    }
}
