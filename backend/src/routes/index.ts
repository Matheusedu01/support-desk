import { Router } from "express";
import authRoutes from "./auth.routes";
import ticketRoutes from "./ticket.routes";
import adminRoutes from "./admin.routes";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { prisma } from "../lib/prisma";

const router = Router();

router.use("/auth", authRoutes);
router.use("/tickets", ticketRoutes);
router.use("/admin", adminRoutes);

// Rota de exemplo que exige apenas autenticação (qualquer papel).
// Serve para o frontend confirmar quem está logado e testar o token.
// Fases futuras (tickets, métricas) seguem o mesmo padrão, adicionando
// `authorize(...)` quando a rota precisa restringir por papel.
router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    return res.json({ user });
  })
);

export default router;
