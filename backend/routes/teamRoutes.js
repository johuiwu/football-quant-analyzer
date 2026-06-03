import express from 'express';
import { getAllTeams, getTeamById, getTeamStats } from '../controllers/teamController.js';

const router = express.Router();

router.get('/', getAllTeams);
router.get('/:id', getTeamById);
router.get('/:id/stats', getTeamStats);

export default router;
