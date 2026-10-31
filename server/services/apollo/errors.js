export class ExecutionStopped extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ExecutionStopped";
    this.code = code;
  }
}
