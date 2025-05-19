const Peer = require("simple-peer");
const wrtc = require("wrtc");
const { encryptData, decryptData } = require("./encryption");
const { io } = require("socket.io-client");
const fs = require("fs");
const path = require("path");
const Store = require("../store");

let currentTransfer = null;
let socket = null;

function initSocket(device) {
  try {
    if (!socket || socket.disconnected) {
      socket = io(`http://${device.host}:${device.port}`, { reconnection: true });
      socket.on("connect_error", (err) => {
        console.error(`Socket connection error to ${device.host}:${device.port}:`, err);
      });
    }
    return socket;
  } catch (err) {
    console.error(`Failed to initialize socket for ${device.host}:${device.port}:`, err);
    throw err;
  }
}

function initPeer(initiator, id, options = {}) {
  try {
    const peer = new Peer({
      initiator,
      trickle: false,
      wrtc,
      config: {
        iceServers: [],
      },
    });

    peer.on("error", (err) => {
      console.error("WebRTC peer error:", err);
    });

    return peer;
  } catch (err) {
    console.error("Failed to initialize peer:", err);
    throw err;
  }
}

function sendFiles(files, device, onProgress, addHistory, chunked = false) {
  return new Promise((resolve, reject) => {
    try {
      const peer = initPeer(true, "sender");
      let totalSize = 0;
      let transferred = 0;

      files.forEach((file) => {
        try {
          totalSize += fs.statSync(file).size;
        } catch (err) {
          console.error(`Failed to stat file ${file}:`, err);
          reject(err);
          return;
        }
      });

      const socket = initSocket(device);

      peer.on("signal", (data) => {
        socket.emit("signal", { to: device.name, signal: data }, (err) => {
          if (err) console.error("Signal emit error:", err);
        });
      });

      peer.on("connect", () => {
        files.forEach((file) => {
          try {
            if (chunked) {
              const CHUNK_SIZE = 1024 * 1024;
              const fileData = fs.readFileSync(file);
              const name = path.basename(file);
              const data = { type: "file", name, data: fileData };
              for (let i = 0; i < fileData.length; i += CHUNK_SIZE) {
                const chunk = fileData.slice(i, i + CHUNK_SIZE);
                peer.send(JSON.stringify({ ...data, chunk, chunkIndex: i / CHUNK_SIZE, totalChunks: Math.ceil(fileData.length / CHUNK_SIZE) }));
                transferred += chunk.length;
                onProgress(transferred / totalSize);
              }
            } else {
              const stream = fs.createReadStream(file);
              const name = path.basename(file);
              let fileData = Buffer.alloc(0);

              stream.on("data", (chunk) => {
                fileData = Buffer.concat([fileData, chunk]);
              });

              stream.on("end", () => {
                const data = { type: "file", name, data: fileData };
                peer.send(JSON.stringify(data));
                transferred += fileData.length;
                onProgress(transferred / totalSize);
                addHistory({
                  id: Date.now(),
                  type: "send",
                  fileName: name,
                  device: device.name,
                  timestamp: new Date().toISOString(),
                  status: "success",
                });
              });

              stream.on("error", (err) => {
                console.error(`Stream error for file ${file}:`, err);
                reject(err);
              });
            }
          } catch (err) {
            console.error(`Error processing file ${file}:`, err);
            reject(err);
            return;
          }
        });
        resolve();
      });

      peer.on("error", (err) => {
        console.error("Peer connection error:", err);
        reject(err);
      });

      socket.on("signal", (data) => {
        if (data.to === "sender") {
          peer.signal(data.signal);
        }
      });

      currentTransfer = peer;
    } catch (err) {
      console.error("Send files error:", err);
      reject(err);
    }
  });
}

