const fs = require("fs");
const path = require("path");
const Store = require("electron-store");

const store = new Store();

function saveFileVersion(filePath, device) {
  const versionId = Date.now();
  const versionDir = path.join("./versions", device, versionId.toString());
  fs.mkdirSync(versionDir, { recursive: true });
  fs.copyFileSync(filePath, path.join(versionDir, path.basename(filePath)));

  const versions = store.get(`versions.${device}`) || [];
  versions.push({
    id: versionId,
    fileName: path.basename(filePath),
    timestamp: new Date().toISOString(),
  });
  store.set(`versions.${device}`, versions);
}

function cleanOldVersions() {
  const devices = store.get("versions") || {};
  Object.keys(devices).forEach((device) => {
    const versions = devices[device];
    if (versions.length > 10) {
      versions.slice(0, versions.length - 10).forEach((version) => {
        const versionDir = path.join("./versions", device, version.id.toString());
        if (fs.existsSync(versionDir)) {
          fs.rmSync(versionDir, { recursive: true });
        }
      });
      store.set(`versions.${device}`, versions.slice(-10));
    }
  });
}

function restoreVersion(versionId) {
  const devices = store.get("versions") || {};
  for (const device of Object.keys(devices)) {
    const version = devices[device].find((v) => v.id === versionId);
    if (version) {
      const versionDir = path.join("./versions", device, versionId.toString());
      const filePath = path.join(versionDir, version.fileName);
      if (fs.existsSync(filePath)) {
        const restorePath = path.join("./restored", version.fileName);
        fs.mkdirSync("./restored", { recursive: true });
        fs.copyFileSync(filePath, restorePath);
        return restorePath;
      }
    }
  }
  throw new Error("Version not found");
}

module.exports = { saveFileVersion, cleanOldVersions, restoreVersion };