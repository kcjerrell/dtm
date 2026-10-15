import ts from "typescript-compiler-api"

import type { GeneratedControl, ScriptDiagnostic, SourceRange, SourceRevision } from "../contracts"

/** Serializable request accepted by the analyzer worker boundary. */
export interface AnalysisRequest {
    source: string
    sourceRevision: SourceRevision
    fileName?: string
}

/** Serializable response. Invalid analysis intentionally has no runnable source. */
export interface AnalysisResponse {
    sourceRevision: SourceRevision
    controls: GeneratedControl[]
    diagnostics: ScriptDiagnostic[]
    instrumentedSource?: string
    sourceMap?: string
}

interface TextEdit {
    start: number
    end: number
    text: string
}

interface ParsedControl {
    control: GeneratedControl
    explicitId: boolean
}

const ANALYZER_FILE = "/process.ts"

export function analyzeScript(request: AnalysisRequest): AnalysisResponse {
    const fileName = request.fileName ?? "process.ts"
    const sourceFile = createBoundSourceFile(request.source, fileName)
    const checker = sourceFile.program.getTypeChecker()
    const diagnostics = sourceFile.program
        .getSyntacticDiagnostics(sourceFile.file)
        .map((diagnostic) => typescriptDiagnostic(diagnostic, sourceFile.file, fileName))

    const registrations: ts.CallExpression[] = []
    const findRegistrations = (node: ts.Node): void => {
        if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === "createImageProcess" &&
            checker.getSymbolAtLocation(node.expression) === undefined
        ) {
            registrations.push(node)
        }
        ts.forEachChild(node, findRegistrations)
    }
    findRegistrations(sourceFile.file)

    if (registrations.length !== 1) {
        diagnostics.push(
            analyzerDiagnostic(
                sourceFile.file,
                fileName,
                registrations[1] ?? registrations[0] ?? sourceFile.file,
                registrations.length === 0
                    ? "Expected one direct createImageProcess callback."
                    : "Only one createImageProcess callback is supported.",
                "registration-count",
            ),
        )
        return { sourceRevision: request.sourceRevision, controls: [], diagnostics }
    }

    const registration = registrations[0]
    const callback = registration.arguments[0]
    if (
        !callback ||
        (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) ||
        callback.parameters.length !== 1 ||
        !ts.isIdentifier(callback.parameters[0].name)
    ) {
        diagnostics.push(
            analyzerDiagnostic(
                sourceFile.file,
                fileName,
                callback ?? registration,
                "createImageProcess must receive a callback with one identifier parameter.",
                "invalid-callback",
            ),
        )
        return { sourceRevision: request.sourceRevision, controls: [], diagnostics }
    }

    const parameter = callback.parameters[0]
    const parameterSymbol = checker.getSymbolAtLocation(parameter.name)
    const controls: GeneratedControl[] = []
    const edits: TextEdit[] = []
    const ids = new Map<string, ts.CallExpression>()
    let occurrence = 0

    const visitCallback = (node: ts.Node): void => {
        // DTM calls inside another function do not execute as direct callback operations and may
        // capture or shadow the callback parameter, so they are deliberately outside the MVP.
        if (node !== callback.body && ts.isFunctionLike(node)) return
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const property = node.expression
            const method = property.name.text
            if (
                (method === "input" || method === "param") &&
                ts.isIdentifier(property.expression) &&
                checker.getSymbolAtLocation(property.expression) === parameterSymbol
            ) {
                occurrence += 1
                const parsed = parseControl(
                    node,
                    method,
                    sourceFile.file,
                    fileName,
                    occurrence,
                    diagnostics,
                )
                if (parsed) {
                    const duplicate = ids.get(parsed.control.id)
                    if (duplicate) {
                        diagnostics.push(
                            analyzerDiagnostic(
                                sourceFile.file,
                                fileName,
                                node,
                                `Duplicate control id "${parsed.control.id}".`,
                                "duplicate-id",
                            ),
                        )
                    } else {
                        ids.set(parsed.control.id, node)
                        controls.push(parsed.control)
                        edits.push(
                            {
                                start: property.name.getStart(sourceFile.file),
                                end: property.name.end,
                                text: `__${method}`,
                            },
                            {
                                start: node.arguments.pos,
                                end: node.arguments.pos,
                                text: `${JSON.stringify(parsed.control.id)}, `,
                            },
                        )
                    }
                }
            }
        }
        ts.forEachChild(node, visitCallback)
    }
    visitCallback(callback.body)

    if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
        return { sourceRevision: request.sourceRevision, controls, diagnostics }
    }

    const transformed = applyEdits(request.source, edits)
    return {
        sourceRevision: request.sourceRevision,
        controls,
        diagnostics,
        instrumentedSource: transformed.source,
        sourceMap: createSourceMap(
            request.source,
            transformed.source,
            transformed.origins,
            fileName,
        ),
    }
}

