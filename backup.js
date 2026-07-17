const APP_VERSION = "1.3.4";

function validateCharacters(records) {
  return Array.isArray(records) && records.every((record) => record && typeof record === "object" && typeof record.name === "string");
}

export function createBackupMetadata(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const pad = (value) => String(Math.abs(value)).padStart(2, "0");
  const offset = `${sign}${pad(Math.floor(offsetMinutes / 60))}:${pad(offsetMinutes % 60)}`;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
  return { appVersion: APP_VERSION, backupDate: `${local}${offset}` };
}

export function downloadBackup(characters, settings, metadata = createBackupMetadata()) {
  const payload = {
    app: "meimane-tool",
    version: APP_VERSION,
    appVersion: metadata.appVersion,
    backupDate: metadata.backupDate,
    exportedAt: metadata.backupDate,
    characters,
    settings,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `meimane-tool-backup-${metadata.backupDate.replace(/[:+]/g, "-")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return metadata;
}

/** 配列・旧 {characters}・現行 {characters, settings} のすべてを受け入れる。 */
export function readBackup(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const records = Array.isArray(parsed) ? parsed : parsed?.characters;
        if (!validateCharacters(records)) throw new Error("Invalid character records");
        const settings = parsed && !Array.isArray(parsed) && parsed.settings && typeof parsed.settings === "object" ? parsed.settings : null;
        const metadata = {
          appVersion: typeof parsed?.appVersion === "string" ? parsed.appVersion : (typeof parsed?.version === "string" ? parsed.version : "Legacy"),
          backupDate: typeof parsed?.backupDate === "string" ? parsed.backupDate : (typeof parsed?.exportedAt === "string" ? parsed.exportedAt : ""),
        };
        console.info("Restore Backup", "\nVersion :", metadata.appVersion, "\nDate :", metadata.backupDate || "Unknown");
        resolve({ characters: records, settings, metadata });
      } catch {
        reject(new Error("JSONが正しくありません。"));
      }
    };
    reader.onerror = () => reject(new Error("ファイルを読み込めません。"));
    reader.readAsText(file, "UTF-8");
  });
}
