import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tournamentRouter from "./tournament/index";
import leagueRouter from "./tournament/league";
import knockoutRouter from "./tournament/knockout";
import playerRouter from "./player/index";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tournamentRouter);
router.use(leagueRouter);
router.use(knockoutRouter);
router.use(playerRouter);

export default router;