function sendFolder(folderPath, device, onProgress, addHistory, chunked = false) {
  return new Promise((resolve, reject) => {
    try {
      const peer = initPeer(true, "sender");
      let totalSize = 0;
      let transferred = 0;
      const files = [];

      function walkDir(dir) {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walkDir(fullPath);
            } else {
              files.push({ path: fullPath, relativePath: path.relative(folderPath, fullPath) });
              totalSize += fs.statSync(fullPath).size;
            }
          }
        } catch (err) {
          console.error(`Failed to read directory ${dir}:`, err);
          throw err;
        }
      }

      walkDir(folderPath);

      const socket = initSocket(device);

      peer.on("signal", (data) => {
        socket.emit("signal", { to: device.name, signal: data }, (err) => {
          if (err) console.error("Signal emit error:", err);
        });
      });

      peer.on("connect", () => {
        files.forEach((file) => {
          try {
            const stream = fs.createReadStream(file.path);
            const name = file.relativePath.replace(/\\/g, "/");
            let fileData = Buffer.alloc(0);

            stream.on("data", (chunk) => {
              fileData = Buffer.concat([fileData, chunk]);
            });

            stream.on("end", () => {
              const data = { type: "file", name, data: fileData, folder: path.basename(folderPath) };
              if (chunked) {
                const CHUNK_SIZE = 1024 * 1024;
                for (let i = 0; i < fileData.length; i += CHUNK_SIZE) {
                  const chunk = fileData.slice(i, i + CHUNK_SIZE);
                  peer.send(JSON.stringify({ ...data, chunk, chunkIndex: i / CHUNK_SIZE, totalChunks: Math.ceil(fileData.length / CHUNK_SIZE) }));
                  transferred += chunk.length;
                  onProgress(transferred / totalSize);
                }
              } else {
                peer.send(JSON.stringify(data));
                transferred += fileData.length;
                onProgress(transferred / totalSize);
              }
              addHistory({
                id: Date.now(),
                type: "send",
                fileName: name,
                device: device.name,
                timestamp: new Date().toISOString(),
                status: "success",
              });
            });

            stream.on("error", (err) => {
              console.error(`Stream error for file ${file.path}:`, err);
              reject(err);
            });
          } catch (err) {
            console.error(`Error processing file ${file.path}:`, err);
            reject(err);
            return;
          }
        });
        resolve();
      });

      peer.on("error", (err) => {
        console.error("Peer connection error:", err);
        reject(err);
      });

      socket.on("signal", (data) => {
        if (data.to === "sender") {
          peer.signal(data.signal);
        }
      });

      currentTransfer = peer;
    } catch (err) {
      console.error("Send folder error:", err);
      reject(err);
    }
  });
}

function sendMessage(text, device) {
  try {
    const peer = initPeer(true, "sender");
    const store = require("../store");
    const encryptionKeys = store.get("encryptionKeys") || {};
    const encryptedText = encryptionKeys.publicKey ? encryptData(text, encryptionKeys.publicKey) : text;

    const socket = initSocket(device);

    peer.on("signal", (data) => {
      socket.emit("signal", { to: device.name, signal: data }, (err) => {
        if (err) console.error("Signal emit error:", err);
      });
    });

    peer.on("connect", () => {
      peer.send(JSON.stringify({ type: "message", text: encryptedText, sender: "You" }));
      peer.destroy();
    });

    peer.on("error", (err) => {
      console.error("Peer connection error:", err);
    });

    socket.on("signal", (data) => {
      if (data.to === "sender") {
        peer.signal(data.signal);
      }
    });
  } catch (err) {
    console.error("Send message error:", err);
  }
}

function receiveData(peer, autoReceive, addHistory, setReceivedFiles, generatePreview, setMessages, onUpdate) {
  try {
    const chunks = {};
    const socket = initSocket({ host: "localhost", port: 4321 });

    peer.on("signal", (data) => {
      socket.emit("signal", { to: "receiver", signal: data }, (err) => {
        if (err) console.error("Signal emit error:", err);
      });
    });

    peer.on("data", (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        const store = require("../store");
        const encryptionKeys = store.get("encryptionKeys") || {};
        if (parsed.chunk) {
          if (!chunks[parsed.name]) chunks[parsed.name] = { chunks: [], total: parsed.totalChunks };
          chunks[parsed.name].chunks[parsed.chunkIndex] = parsed.chunk;
          if (chunks[parsed.name].chunks.filter(Boolean).length === parsed.totalChunks) {
            const fullData = Buffer.concat(chunks[parsed.name].chunks);
            handleData({ ...parsed, data: fullData }, autoReceive, addHistory, setReceivedFiles, generatePreview, setMessages, onUpdate, encryptionKeys);
            delete chunks[parsed.name];
          }
        } else {
          handleData(parsed, autoReceive, addHistory, setReceivedFiles, generatePreview, setMessages, onUpdate, encryptionKeys);
        }
      } catch (err) {
        console.error("Data parsing error:", err);
      }
    });

    peer.on("error", (err) => {
      console.error("Peer data error:", err);
    });

    socket.on("signal", (data) => {
      if (data.to === "receiver") {
        peer.signal(data.signal);
      }
    });
  } catch (err) {
    console.error("Receive data error:", err);
  }
}

