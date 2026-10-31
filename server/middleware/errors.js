import mongoose from "mongoose";
export class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}
export function requireDatabase(req, res, next) {
  if (mongoose.connection.readyState !== 1)
    return next(
      new AppError(
        "MongoDB is unavailable. Configure MONGODB_URI and start your database to use research sessions.",
        503,
      ),
    );
  next();
}
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status =
    err.status ||
    (err.name === "ZodError" || err.name === "CastError" ? 400 : 500);
  if (status >= 500) console.error(err.message);
  const message =
    err.name === "ZodError"
      ? err.issues.map((issue) => issue.message).join(" ")
      : err.type === "entity.parse.failed"
        ? "Request body must be valid JSON."
        : err.message;
  res.status(status).json({
    error:
      status === 500
        ? "An unexpected server error occurred. Please try again."
        : message,
  });
}
