import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { getDashboardStats } from "../controllers/admin.controller";

const router = Router();

// Todo o namespace /api/admin é exclusivo de ADMIN — diferente das rotas de
// ticket, aqui não existe recorte por papel: ou você é admin, ou não acessa
// nada aqui.
router.use(authenticate, authorize("ADMIN"));

router.get("/stats", asyncHandler(getDashboardStats));

export default router;
