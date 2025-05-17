import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { initPeer, sendFiles, sendFolder, receiveData, compareFiles, sendUpdate, cancelTransfer } from "../utils/peer";
import { zipFolder, zipFiles, convertFile } from "../utils/zip";
import { saveFileVersion } from "../utils/version";
import { motion } from "framer-motion";

ChartJS.register(ArcElement, Tooltip, Legend);

function HomeTab({ selectedDevice, settings }) {
  const { t } = useTranslation();
  const [transferStatus, setTransferStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [metadata, setMetadata] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [priorities, setPriorities] = useState({});
  const [comparisonResult, setComparisonResult] = useState("");
  const [updateDevice, setUpdateDevice] = useState(null);
  const [isTransferring, setIsTransferring] = useState(false);

  const chartData = {
    labels: [t("transferred"), t("remaining")],
    datasets: [
      {
        data: [progress, 100 - progress],
        backgroundColor: ["#7289DA", "#4F545C"],
        borderColor: ["#7289DA", "#4F545C"],
        borderWidth: 1,
      },
    ],
  };

  useEffect(() => {
    const { ipcRenderer } = window.require("electron");
    const peer = initPeer(false, "receiver", { bandwidthLimit: settings.bandwidthLimit });
    receiveData(peer, settings.autoReceive, addHistory, setReceivedFiles, generatePreview, setTransferStatus, (data) => {
      if (data.type === "update") {
        const savePath = "./updates/update.zip";
        require("fs").mkdirSync("./updates", { recursive: true });
        require("fs").writeFileSync(savePath, data.file);
        ipcRenderer.send("apply-update", savePath);
      }
    });

    ipcRenderer.on("update-available", (event, device) => {
      setUpdateDevice(device);
    });

    ipcRenderer.on("share-files", (event, filePaths) => {
      handleFileShare(filePaths);
    });

    return () => {
      peer.destroy();
      ipcRenderer.removeAllListeners("update-available");
      ipcRenderer.removeAllListeners("share-files");
    };
  }, [settings]);

  const addHistory = (entry) => {
    const history = store.get("history") || [];
    store.set("history", [...history, entry]);
  };

  const generatePreview = (data, name) => {
    const extension = name.split(".").pop().toLowerCase();
    if (["png", "jpg", "jpeg"].includes(extension)) {
      const blob = new Blob([data], { type: `image/${extension}` });
      const url = URL.createObjectURL(blob);
      setPreviews((prev) => [...prev, { name, url, type: "image" }]);
    } else if (extension === "txt") {
      const text = new TextDecoder().decode(data);
      setPreviews((prev) => [...prev, { name, content: text.slice(0, 100), type: "text" }]);
    }
  };

  const getFileMetadata = (path) => {
    const fs = require("fs");
    const pathModule = require("path");
    const stats = fs.statSync(path);
    return {
      name: pathModule.basename(path),
      size: (stats.size / 1024).toFixed(2) + " KB",
      modified: new Date(stats.mtime).toLocaleString(),
      type: pathModule.extname(path).toLowerCase() || "Unknown",
    };
  };

  const handleFileShare = async (filePaths = []) => {
    try {
      const { ipcRenderer } = window.require("electron");
      let paths = filePaths;
      if (paths.length === 0) {
        paths = await ipcRenderer.invoke("select-file");
      }
      if (paths.length === 0) {
        setTransferStatus(t("no_file_selected"));
        return;
      }
      if (!selectedDevice) {
        setTransferStatus(t("no_device_selected"));
        return;
      }

      setIsTransferring(true);
      setTransferStatus(t("transferring"));
      setProgress(0);
      setPreviews([]);
      let filesToSend = paths;

      if (settings.convertFiles) {
        filesToSend = await Promise.all(paths.map((path) => convertFile(path, settings.convertTo)));
      }
      if (settings.compressFiles) {
        const zipPath = await zipFiles(filesToSend);
        filesToSend = [zipPath];
        setMetadata([getFileMetadata(zipPath)]);
      } else {
        setMetadata(filesToSend.map(getFileMetadata));
      }

      filesToSend.forEach((path) => {
        generatePreview(require("fs").readFileSync(path), require("path").basename(path));
        saveFileVersion(path, selectedDevice);
      });

      const prioritizedFiles = filesToSend
        .map((path) => ({ path, priority: priorities[path] || 0 }))
        .sort((a, b) => b.priority - a.priority)
        .map((item) => item.path);

      ipcRenderer.send("start-transfer");
      await sendFiles(
        prioritizedFiles,
        selectedDevice,
        (prog) => {
          setProgress(Math.round(prog * 100));
          ipcRenderer.send("update-progress", { progress: Math.round(prog * 100), status: t("transferring") });
        },
        addHistory,
        settings.chunkedTransfer
      );

      setTransferStatus(`${t("transfer_complete")} ${filesToSend.length}`);
      ipcRenderer.send("end-transfer");
      if (settings.enableNotifications && settings.notificationEvents.home) {
        ipcRenderer.send("show-notification", {
          title: t("transfer_complete"),
          body: `${t("transfer_complete")} ${filesToSend.length}`,
          tab: "home",
        });
      }
    } catch (error) {
      const entry = {
        id: Date.now(),
        type: "send",
        fileName: "N/A",
        device: selectedDevice,
        timestamp: new Date().toISOString(),
        status: "failed",
      };
      addHistory(entry);
      setTransferStatus(`${t("transfer_failed")}: ${error.message}`);
      setProgress(0);
      ipcRenderer.send("end-transfer");
      ipcRenderer.send("show-notification", {
        title: t("transfer_failed"),
        body: error.message,
        tab: "home",
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const handleFolderShare = async () => {
    try {
      const { ipcRenderer } = window.require("electron");
      const folderPaths = await ipcRenderer.invoke("select-folder");
      if (folderPaths.length === 0) {
        setTransferStatus(t("no_folder_selected"));
        return;
      }
      if (!selectedDevice) {
        setTransferStatus(t("no_device_selected"));
        return;
      }

      setIsTransferring(true);
      setTransferStatus(t("transferring"));
      setProgress(0);
      setPreviews([]);
      const folderPath = folderPaths[0];
      const zipPath = await zipFolder(folderPath);
      setMetadata([getFileMetadata(zipPath)]);
      saveFileVersion(zipPath, selectedDevice);

      ipcRenderer.send("start-transfer");
      await sendFolder(
        zipPath,
        selectedDevice,
        (prog) => {
          setProgress(Math.round(prog * 100));
          ipcRenderer.send("update-progress", { progress: Math.round(prog * 100), status: t("transferring") });
        },
        addHistory,
        settings.chunkedTransfer
      );

      setTransferStatus(t("folder_transfer_complete"));
      ipcRenderer.send("end-transfer");
      if (settings.enableNotifications && settings.notificationEvents.home) {
        ipcRenderer.send("show-notification", {
          title: t("folder_transfer_complete"),
          body: t("folder_transfer_complete"),
          tab: "home",
        });
      }
    } catch (error) {
      const entry = {
        id: Date.now(),
        type: "send",
        fileName: "Folder",
        device: selectedDevice,
        timestamp: new Date().toISOString(),
        status: "failed",
      };
      addHistory(entry);
      setTransferStatus(`${t("transfer_failed")}: ${error.message}`);
      setProgress(0);
      ipcRenderer.send("end-transfer");
    } finally {
      setIsTransferring(false);
    }
  };

  const handleCancelTransfer = () => {
    cancelTransfer();
    setIsTransferring(false);
    setTransferStatus(t("transfer_cancelled"));
    setProgress(0);
    ipcRenderer.send("end-transfer");
  };

  const saveFile = (fileData, fileName) => {
    const fs = require("fs");
    const savePath = `./Received/${fileName}`;
    fs.mkdirSync("./Received", { recursive: true });
    fs.writeFileSync(savePath, fileData);
    setMetadata((prev) => [...prev, getFileMetadata(savePath)]);
    saveFileVersion(savePath, "Local");
    setTransferStatus(`${t("file_saved")}: ${fileName}`);
    if (settings.enableNotifications && settings.notificationEvents.home) {
      const { ipcRenderer } = window.require("electron");
      ipcRenderer.send("show-notification", {
        title: t("file_saved"),
        body: `${t("file_saved")}: ${fileName}`,
        tab: "home",
      });
    }
  };

  const handleFileCompare = async () => {
    const { ipcRenderer } = window.require("electron");
    const files = await ipcRenderer.invoke("select-file");
    if (files.length !== 2) {
      setComparisonResult(t("select_two_files"));
      return;
    }
    const result = await compareFiles(files[0], files[1]);
    setComparisonResult(result ? t("files_identical") : t("files_different"));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).map((file) => file.path);
    if (files.length > 0) {
      handleFileShare(files);
    }
  };

  const setFilePriority = (path, priority) => {
    setPriorities((prev) => ({ ...prev, [path]: priority }));
  };

  return (
    <motion.div
      className="bg-[#36393F] rounded-lg p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <h1 className="text-2xl font-bold text-white">{t("app_name")}</h1>
      <div
        className={`mt-4 p-4 border-2 border-dashed rounded-lg ${
          isDragging ? "border-[#7289DA] bg-[#4F545C]" : "border-[#72767D]"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <p className="text-center text-[#B9BBBE]">{t("drag_drop")}</p>
      </div>
      <div className="mt-4 flex space-x-4">
        <motion.button
          className="bg-[#7289DA] text-white px-4 py-2 rounded-lg hover:bg-[#677BC4]"
          onClick={handleFileShare}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {t("select_files")}
        </motion.button>
        <motion.button
          className="bg-[#7289DA] text-white px-4 py-2 rounded-lg hover:bg-[#677BC4]"
          onClick={handleFolderShare}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {t("select_folder")}
        </motion.button>
        <motion.button
          className="bg-[#7289DA] text-white px-4 py-2 rounded-lg hover:bg-[#677BC4]"
          onClick={handleFileCompare}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {t("compare_files")}
        </motion.button>
        {isTransferring && (
          <motion.button
            className="bg-[#DA373C] text-white px-4 py-2 rounded-lg hover:bg-[#C53030]"
            onClick={handleCancelTransfer}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {t("cancel_transfer")}
          </motion.button>
        )}
      </div>
      {progress > 0 && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold text-white">{t("transfer_progress")}</h2>
          <div className="w-32 h-32 mx-auto">
            <Doughnut data={chartData} />
          </div>
        </div>
      )}
      {metadata.length > 0 && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold text-white">{t("file_metadata")}</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#4F545C]">
                <th className="border border-[#72767D] p-2 text-white">{t("file_name")}</th>
                <th className="border border-[#72767D] p-2 text-white">{t("size")}</th>
                <th className="border border-[#72767D] p-2 text-white">{t("modified")}</th>
                <th className="border border-[#72767D] p-2 text-white">{t("type")}</th>
                <th className="border border-[#72767D] p-2 text-white">{t("priority")}</th>
              </tr>
            </thead>
            <tbody>
              {metadata.map((meta, index) => (
                <tr key={index}>
                  <td className="border border-[#72767D] p-2">{meta.name}</td>
                  <td className="border border-[#72767D] p-2">{meta.size}</td>
                  <td className="border border-[#72767D] p-2">{meta.modified}</td>
                  <td className="border border-[#72767D] p-2">{meta.type}</td>
                  <td className="border border-[#72767D] p-2">
                    <select
                      value={priorities[meta.name] || "medium"}
                      onChange={(e) => setFilePriority(meta.name, e.target.value)}
                      className="bg-[#36393F] text-[#B9BBBE] rounded p-1"
                    >
                      <option value="low">{t("low")}</option>
                      <option value="medium">{t("medium")}</option>
                      <option value="high">{t("high")}</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {previews.length > 0 && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold text-white">{t("file_preview")}</h2>
          <div className="grid grid-cols-3 gap-4">
            {previews.map((preview, index) => (
              <div key={index} className="bg-[#4F545C] p-4 rounded-lg">
                {preview.type === "image" ? (
                  <img src={preview.url} alt={preview.name} className="w-full h-32 object-cover rounded" />
                ) : (
                  <p className="text-[#B9BBBE]">{preview.content}</p>
                )}
                <p className="mt-2 text-sm text-[#B9BBBE]">{preview.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {receivedFiles.length > 0 && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold text-white">{t("received_files")}</h2>
          <ul>
            {receivedFiles.map((file, index) => (
              <li key={index} className="flex justify-between items-center p-2 bg-[#4F545C] rounded-lg mb-2">
                <span>{file.name}</span>
                <motion.button
                  className="bg-[#7289DA] text-white px-3 py-1 rounded-lg hover:bg-[#677BC4]"
                  onClick={() => saveFile(file.data, file.name)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {t("save")}
                </motion.button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {comparisonResult && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold text-white">{t("comparison_result")}</h2>
          <p className="text-[#B9BBBE]">{comparisonResult}</p>
        </div>
      )}
    </motion.div>
  );
}

export default HomeTab;