const Peer = require("simple-peer");
const wrtc = require("wrtc");
const { encryptData, decryptData } = require("./encryption");
const { io } = require("socket.io-client");
const fs = require("fs");
const path = require("path");

let currentTransfer = null;
let socket = null;

function initSocket(device) {
  if (!socket || socket.disconnected) {
    socket = io(`http://${device.host}:${device.port}`, { reconnection: true });
  }
  return socket;
}

function initPeer(initiator, id, options = {}) {
  const peer = new Peer({
    initiator,
    trickle: false,
    wrtc,
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        // 실제 TURN 서버 추가 필요
        // { urls: "turn:your-turn-server.com", username: "user", credential: "pass" },
      ],
    },
  });

  peer.on("error", (err) => {
    console.error("Peer error:", err);
  });

  return peer;
}

function sendFiles(files, device, onProgress, addHistory, chunked = false) {
  return new Promise((resolve, reject) => {
    const peer = initPeer(true, "sender");
    let totalSize = 0;
    let transferred = 0;

    files.forEach((file) => {
      totalSize += fs.statSync(file).size;
    });

    const socket = initSocket(device);

    peer.on("signal", (data) => {
      socket.emit("signal", { to: device.name, signal: data });
    });

    peer.on("connect", () => {
      files.forEach((file) => {
        const fileData = fs.readFileSync(file);
        const name = path.basename(file);
        const data = { type: "file", name, data: fileData };
        if (chunked) {
          const CHUNK_SIZE = 1024 * 1024; // 1MB
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
      resolve();
    });

    peer.on("error", (err) => reject(err));

    socket.on("signal", (data) => {
      if (data.to === "sender") {
        peer.signal(data.signal);
      }
    });

    currentTransfer = peer;
  });
}

function sendFolder(folderPath, device, onProgress, addHistory, chunked = false) {
  return new Promise((resolve, reject) => {
    const peer = initPeer(true, "sender");
    let totalSize = 0;
    let transferred = 0;
    const files = [];

    // 폴더 내 파일 목록 수집
    function walkDir(dir) {
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
    }

    walkDir(folderPath);

    const socket = initSocket(device);

    peer.on("signal", (data) => {
      socket.emit("signal", { to: device.name, signal: data });
    });

    peer.on("connect", () => {
      files.forEach((file) => {
        const fileData = fs.readFileSync(file.path);
        const name = file.relativePath.replace(/\\/g, "/"); // Windows 경로 슬래시 변환
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
      resolve();
    });

    peer.on("error", (err) => reject(err));

    socket.on("signal", (data) => {
      if (data.to === "sender") {
        peer.signal(data.signal);
      }
    });

    currentTransfer = peer;
  });
}

function sendMessage(text, device) {
  const peer = initPeer(true, "sender");
  const store = require("../store");
  const encryptionKeys = store.get("encryptionKeys") || {};
  const encryptedText = encryptionKeys.publicKey ? encryptData(text, encryptionKeys.publicKey) : text;

  const socket = initSocket(device);

  peer.on("signal", (data) => {
    socket.emit("signal", { to: device.name, signal: data });
  });

  peer.on("connect", () => {
    peer.send(JSON.stringify({ type: "message", text: encryptedText, sender: "You" }));
    peer.destroy();
  });

  socket.on("signal", (data) => {
    if (data.to === "sender") {
      peer.signal(data.signal);
    }
  });
}

function receiveData(peer, autoReceive, addHistory, setReceivedFiles, generatePreview, setMessages, onUpdate) {
  const chunks = {};
  const socket = initSocket({ host: "localhost", port: 3000 }); // 수신자는 기본 시그널링 서버 사용

  peer.on("signal", (data) => {
    socket.emit("signal", { to: "receiver", signal: data });
  });

  peer.on("data", (data) => {
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
  });

  socket.on("signal", (data) => {
    if (data.to === "receiver") {
      peer.signal(data.signal);
    }
  });
}

function handleData(parsed, autoReceive, addHistory, setReceivedFiles, generatePreview, setMessages, onUpdate, encryptionKeys) {
  const decryptedData = parsed.text && encryptionKeys.privateKey ? decryptData(parsed.text, encryptionKeys.privateKey) : parsed.text;
  if (parsed.type === "file" || parsed.type === "folder") {
    const savePath = parsed.folder ? `./Received/${parsed.folder}/${parsed.name}` : `./Received/${parsed.name}`;
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
      fs.mkdirSync(path.dirname(savePath), { recursive: true });
      fs.writeFileSync(savePath, parsed.data);
    }
  } else if (parsed.type === "message") {
    setMessages((prev) => [...prev, { text: decryptedData || parsed.text, sender: parsed.sender, timestamp: new Date() }]);
  } else if (parsed.type === "update") {
    onUpdate(parsed);
  }
}

function sendUpdate(updateFilePath, device, onProgress, addHistory) {
  return new Promise((resolve, reject) => {
    const peer = initPeer(true, "sender");
    const fileData = fs.readFileSync(updateFilePath);
    const name = path.basename(updateFilePath);
    let transferred = 0;
    const totalSize = fileData.length;

    const socket = initSocket(device);

    peer.on("signal", (data) => {
      socket.emit("signal", { to: device.name, signal: data });
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

    peer.on("error", (err) => reject(err));

    socket.on("signal", (data) => {
      if (data.to === "sender") {
        peer.signal(data.signal);
      }
    });
  });
}

function compareFiles(file1, file2) {
  const hash1 = require("crypto").createHash("sha256").update(fs.readFileSync(file1)).digest("hex");
  const hash2 = require("crypto").createHash("sha256").update(fs.readFileSync(file2)).digest("hex");
  return hash1 === hash2;
}

function cancelTransfer() {
  if (currentTransfer) {
    currentTransfer.destroy();
    currentTransfer = null;
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
