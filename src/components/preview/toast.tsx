export function NotifyPinchToast(mode: string) {
    if (mode === "pinch") {
        return (
            <>
                <p>
                    <b>Pinch-to-zoom</b> mode is currently enabled. This can be changed through the
                    Options menu.
                </p>
                <p>Pan: Move the image with two fingers on the trackpad</p>
                <p>Zoom: Pinch to zoom in and out</p>
                <p>Alt zoom: Control + Two fingers up or down</p>
            </>
        )
    } else if (mode === "scroll") {
        return (
            <>
                <p>
                    <b>Scroll-to-zoom</b> is currently enabled. This can be changed through the
                    Options menu.
                </p>
                <p>Pan: Move the image by clicking and dragging</p>
                <p>Zoom: Scroll to zoom in and out</p>
            </>
        )
    }

    return null
}