function createBoundSourceFile(
    source: string,
    displayFileName: string,
): {
    file: ts.SourceFile
    program: ts.Program
} {
    const file = ts.createSourceFile(
        ANALYZER_FILE,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    )
    const options: ts.CompilerOptions = {
        noLib: true,
        noResolve: true,
        target: ts.ScriptTarget.Latest,
        module: ts.ModuleKind.ESNext,
    }
    const host: ts.CompilerHost = {
        fileExists: (candidate) => candidate === ANALYZER_FILE,
        getCanonicalFileName: (candidate) => candidate,
        getCurrentDirectory: () => "/",
        getDefaultLibFileName: () => "lib.d.ts",
        getNewLine: () => "\n",
        getSourceFile: (candidate) => (candidate === ANALYZER_FILE ? file : undefined),
        readFile: (candidate) => (candidate === ANALYZER_FILE ? source : undefined),
        useCaseSensitiveFileNames: () => true,
        writeFile: () => undefined,
    }
    const program = ts.createProgram([ANALYZER_FILE], options, host)
    const boundFile = program.getSourceFile(ANALYZER_FILE)
    if (!boundFile) throw new Error(`TypeScript failed to parse ${displayFileName}`)
    return { file: boundFile, program }
}

function parseControl(
    call: ts.CallExpression,
    method: "input" | "param",
    sourceFile: ts.SourceFile,
    fileName: string,
    occurrence: number,
    diagnostics: ScriptDiagnostic[],
): ParsedControl | undefined {
    const fail = (message: string): undefined => {
        diagnostics.push(
            analyzerDiagnostic(sourceFile, fileName, call, message, "unsupported-call"),
        )
        return undefined
    }
    const contextualLabel = inferLabel(call)
    const range = makeRange(sourceFile, call.getStart(sourceFile), call.end)

    if (method === "input") {
        if (call.arguments.length > 1) return fail("dtm.input accepts at most one options object.")
        const options = readOptions(call.arguments[0], ["id", "label", "required"])
        if (call.arguments[0] && !options)
            return fail(
                "dtm.input options must be a static object literal with supported properties.",
            )
        const id = readString(options?.id)
        const explicitLabel = readString(options?.label)
        const required = options?.required ? readBoolean(options.required) : true
        if (
            (options?.id && id === undefined) ||
            (options?.label && explicitLabel === undefined) ||
            required === undefined
        ) {
            return fail("dtm.input id, label, and required values must be static literals.")
        }
        if (id === "") return fail("A control id cannot be empty.")
        return {
            explicitId: id !== undefined,
            control: {
                type: "image",
                id: id ?? generatedId(method, contextualLabel, syntaxPath(call), occurrence),
                label: explicitLabel ?? contextualLabel ?? "Image",
                required,
                sourceRange: range,
            },
        }
    }

    const defaultValue = literalValue(call.arguments[0])
    if (defaultValue === undefined) {
        return fail(
            "The first dtm.param argument must be a static number, boolean, or string literal.",
        )
    }

    let options: Record<string, ts.Expression> | undefined
    let min: number | undefined
    let max: number | undefined
    let step: number | undefined
    if (typeof defaultValue === "number" && call.arguments.length >= 3) {
        if (call.arguments.length > 4)
            return fail("The positional numeric overload accepts at most four arguments.")
        min = readNumber(call.arguments[1])
        max = readNumber(call.arguments[2])
        step = call.arguments[3] ? readNumber(call.arguments[3]) : 1
        if (min === undefined || max === undefined || step === undefined) {
            return fail("Positional numeric constraints must be static number literals.")
        }
    } else {
        if (call.arguments.length > 2)
            return fail("This dtm.param overload accepts at most two arguments.")
        options = readOptions(call.arguments[1], ["id", "label", "min", "max", "step"])
        if (call.arguments[1] && !options)
            return fail(
                "dtm.param options must be a static object literal with supported properties.",
            )
        min = readOptionalNumber(options?.min)
        max = readOptionalNumber(options?.max)
        step = readOptionalNumber(options?.step)
        if (
            [options?.min, options?.max, options?.step].some(
                (value, index) => value && [min, max, step][index] === undefined,
            )
        ) {
            return fail("Numeric constraints must be static number literals.")
        }
        if (min !== undefined && max !== undefined && step === undefined) step = 1
    }

    const id = readString(options?.id)
    const explicitLabel = readString(options?.label)
    if ((options?.id && id === undefined) || (options?.label && explicitLabel === undefined)) {
        return fail("dtm.param id and label must be static string literals.")
    }
    if (id === "") return fail("A control id cannot be empty.")
    if (
        typeof defaultValue !== "number" &&
        (min !== undefined || max !== undefined || step !== undefined)
    ) {
        return fail("Only numeric parameters accept min, max, or step constraints.")
    }
    if (min !== undefined && max !== undefined && min > max)
        return fail("dtm.param min must not exceed max.")
    if (step !== undefined && step <= 0) return fail("dtm.param step must be greater than zero.")

    const base = {
        id: id ?? generatedId(method, contextualLabel, syntaxPath(call), occurrence),
        label: explicitLabel ?? contextualLabel ?? "Parameter",
        sourceRange: range,
    }
    let control: GeneratedControl
    if (typeof defaultValue === "boolean") {
        control = { ...base, type: "boolean", defaultValue }
    } else if (typeof defaultValue === "string") {
        control = { ...base, type: "text", defaultValue }
    } else if (min !== undefined && max !== undefined && step !== undefined) {
        control = { ...base, type: "slider", defaultValue, min, max, step }
    } else {
        control = { ...base, type: "number", defaultValue, min, max, step }
    }
    return { control, explicitId: id !== undefined }
}

