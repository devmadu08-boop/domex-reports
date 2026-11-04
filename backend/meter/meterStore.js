import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validateMeterChanges } from "../../shared/meterSheet.js";

export function openMeterStore(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(directory, "meter.sqlite"));
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
  db.exec(`CREATE TABLE IF NOT EXISTS accounts(username TEXT PRIMARY KEY, password_hash TEXT NOT NULL, role TEXT NOT NULL, branch TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, username TEXT NOT NULL REFERENCES accounts(username), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS riders(id TEXT PRIMARY KEY, branch TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS history(seq INTEGER PRIMARY KEY, rider_id TEXT NOT NULL, username TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL, updated INTEGER NOT NULL); `);
  const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
  const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
  const normalize = (v) => String(v || "").trim().toUpperCase();
  const visible = (user, branch) => user.role === "ADMIN" || normalize(user.branch) === normalize(branch);
  function dailyBackup() {
    const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(p=>[p.type,p.value]));
    const folder=path.join(directory,"backups");fs.mkdirSync(folder,{recursive:true,mode:0o700});
    const file=path.join(folder,"meter-"+parts.year+"-"+parts.month+"-"+parts.day+".sqlite");
    if(!fs.existsSync(file))db.prepare("VACUUM INTO ?").run(file);
  }
  return {
    close: () => db.close(),
    importLegacy(data) {
      if (db.prepare("SELECT count(*) n FROM accounts").get().n) throw error("Meter database is already initialized; existing data was preserved.", 409);
      if (!data?.accounts || !data?.users) throw error("A complete meter JSON backup is required.");
      const accounts = Object.values(data.accounts);
      if (!accounts.some(a => a.role === "ADMIN")) throw error("Backup must contain an administrator.");
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const a of accounts) {
          if (!a.username || !/^[a-f0-9]{64}$/i.test(a.password_hash) || !["ADMIN", "BRANCH"].includes(a.role)) throw error("Invalid legacy account.");
          db.prepare("INSERT INTO accounts VALUES(?,?,?,?)").run(String(a.username).toLowerCase(), a.password_hash.toLowerCase(), a.role, normalize(a.branch));
        }
        for (const [id, rider] of Object.entries(data.users)) {
          if (!rider.branch || !rider.user_name || !rider.months) throw error("Invalid legacy rider.");
          db.prepare("INSERT INTO riders VALUES(?,?,?,?,0)").run(id, normalize(rider.branch), JSON.stringify(rider), 1);
        }
        db.exec("COMMIT");
      } catch (e) { db.exec("ROLLBACK"); throw e; }
      dailyBackup();
      return { accounts: accounts.length, riders: Object.keys(data.users).length };
    },
    login(username, password) {
      const account = db.prepare("SELECT * FROM accounts WHERE username=?").get(String(username || "").trim().toLowerCase());
      const supplied = hash(String(password || ""));
      const expected = account?.password_hash || "0".repeat(64);
      const parts = expected.split("$");
      const correct = parts[0] === "scrypt" ? crypto.timingSafeEqual(crypto.scryptSync(String(password), parts[1], 64), Buffer.from(parts[2], "hex"))
        : crypto.timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
      if (!correct || !account) throw error("Incorrect meter username or password.", 401);
      if (parts[0] !== "scrypt") {
        const salt=crypto.randomBytes(16).toString("hex");
        db.prepare("UPDATE accounts SET password_hash=? WHERE username=?").run("scrypt$"+salt+"$"+crypto.scryptSync(String(password),salt,64).toString("hex"),account.username);
      }
      const token = crypto.randomBytes(32).toString("hex");
      db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
      db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(hash(token), account.username, Date.now() + 12 * 3600000);
      return { token, user: { username: account.username, role: account.role, branch: account.branch } };
    },
    authenticate(token) {
      const user = db.prepare("SELECT a.username,a.role,a.branch FROM sessions s JOIN accounts a USING(username) WHERE token_hash=? AND expires>?").get(hash(String(token || "")), Date.now());
      if (!user) throw error("Sign in to the meter workspace.", 401);
      return user;
    },
    logout(token) { db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(String(token || ""))); },
    list(user) {
      const rows = user.role === "ADMIN" ? db.prepare("SELECT * FROM riders").all() : db.prepare("SELECT * FROM riders WHERE branch=?").all(normalize(user.branch));
      return rows.map(r => ({ id: r.id, version: r.version, deleted: Boolean(r.deleted), rider: JSON.parse(r.data) }));
    },
    save(user, id, rider, version, deleted = false) {
      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id) || !Number.isSafeInteger(version) || version < 0) throw error("Invalid rider or revision.");
      if (!rider || typeof rider !== "object" || Array.isArray(rider) || !rider.user_name || !rider.branch || !rider.months || typeof rider.months !== "object" || Array.isArray(rider.months) || JSON.stringify(rider).length > 4000000) throw error("Invalid rider record.");
      if (!visible(user, rider.branch)) throw error("This rider belongs to another branch.", 403);
      dailyBackup();
      db.exec("BEGIN IMMEDIATE");
      try {
        const old = db.prepare("SELECT * FROM riders WHERE id=?").get(id);
        if (old && !visible(user, old.branch)) throw error("This rider belongs to another branch.", 403);
        if ((old?.version || 0) !== version) throw error("Another device updated this rider. Reload the latest data before saving again.", 409);
        try { if (!deleted) validateMeterChanges(old ? JSON.parse(old.data) : null, rider); } catch(e) { throw error(e.message); }
        const next = version + 1;
        db.prepare("INSERT INTO riders VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET branch=excluded.branch,data=excluded.data,version=excluded.version,deleted=excluded.deleted")
          .run(id, normalize(rider.branch), JSON.stringify(rider), next, Number(deleted));
        db.prepare("INSERT INTO history(rider_id,username,data,version,updated) VALUES(?,?,?,?,?)").run(id, user.username, JSON.stringify({ rider, deleted }), next, Date.now());
        db.exec("COMMIT");
        return { id, version: next, deleted, rider };
      } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
    accounts(user) {
      if (user.role !== "ADMIN") throw error("Administrator access required.", 403);
      return db.prepare("SELECT username,role,branch FROM accounts").all();
    },
    saveAccount(user, input) {
      if (user.role !== "ADMIN") throw error("Administrator access required.", 403);
      const username = String(input.username || "").trim().toLowerCase();
      if (!/^[a-z0-9_-]{2,60}$/.test(username) || !["ADMIN", "BRANCH"].includes(input.role) || !input.branch) throw error("Enter a valid account, role and branch.");
      if (typeof input.password !== "string" || input.password.length < 10) throw error("Use a password of at least 10 characters.");
      const old=db.prepare("SELECT role FROM accounts WHERE username=?").get(username);
      if(old?.role==="ADMIN"&&input.role!=="ADMIN"&&db.prepare("SELECT count(*) n FROM accounts WHERE role='ADMIN'").get().n<=1) throw error("Keep at least one administrator account.");
      const salt=crypto.randomBytes(16).toString("hex");
      dailyBackup();
      db.prepare("INSERT INTO accounts VALUES(?,?,?,?) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash,role=excluded.role,branch=excluded.branch")
        .run(username, "scrypt$"+salt+"$"+crypto.scryptSync(input.password,salt,64).toString("hex"), input.role, normalize(input.branch));
      db.prepare("DELETE FROM sessions WHERE username=?").run(username);
      return { ok: true };
    },
    importRiders(user, users) {
      if(user.role!=="ADMIN")throw error("Administrator access required.",403);
      if(!users||typeof users!=="object"||Array.isArray(users)||Object.keys(users).length>10000)throw error("Choose a valid meter JSON backup.");
      dailyBackup();db.exec("BEGIN IMMEDIATE");
      try {
        for(const [id,rider] of Object.entries(users)){
          if(!/^[a-zA-Z0-9_-]{1,120}$/.test(id)||!rider?.user_name||!rider.branch||!rider.months||Array.isArray(rider.months)||JSON.stringify(rider).length>4000000)throw error("The backup contains an invalid rider.");
          const old=db.prepare("SELECT version FROM riders WHERE id=?").get(id),version=(old?.version||0)+1;
          db.prepare("INSERT INTO riders VALUES(?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET branch=excluded.branch,data=excluded.data,version=excluded.version,deleted=0").run(id,normalize(rider.branch),JSON.stringify(rider),version);
          db.prepare("INSERT INTO history(rider_id,username,data,version,updated) VALUES(?,?,?,?,?)").run(id,user.username,JSON.stringify({rider,action:"backup-import"}),version,Date.now());
        }
        db.exec("COMMIT");return {ok:true,imported:Object.keys(users).length};
      }catch(e){db.exec("ROLLBACK");throw e;}
    },
    backup(user) {
      if (user.role !== "ADMIN") throw error("Administrator access required.", 403);
      return { version: 1, exportedAt: new Date().toISOString(), users: Object.fromEntries(this.list(user).filter(r => !r.deleted).map(r => [r.id, r.rider])) };
    },
  };
}