function handleData(parsed, autoReceive, addHistory, setReceivedFiles, generatePreview, setMessages, onUpdate, encryptionKeys) {
  try {
    const decryptedData = parsed.text && encryptionKeys.privateKey ? decryptData(parsed.text, encryptionKeys.privateKey) : parsed.text;
    const store = require("../store");
    const settings = store.get("settings") || {};
    if (parsed.type === "file" || parsed.type === "folder") {
      const savePath = parsed.folder
        ? path.join(settings.autoSavePath, parsed.folder, parsed.name)
        : path.join(settings.autoSavePath, parsed.name);
      setReceivedFiles((prev) => [...prev, { name: parsed.name, data: parsed.data, folder: parsed.folder }]);
      generatePreview(parsed.data, parsed.name);
      addHistory({
        id: Date.now(),
        type: "receive",
        fileName: parsed.name,
        device: "Unknown",
        timestamp: new Date().toISOString(),
        status: "success",
      });
      if (autoReceive) {
        try {
          fs.mkdirSync(path.dirname(savePath), { recursive: true });
          fs.writeFileSync(savePath, parsed.data);
        } catch (err) {
          console.error(`Failed to save file ${savePath}:`, err);
        }
      }
    } else if (parsed.type === "message") {
      setMessages((prev) => [...prev, { text: decryptedData || parsed.text, sender: parsed.sender, timestamp: new Date() }]);
    } else if (parsed.type === "update") {
      onUpdate(parsed);
    }
  } catch (err) {
    console.error("Handle data error:", err);
  }
}

function sendUpdate(updateFilePath, device, onProgress, addHistory) {
  return new Promise((resolve, reject) => {
    try {
      const peer = initPeer(true, "sender");
      let fileData;
      try {
        fileData = fs.readFileSync(updateFilePath);
      } catch (err) {
        console.error(`Failed to read update file ${updateFilePath}:`, err);
        reject(err);
        return;
      }
      const name = path.basename(updateFilePath);
      let transferred = 0;
      const totalSize = fileData.length;

      const socket = initSocket(device);

      peer.on("signal", (data) => {
        socket.emit("signal", { to: device.name, signal: data }, (err) => {
          if (err) console.error("Signal emit error:", err);
        });
      });

      peer.on("connect", () => {
        peer.send(JSON.stringify({ type: "update", name, file: fileData }));
        transferred += fileData.length;
        onProgress(transferred / totalSize);
        addHistory({
          id: Date.now(),
          type: "update",
          fileName: name,
          device: device.name,
          timestamp: new Date().toISOString(),
          status: "success",
        });
        resolve();
      });

      peer.on("error", (err) => {
        console.error("Peer connection error:", err);
        reject(err);
      });

      socket.on("signal", (data) => {
        if (data.to === "sender") {
          peer.signal(data.signal);
        }
      });
    } catch (err) {
      console.error("Send update error:", err);
      reject(err);
    }
  });
}

function compareFiles(file1, file2) {
  try {
    const hash1 = require("crypto").createHash("sha256").update(fs.readFileSync(file1)).digest("hex");
    const hash2 = require("crypto").createHash("sha256").update(fs.readFileSync(file2)).digest("hex");
    return hash1 === hash2;
  } catch (err) {
    console.error("Compare files error:", err);
    return false;
  }
}

function cancelTransfer() {
  try {
    if (currentTransfer) {
      currentTransfer.destroy();
      currentTransfer = null;
    }
  } catch (err) {
    console.error("Cancel transfer error:", err);
  }
}

module.exports = {
  initPeer,
  sendFiles,
  sendFolder,
  sendMessage,
  receiveData,
  sendUpdate,
  compareFiles,
  cancelTransfer,
};