import express from "express";
import path from "node:path";
import { openMeterStore } from "./meterStore.js";
import { whatsappDataDir } from "../whatsapp/configStore.js";

export function createMeterRoutes(store = openMeterStore(path.join(whatsappDataDir, "meter-workspace"))) {
  const router = express.Router();
  const attempts = new Map();
  const handle = (fn) => (req, res) => { try { res.json(fn(req)); } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : "Meter storage request failed." }); } };
  router.post("/login", handle(req => {
    const key = req.ip + ":" + String(req.body.username || "").toLowerCase();
    for (const [k, a] of attempts) if (a.until < Date.now()) attempts.delete(k);
    if(attempts.size>5000) throw Object.assign(new Error("Sign-in service is busy. Try again later."),{statusCode:429});
    const entry = attempts.get(key) || { count: 0, until: Date.now() + 600000 };
    if (entry.count >= 8) throw Object.assign(new Error("Too many sign-in attempts. Try again in ten minutes."), { statusCode: 429 });
    entry.count++; attempts.set(key, entry);
    const value = store.login(req.body.username, req.body.password);
    attempts.delete(key); return value;
  }));
  router.use((req, res, next) => {
    try { req.meterToken = req.get("authorization")?.replace(/^Bearer /, ""); req.meterUser = store.authenticate(req.meterToken); next(); }
    catch (e) { res.status(401).json({ error: e.message }); }
  });
  router.get("/session", handle(req => req.meterUser));
  router.post("/logout", handle(req => { store.logout(req.meterToken); return { ok: true }; }));
  router.get("/riders", handle(req => ({ rows: store.list(req.meterUser) })));
  router.put("/riders/:id", handle(req => store.save(req.meterUser, req.params.id, req.body.rider, req.body.version, req.body.deleted === true)));
  router.get("/accounts", handle(req => ({ accounts: store.accounts(req.meterUser) })));
  router.post("/accounts", handle(req => store.saveAccount(req.meterUser, req.body)));
  router.get("/backup", handle(req => store.backup(req.meterUser)));
  router.post("/import",handle(req=>store.importRiders(req.meterUser,req.body.users)));
  return router;
}
