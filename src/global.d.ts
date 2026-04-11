import type { BoxProps } from "@chakra-ui/react"

declare global {
    type ReadonlyState<T> =
        | {
              readonly [P in keyof T]: ReadonlyState<T[P]>
          }
        | Readonly<T>
    type Snap<T> = ReadOnlyState<T>

    type MaybeReadonly<T> = T | ReadonlyState<T>
    type Nullable<T> = T | null | undefined
    type ValueOrGetter<T> = T | (() => T)

    type ChakraProps = Omit<BoxProps, "direction">

    interface Window {
        __reset_db(): Promise<void>
        __reset_metadata_store(): Promise<void>
        toJSON<T>(object: T): T
        __E2E_TEST_OVERRIDE<K extends keyof E2ETestOverrides>(
            name: K,
            data: E2ETestOverrides[K],
        ): void
        __E2E_TEST_OVERRIDE_DATA: E2ETestOverrides
    }

    function toJSON<T>(object: T): T

    type E2ETestOverrides = Record<string, unknown> &
        Partial<{
            pasteboardText: Record<string, unknown>
            pasteboardTypes: string[]
            saveDialogPath: string
        }>
}
