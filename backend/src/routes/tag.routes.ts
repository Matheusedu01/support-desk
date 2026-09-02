import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { listTags } from "../controllers/tag.controller";

const router = Router();

router.use(authenticate);
router.get("/", asyncHandler(listTags));

export default router;
