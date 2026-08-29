import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fislRouter from "./fisl";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fislRouter);

export default router;
