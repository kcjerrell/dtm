class ProjectsPage {
    get projectA() { return $('[data-test-id="project-item"]*=test-project-a') }
    get projectB() { return $('[data-test-id="project-item"]*=test-project-b') }

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

export default new ProjectsPage()