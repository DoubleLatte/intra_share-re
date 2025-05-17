const Peer = require("simple-peer");
const wrtc = require("wrtc");
const { encryptData, decryptData } = require("./encryption");

let currentTransfer = null;

function initPeer(initiator, id, options = {}) {
  const peer = new Peer({
    initiator,
    trickle: false,
    wrtc,
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "turn:turn.example.com", username: "user", credential: "pass" },
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
    const fs = require("fs");
    let totalSize = 0;
    let transferred = 0;

    files.forEach((file) => {
      totalSize += fs.statSync(file).size;
    });

    peer.on("signal", (data) => {
      require("socket.io-client")("http://localhost:3000").emit("signal", {
        to: device,
        signal: data,
      });
    });

    peer.on("connect", () => {
      files.forEach((file) => {
        const fileData = fs.readFileSync(file);
        const name = require("path").basename(file);
        const data = { type: "file", name, data: fileData };
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
          device,
          timestamp: new Date().toISOString(),
          status: "success",
        });
      });
      resolve();
    });

    peer.on("error", (err) => reject(err));

    require("socket.io-client")("http://localhost:3000").on("signal", (data) => {
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
    const fs = require("fs");
    const fileData = fs.readFileSync(folderPath);
    const name = require("path").basename(folderPath);
    let transferred = 0;
    const totalSize = fileData.length;

    peer.on("signal", (data) => {
      require("socket.io-client")("http://localhost:3000").emit("signal", {
        to: device,
        signal: data,
      });
    });

    peer.on("connect", () => {
      const data = { type: "folder", name, data: fileData };
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
        onProgress(1);
      }
      addHistory({
        id: Date.now(),
        type: "send",
        fileName: name,
        device,
        timestamp: new Date().toISOString(),
        status: "success",
      });
      resolve();
    });

    peer.on("error", (err) => reject(err));

    require("socket.io-client")("http://localhost:3000").on("signal", (data) => {
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

  peer.on("signal", (data) => {
    require("socket.io-client")("http://localhost:3000").emit("signal", {
      to: device,
      signal: data,
    });
  });

  peer.on("connect", () => {
    peer.send(JSON.stringify({ type: "message", text: encryptedText, sender: "You" }));
    peer.destroy();
  });

  require("socket.io-client")("http://localhost:3000").on("signal", (data) => {
    if (data.to === "sender") {
      peer.signal(data.signal);
    }
  });
}

function receiveData(peer, autoReceive, addHistory, setReceivedFiles, generatePreview, setMessages, onUpdate) {
  const chunks = {};
  peer.on("signal", (data) => {
    require("socket.io-client")("http://localhost:3000").emit("signal", {
      to: "receiver",
      signal: data,
    });
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

  require("socket.io-client")("http://localhost:3000").on("signal", (data) => {
    if (data.to === "receiver") {
      peer.signal(data.signal);
    }
  });
}

function handleData(parsed, autoReceive, addHistory, setReceivedFiles, generatePreview, setMessages, onUpdate, encryptionKeys) {
  const decryptedData = parsed.text && encryptionKeys.privateKey ? decryptData(parsed.text, encryptionKeys.privateKey) : parsed.text;
  if (parsed.type === "file" || parsed.type === "folder") {
    setReceivedFiles((prev) => [...prev, { name: parsed.name, data: parsed.data }]);
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
      const fs = require("fs");
      fs.mkdirSync("./Received", { recursive: true });
      fs.writeFileSync(`./Received/${parsed.name}`, parsed.data);
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
    const fs = require("fs");
    const fileData = fs.readFileSync(updateFilePath);
    const name = require("path").basename(updateFilePath);
    let transferred = 0;
    const totalSize = fileData.length;

    peer.on("signal", (data) => {
      require("socket.io-client")("http://localhost:3000").emit("signal", {
        to: device,
        signal: data,
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
        device,
        timestamp: new Date().toISOString(),
        status: "success",
      });
      resolve();
    });

    peer.on("error", (err) => reject(err));

    require("socket.io-client")("http://localhost:3000").on("signal", (data) => {
      if (data.to === "sender") {
        peer.signal(data.signal);
      }
    });
  });
}

function compareFiles(file1, file2) {
  const fs = require("fs");
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