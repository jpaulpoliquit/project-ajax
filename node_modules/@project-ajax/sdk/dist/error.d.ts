/**
 * An error that occurred during the execution of a worker capability.
 */
export declare class ExecutionError extends Error {
    readonly cause: unknown;
    constructor(cause: unknown);
}
/**
 * Helper for exhaustive switch statements. TypeScript will error if a case is not handled.
 */
export declare function unreachable(value: never): never;
//# sourceMappingURL=error.d.ts.map