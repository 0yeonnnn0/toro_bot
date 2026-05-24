import { Router } from "express";
import statusRoutes from "./status";
import presetRoutes from "./presets";
import logRoutes from "./logs";
import ragRoutes from "./rag";
import chatRoutes from "./chat";
import teamRoutes from "./teams";
import calendarOauthRoutes from "./calendar-oauth";
import storedRoutes from "./stored";

const router = Router();

router.use(chatRoutes);
router.use(statusRoutes);
router.use(presetRoutes);
router.use(logRoutes);
router.use(ragRoutes);
router.use(teamRoutes);
router.use(calendarOauthRoutes);
router.use(storedRoutes);

export default router;
