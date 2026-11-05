import { Router } from "express";
import statusRoutes from "./status";
import logRoutes from "./logs";
import musicControlRoutes from "./music-control";

const router = Router();

router.use(statusRoutes);
router.use(logRoutes);
router.use(musicControlRoutes);

export default router;