function readOptions(
    expression: ts.Expression | undefined,
    allowed: readonly string[],
): Record<string, ts.Expression> | undefined {
    if (!expression || !ts.isObjectLiteralExpression(expression)) return undefined
    const result: Record<string, ts.Expression> = {}
    for (const property of expression.properties) {
        if (!ts.isPropertyAssignment(property)) return undefined
        const name =
            ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
                ? property.name.text
                : undefined
        if (!name || !allowed.includes(name) || result[name]) return undefined
        result[name] = property.initializer
    }
    return result
}

function literalValue(
    expression: ts.Expression | undefined,
): string | number | boolean | undefined {
    expression = unwrap(expression)
    if (!expression) return undefined
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
        return expression.text
    if (expression.kind === ts.SyntaxKind.TrueKeyword) return true
    if (expression.kind === ts.SyntaxKind.FalseKeyword) return false
    return readNumber(expression)
}

function readString(expression: ts.Expression | undefined): string | undefined {
    expression = unwrap(expression)
    return expression &&
        (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
        ? expression.text
        : undefined
}

function readBoolean(expression: ts.Expression | undefined): boolean | undefined {
    expression = unwrap(expression)
    if (expression?.kind === ts.SyntaxKind.TrueKeyword) return true
    if (expression?.kind === ts.SyntaxKind.FalseKeyword) return false
    return undefined
}

function readOptionalNumber(expression: ts.Expression | undefined): number | undefined {
    return expression ? readNumber(expression) : undefined
}

function readNumber(expression: ts.Expression | undefined): number | undefined {
    expression = unwrap(expression)
    if (!expression) return undefined
    if (ts.isNumericLiteral(expression)) {
        const value = Number(expression.text)
        return Number.isFinite(value) ? value : undefined
    }
    if (
        ts.isPrefixUnaryExpression(expression) &&
        (expression.operator === ts.SyntaxKind.MinusToken ||
            expression.operator === ts.SyntaxKind.PlusToken) &&
        ts.isNumericLiteral(expression.operand)
    ) {
        const value = Number(expression.operand.text)
        const signedValue = expression.operator === ts.SyntaxKind.MinusToken ? -value : value
        return Number.isFinite(signedValue) ? signedValue : undefined
    }
    return undefined
}

function unwrap(expression: ts.Expression | undefined): ts.Expression | undefined {
    while (
        expression &&
        (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression))
    ) {
        expression = expression.expression
    }
    return expression
}

function inferLabel(call: ts.CallExpression): string | undefined {
    let current: ts.Node = call
    while (current.parent && !ts.isFunctionLike(current.parent)) {
        if (ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)) {
            return humanize(current.parent.name.text)
        }
        current = current.parent
    }
    return undefined
}

function humanize(identifier: string): string {
    const words = identifier
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .trim()
    return words ? words[0].toUpperCase() + words.slice(1) : identifier
}

function syntaxPath(node: ts.Node): string {
    const path: number[] = []
    let current: ts.Node | undefined = node
    while (current?.parent) {
        const siblings = current.parent
            .getChildren()
            .filter((child) => child.kind === current?.kind)
        path.push(siblings.indexOf(current))
        current = current.parent
    }
    return path.reverse().join(".")
}

