import { Router } from 'express';
import leagueRoutes from './leagueRoutes.js';
import statsRoutes from './statsRoutes.js';
import syncRoutes from './syncRoutes.js';
import aiRoutes from './aiRoutes.js';
import cornerRoutes from './cornerRoutes.js';
import crawlerRoutes from './crawlerRoutes.js';
import fixtureRoutes from './fixtureRoutes.js';
import worldcupRoutes from './worldcupRoutes.js';

const router = Router();
router.use(leagueRoutes);
router.use(statsRoutes);
router.use(syncRoutes);
router.use(aiRoutes);
router.use(cornerRoutes);
router.use(crawlerRoutes);
router.use(fixtureRoutes);
router.use(worldcupRoutes);

export default router;
