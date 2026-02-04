class ExecutionError extends Error {
  cause;
  constructor(cause) {
    super(`Error during worker execution: ${cause}`);
    this.name = "ExecutionError";
    this.cause = cause;
  }
}
function unreachable(value) {
  throw new Error(`Unreachable: ${value}`);
}
export {
  ExecutionError,
  unreachable
};
