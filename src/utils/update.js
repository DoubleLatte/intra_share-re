const { app } = require("electron");
const fs = require("fs");
const path = require("path");

function applyUpdate(updateFilePath) {
  return new Promise((resolve, reject) => {
    try {
      const updateDir = path.join(app.getPath("userData"), "updates");
      fs.mkdirSync(updateDir, { recursive: true });

      const tempPath = path.join(updateDir, `update-${Date.now()}.zip`);
      fs.copyFileSync(updateFilePath, tempPath);

      setTimeout(() => {
        resolve();
      }, 1000);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { applyUpdate };