function increaseSize() {
    const size = parseInt(localStorage.getItem("baseSize") ?? "16", 10)
    const newSize = Math.min(28, size + 2)

    localStorage.setItem("baseSize", newSize.toString())
    document.documentElement.style.setProperty("--app-base-size", `${newSize}px`)
}

function decreaseSize() {
    const size = parseInt(localStorage.getItem("baseSize") ?? "16", 10)
    const newSize = Math.max(12, size - 2)

    localStorage.setItem("baseSize", newSize.toString())
    document.documentElement.style.setProperty("--app-base-size", `${newSize}px`)
}

function applySize() {
    const baseSize = parseInt(localStorage.getItem("baseSize") ?? "16", 10)
    document.documentElement.style.setProperty("--app-base-size", `${baseSize}px`)
}

function getBaseSize() {
    return parseInt(localStorage.getItem("baseSize") ?? "16", 10)
}

export const themeHelpers = {
    increaseSize,
    decreaseSize,
    applySize,
    getBaseSize,
}
