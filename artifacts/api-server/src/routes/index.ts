import { Router, type IRouter } from "express";
import healthRouter from "./health";
import terminalRouter from "./terminal.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/terminal", terminalRouter);

export default router;
