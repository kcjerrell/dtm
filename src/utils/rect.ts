export function contain(rect: DOMRectReadOnly, width: number, height: number) {
	const scale = Math.min(rect.width / width, rect.height / height)
	const imgW = width * scale
	const imgH = height * scale
	const imgX = rect.left + (rect.width - imgW) / 2
	const imgY = rect.top + (rect.height - imgH) / 2

	return new DOMRectReadOnly(imgX, imgY, imgW, imgH)
}

export function withinRect(rect: DOMRectReadOnly, x: number, y: number) {
	return rect.left <= x && rect.right >= x && rect.top <= y && rect.bottom >= y
}
