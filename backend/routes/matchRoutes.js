import express from 'express';
import { getAllMatches, getMatchById, getMatchesByTeam } from '../controllers/matchController.js';

const router = express.Router();

router.get('/', getAllMatches);
router.get('/:id', getMatchById);
router.get('/team/:teamId', getMatchesByTeam);

export default router;
