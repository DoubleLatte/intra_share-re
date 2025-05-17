const Store = require("electron-store");
const store = new Store();

function compareVersions(localVersion, remoteVersion) {
  const localParts = localVersion.split(".").map(Number);
  const remoteParts = remoteVersion.split(".").map(Number);
  for (let i = 0; i < Math.max(localParts.length, remoteParts.length); i++) {
    const local = localParts[i] || 0;
    const remote = remoteParts[i] || 0;
    if (local > remote) return "ahead";
    if (local < remote) return "behind";
  }
  return "same";
}

function requestVersionInfo(device, callback) {
  const socket = require("socket.io-client")("http://localhost:3000");
  socket.emit("version-request", {
    targetDevice: device.name,
    requester: "local",
  });
  socket.on("version-response", (data) => {
    if (data.device === device.name) {
      store.set(`versionInfo.${device.name}`, {
        version: data.version,
        updateHistory: data.updateHistory,
      });
      callback(data);
    }
  });
}

function sendVersionInfo(deviceName, version) {
  const socket = require("socket.io-client")("http://localhost:3000");
  const updateHistory = store.get("updateHistory") || [];
  socket.emit("version-response", {
    device: deviceName,
    version,
    updateHistory,
    requester: "local",
  });
}

module.exports = { compareVersions, requestVersionInfo, sendVersionInfo };