import "dotenv/config"
import { TestProject } from "../util/projects"
import type { WaitForOpts } from "./Metadata"

class DTProjects {
    get projectA() {
        return $(`[data-test-id="project-item"]*=${TestProject.projectA}`)
    }
    get projectC() {
        return $(`[data-test-id="project-item"]*=${TestProject.projectC}`)
    }
    get projectC2() {
        return $(`[data-test-id="project-item"]*=${TestProject.projectC2}`)
    }
    get settings() {
        return $("aria/Settings")
    }

    getProjectItem(project: TestProject) {
        return $(`[data-test-id="project-item"]*=${project}`)
    }

    get images() {
        return $$('[data-testid="image-item"]')
    }

    get showHiddenProjects() {
        return $("aria/Show hidden projects")
    }
    get hideProjects() {
        return $("aria/Hide projects")
    }
    get hideButton() {
        return $("aria/Hide project")
    }
    get showButton() {
        return $("aria/Show project")
    }

    getProject(projectName: string) {
        return $(`[data-test-id="project-item"]*=${projectName}`)
    }

    getProjectId(projectName: string) {
        return this.getProject(projectName).getAttribute("data-project-id")
    }

    async selectProject(projectName: string) {
        const item = this.getProject(projectName)
        await item.click()
        await expect(item).toHaveAttribute("aria-selected", "true")
    }

    async deselectProject(projectName: string) {
        await this.getProject(projectName).click()
        await expect(this.getProject(projectName)).toHaveAttribute("aria-selected", "false")
    }

    async hideSelectedProject() {
        await this.hideButton.click()
    }

    async showSelectedProject() {
        await this.showButton.click()
    }

    async countVisibleImages() {
        return (await this.images).length
    }

    async getTotalProjects() {
        const text = await $("aria/Total projects").getText()
        return parseInt(text.split(" ")[0])
    }

    async getTotalImages() {
        const text = await $("aria/Total images").getText()
        return parseInt(text.split(" ")[0])
    }

    async getTotalFilesize() {
        const text = await $("aria/Total filesize").getText()
        return parseInt(text.split(" ")[0])
    }

    async getDataItemValue(label: string, opts?: WaitForOpts & { noThrow?: boolean }) {
        const el = $(`//dt[.='${label}']/following-sibling::dd`)
        try {
            await el.waitForDisplayed(opts)
            return el.getText()
        } catch (e) {
            if (opts?.noThrow) {
                console.log(`No data item found for label: ${label}`)
                return null
            }
            throw e
        }
    }

    imageToolbar = {
        get searchText() {
            return $("aria/Search text")
        },
        get clearSearchText() {
            return $("aria/Clear search text")
        },
        get filters() {
            return $("aria/Search filters")
        },
        get clearFilters() {
            return $("aria/Clear search filters")
        },
        get projects() {
            return $("aria/Selected projects")
        },
        get clearProjects() {
            return $("aria/Clear selected projects")
        },
        get showImages() {
            return $("aria/Show only images")
        },
        get showVideos() {
            return $("aria/Show only videos")
        },
        get showDisconnected() {
            return $("aria/Include images from disconnected folders")
        },
        get sortDirection() {
            return $("aria/Sort by date")
        },
    }

    searchPanel = {
        getFilter(index: number) {
            const filter = {
                get target() {
                    return $(`[aria-label="Search filter ${index} target"] button`)
                },
                async getTargetOption(option: string) {
                    // id will be something like select:_r_1v_
                    // the option id will have an id like select:_r_1v_:option:model
                    const rootId = await $(
                        `[aria-label="Search filter ${index} target"]`,
                    ).getAttribute("id")
                    const optionId = `${rootId}:option:${option}`
                    return $(`[id="${optionId}"]`)
                },
                get operator() {
                    return $(`[aria-label="Search filter ${index} operator"] button`)
                },
                async getOperatorOption(option: string) {
                    // id will be something like select:_r_1v_
                    // the option id will have an id like select:_r_1v_:option:model
                    const rootId = await $(
                        `[aria-label="Search filter ${index} operator"]`,
                    ).getAttribute("id")
                    const optionId = `${rootId}:option:${option}`
                    return $(`[id="${optionId}"]`)
                },
                get value() {
                    return $(`aria/Search filter ${index} value`)
                },
                get remove() {
                    return $(`aria/Remove search filter ${index}`)
                },
            }
            return filter
        },
    }
}

export default new DTProjects()
