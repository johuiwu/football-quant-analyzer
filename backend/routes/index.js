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

// aiWarroomRoutes 使用 CJS module.exports，延迟异步注册
// esbuild CJS 格式不支持 top-level await，需在运行时动态加载
import('./aiWarroomRoutes.js')
  .then(mod => {
    const aiWarroomRoutes = mod.default || mod;
    router.use('/ai-warroom', aiWarroomRoutes);
    console.log('[routes] aiWarroomRoutes 已注册');
  })
  .catch(e => {
    console.warn('[routes] aiWarroomRoutes 注册失败:', e.message);
  });

export default router;
