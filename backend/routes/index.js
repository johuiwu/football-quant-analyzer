import { Router } from 'express';
import leagueRoutes from './leagueRoutes.js';
import statsRoutes from './statsRoutes.js';
import syncRoutes from './syncRoutes.js';
import aiRoutes from './aiRoutes.js';
import cornerRoutes from './cornerRoutes.js';
import crawlerRoutes from './crawlerRoutes.js';

const router = Router();
router.use(leagueRoutes);
router.use(statsRoutes);
router.use(syncRoutes);
router.use(aiRoutes);
router.use(cornerRoutes);
router.use(crawlerRoutes);

export default router;
