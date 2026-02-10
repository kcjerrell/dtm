import { debug, error, info, trace, warn } from "@tauri-apps/plugin-log"

function forwardConsole(
    fnName: "log" | "debug" | "info" | "warn" | "error",
    logger: (message: string) => Promise<void>,
) {
    const original = console[fnName]
    console[fnName] = (...data) => {
        original(...data)
        logger(data.map((d) => String(d)).join(" "))
    }
}

forwardConsole("log", trace)
forwardConsole("debug", debug)
forwardConsole("info", info)
forwardConsole("warn", warn)
forwardConsole("error", error)