function generatedId(
    kind: string,
    variableLabel: string | undefined,
    path: string,
    occurrence: number,
): string {
    const seed = `${kind}:${variableLabel ?? "anonymous"}:${path}:${occurrence}`
    let hash = 0x811c9dc5
    for (let index = 0; index < seed.length; index += 1) {
        hash ^= seed.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return `${kind}-${(hash >>> 0).toString(36)}`
}

function typescriptDiagnostic(
    diagnostic: ts.Diagnostic,
    sourceFile: ts.SourceFile,
    fileName: string,
): ScriptDiagnostic {
    return {
        source: "typescript",
        severity:
            diagnostic.category === ts.DiagnosticCategory.Warning
                ? "warning"
                : diagnostic.category === ts.DiagnosticCategory.Message ||
                    diagnostic.category === ts.DiagnosticCategory.Suggestion
                  ? "info"
                  : "error",
        code: `TS${diagnostic.code}`,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        location:
            diagnostic.start === undefined
                ? undefined
                : {
                      file: fileName,
                      range: makeRange(
                          sourceFile,
                          diagnostic.start,
                          diagnostic.start + (diagnostic.length ?? 0),
                      ),
                  },
    }
}

function analyzerDiagnostic(
    sourceFile: ts.SourceFile,
    fileName: string,
    node: ts.Node,
    message: string,
    code: string,
): ScriptDiagnostic {
    return {
        source: "analyzer",
        severity: "error",
        code,
        message,
        location: {
            file: fileName,
            range: makeRange(sourceFile, node.getStart(sourceFile), node.end),
        },
    }
}

function makeRange(sourceFile: ts.SourceFile, start: number, end: number): SourceRange {
    const startPosition = sourceFile.getLineAndCharacterOfPosition(start)
    const endPosition = sourceFile.getLineAndCharacterOfPosition(end)
    return {
        start: { line: startPosition.line + 1, column: startPosition.character + 1, offset: start },
        end: { line: endPosition.line + 1, column: endPosition.character + 1, offset: end },
    }
}

function applyEdits(
    source: string,
    edits: readonly TextEdit[],
): { source: string; origins: number[] } {
    const sorted = [...edits].sort(
        (left, right) => left.start - right.start || left.end - right.end,
    )
    let result = ""
    const origins: number[] = []
    let sourceOffset = 0
    for (const edit of sorted) {
        for (; sourceOffset < edit.start; sourceOffset += 1) {
            result += source[sourceOffset]
            origins.push(sourceOffset)
        }
        result += edit.text
        for (let index = 0; index < edit.text.length; index += 1) origins.push(edit.start)
        sourceOffset = edit.end
    }
    for (; sourceOffset < source.length; sourceOffset += 1) {
        result += source[sourceOffset]
        origins.push(sourceOffset)
    }
    return { source: result, origins }
}

function createSourceMap(
    original: string,
    generated: string,
    origins: readonly number[],
    fileName: string,
): string {
    const originalPositions = positionsByOffset(original)
    const lines: string[] = []
    let segments: string[] = []
    let generatedColumn = 0
    let previousGeneratedColumn = 0
    let previousSource = 0
    let previousOriginalLine = 0
    let previousOriginalColumn = 0
    for (let offset = 0; offset < generated.length; offset += 1) {
        const isStandaloneCarriageReturn =
            generated[offset] === "\r" && generated[offset + 1] !== "\n"
        if (generated[offset] === "\n" || isStandaloneCarriageReturn) {
            lines.push(segments.join(","))
            segments = []
            generatedColumn = 0
            previousGeneratedColumn = 0
            continue
        }
        const originalPosition = originalPositions[origins[offset] ?? original.length]
        segments.push(
            vlq(generatedColumn - previousGeneratedColumn) +
                vlq(-previousSource) +
                vlq(originalPosition.line - previousOriginalLine) +
                vlq(originalPosition.column - previousOriginalColumn),
        )
        previousGeneratedColumn = generatedColumn
        previousSource = 0
        previousOriginalLine = originalPosition.line
        previousOriginalColumn = originalPosition.column
        generatedColumn += 1
    }
    lines.push(segments.join(","))
    return JSON.stringify({
        version: 3,
        file: fileName,
        sources: [fileName],
        sourcesContent: [original],
        names: [],
        mappings: lines.join(";"),
    })
}

function positionsByOffset(source: string): Array<{ line: number; column: number }> {
    const positions: Array<{ line: number; column: number }> = []
    let line = 0
    let column = 0
    for (let offset = 0; offset <= source.length; offset += 1) {
        positions.push({ line, column })
        const isStandaloneCarriageReturn = source[offset] === "\r" && source[offset + 1] !== "\n"
        if (source[offset] === "\n" || isStandaloneCarriageReturn) {
            line += 1
            column = 0
        } else {
            column += 1
        }
    }
    return positions
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

function vlq(value: number): string {
    let encoded = ""
    let remaining = value < 0 ? (-value << 1) + 1 : value << 1
    do {
        let digit = remaining & 31
        remaining >>>= 5
        if (remaining > 0) digit |= 32
        encoded += BASE64[digit]
    } while (remaining > 0)
    return encoded
}
