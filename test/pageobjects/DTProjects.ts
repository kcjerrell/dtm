import "dotenv/config"
import fse from "fs-extra"
import path from 'node:path'
import { TestProject } from '../helpers/projects'



class DTProjects {
    get projectA() { return $(`[data-test-id="project-item"]*=${TestProject.projectA}`) }
    get projectC() { return $(`[data-test-id="project-item"]*=${TestProject.projectC}`) }
    get projectC2() { return $(`[data-test-id="project-item"]*=${TestProject.projectC2}`) }

getProjectItem(project: TestProject) {
    return $(`[data-test-id="project-item"]*=${project}`)
}
    
    get images() { return $$('[data-testid="image-item"]') }

    getProject(projectName: string) {
        return $(`[data-test-id="project-item"]*=${projectName}`)
    }

    getProjectId(projectName: string) {
        return this.getProject(projectName).getAttribute("data-project-id")
    }

    async selectProject(projectName: string) {
        await this.getProject(projectName).click()
        await expect(this.getProject(projectName)).toHaveAttribute("aria-selected", "true")
    }

    async deselectProject(projectName: string) {
        await this.getProject(projectName).click()
        await expect(this.getProject(projectName)).toHaveAttribute("aria-selected", "false")
    }

    async countVisibleImages() {
        return (await this.images).length
    }
}

export default new DTProjects()