import fs from "node:fs";
import path from "node:path";
import { openMeterStore } from "./meterStore.js";
const [file, directory] = process.argv.slice(2);
if (!file || !directory) throw new Error("Usage: node backend/meter/importLegacy.js BACKUP_JSON DATABASE_DIRECTORY");
const store = openMeterStore(path.resolve(directory));
try { console.log(JSON.stringify(store.importLegacy(JSON.parse(fs.readFileSync(file, "utf8"))))); }
finally { store.close(); }
