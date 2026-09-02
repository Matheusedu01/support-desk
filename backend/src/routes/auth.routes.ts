import { Router } from "express";
import { register, login } from "../controllers/auth.controller";
import { asyncHandler } from "../middleware/asyncHandler";
import { createAuthLimiter } from "../middleware/rateLimit";

const router = Router();

// Desativado durante os testes automatizados: a suíte de integração bate
// nessas duas rotas dezenas de vezes de propósito (é assim que ela testa
// registro duplicado, senha errada, etc.), o que não é o mesmo cenário que
// este limitador existe para impedir — um único IP tentando adivinhar
// senha ou martelar criação de conta. O comportamento de bloqueio de
// verdade é testado isoladamente em middleware/rateLimit.test.ts, com um
// `max` pequeno e determinístico, sem depender de contar chamadas aqui.
const authLimiter = createAuthLimiter({
  skip: () => process.env.NODE_ENV === "test",
});

router.post("/register", authLimiter, asyncHandler(register));
router.post("/login", authLimiter, asyncHandler(login));

export default router;
