import { Router } from "express";
import { regenerate } from "../controllers/reportRevisions.js";
import { exportReport } from "../controllers/reportExports.js";
import * as controller from "../controllers/sessions.js";
import { requireDatabase, AppError } from "../middleware/errors.js";
const router = Router();
router.use(requireDatabase);
router.get("/stats", controller.stats);
router.get("/", controller.list);
router.post("/", controller.create);
router.param("id", (req, res, next, id) =>
  /^[a-f\d]{24}$/i.test(id)
    ? next()
    : next(new AppError("Invalid session ID.", 400)),
);
router.get("/:id", controller.get);
router.post("/:id/cancel", controller.cancel);
router.post("/:id/approve-plan", controller.approvePlan);
router.delete("/:id", controller.remove);
router.get("/:id/sources", controller.sources);
router.get("/:id/evidence", controller.evidence);
router.get("/:id/report", controller.report);
router.get("/:id/report/export", exportReport);
router.post("/:id/report/regenerate", regenerate);
router.get("/:id/review", controller.review);
router.get("/:id/events", controller.stream);
export default router;
