import express from 'express';
import { getAllPlayers, getPlayerById, getPlayersByTeam } from '../controllers/playerController.js';

const router = express.Router();

router.get('/', getAllPlayers);
router.get('/:id', getPlayerById);
router.get('/team/:teamId', getPlayersByTeam);

export default router;
