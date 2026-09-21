import { Router } from "express";
import { db } from "../db.js";

export const healthRouter = Router();

healthRouter.get("/healthz", (req, res) => {
  try {
    db.prepare("SELECT 1").get();
    res.json({ status: "ok", uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: "error" });
  }
});
