import sharp from "sharp"

createImageProcess(async (dtm) => {
    const input = await dtm.input({ id: "source", label: "Source image" })
    const width = dtm.param(960, { id: "width", label: "Width", min: 64, max: 2048, step: 1 })
    return sharp(input.path).autoOrient().resize({ width, withoutEnlargement: true }).png()
})
