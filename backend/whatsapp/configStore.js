import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const whatsappDataDir = process.env.WHATSAPP_DATA_DIR
  ? path.resolve(process.env.WHATSAPP_DATA_DIR)
  : fileURLToPath(new URL("../data/", import.meta.url));

const locks = new Map();

function withLock(filePath, task) {
  const operation = (locks.get(filePath) || Promise.resolve()).then(task);
  const settled = operation.catch(() => {});
  locks.set(filePath, settled);
  settled.then(() => {
    if (locks.get(filePath) === settled) locks.delete(filePath);
  });
  return operation;
}

async function atomicWrite(filePath, value) {
  const temporary = `${filePath}.${crypto.randomUUID()}.next`;
  try {
    const file = await fs.open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(value, null, 2));
      await file.sync();
    } finally {
      await file.close();
    }
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export function createConfigStore(configPath, normalize) {
  const filePath = path.resolve(configPath);

  async function readFile(file) {
    const value = JSON.parse(await fs.readFile(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new SyntaxError("WhatsApp settings must be a JSON object.");
    }
    return normalize(value);
  }

  async function readCurrent() {
    try {
      return await readFile(filePath);
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      try {
        return await readFile(`${filePath}.bak`);
      } catch (backupError) {
        if (error.code === "ENOENT" && backupError.code === "ENOENT") return normalize({});
        // Never turn a damaged/unreadable file into empty settings that a sync can save over.
        throw new Error("WhatsApp settings could not be read or recovered. Restore the settings backup before saving changes.", { cause: error });
      }
    }
  }

  return {
    read: () => withLock(filePath, readCurrent),
    update: (patch) => withLock(filePath, async () => {
      const current = await readCurrent();
      const changes = typeof patch === "function" ? await patch(current) : patch;
      const next = normalize({ ...current, ...changes });
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await atomicWrite(`${filePath}.bak`, next);
      await atomicWrite(filePath, next);
      return next;
    }),
  };
}
