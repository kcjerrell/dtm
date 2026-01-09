import type { ComponentType } from "react"
import type { FallbackProps } from "react-error-boundary"

function ErrorFallback({ error }: FallbackProps) {
	// Call resetErrorBoundary() to reset the error boundary and retry the render.

	const message = {
		message: "Unknown error",
		source: "unknown",
		stack: "(no stack trace available)",
	}

	if (errorHasMessage(error)) message.message = String(error.message)
	if (errorHasSourceUrl(error)) message.source = String(error.sourceURL)
	if (errorHasStack(error)) message.stack = String(error.stack)

	console.dir(error)

	return (
		<div role="alert" className="error-container">
			<div className="error-panel">
				<p className="error-header">Something went wrong</p>
				<div className="error-section">
					<span className="error-label">Message:</span>
					{message.message}
				</div>
				<div className="error-section">
					<span className="error-label">Source:</span>
					{message.source}
				</div>
				<div className="error-section">
					<span className="error-label">Stack:</span>
					<p style={{ whiteSpace: "pre-wrap", textIndent: "hanging 1rem each-line" }}>{message.stack}</p>
				</div>
			</div>
			<div className="error-buttons">
				<button
					className={"error-button"}
					type="button"
					onClick={() => navigator.clipboard.writeText(JSON.stringify(message, null, 2))}
				>
					Copy
				</button>
				<button className={"error-button"} type="button" onClick={() => document.location.reload()}>
					Reload
				</button>
			</div>
		</div>
	)
}

function errorHasMessage(error: unknown): error is { message: unknown } {
	return error != null && typeof error === "object" && "message" in error
}

function errorHasSourceUrl(error: unknown): error is { sourceURL: unknown } {
	return error != null && typeof error === "object" && "sourceURL" in error
}

function errorHasStack(error: unknown): error is { stack: unknown } {
	return error != null && typeof error === "object" && "stack" in error
}

export default ErrorFallback as ComponentType<FallbackProps>
