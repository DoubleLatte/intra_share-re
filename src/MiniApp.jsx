import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { sendFiles } from "./utils/peer";

function MiniApp() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const { ipcRenderer } = window.require("electron");
    const fetchDevices = async () => {
      const deviceList = await ipcRenderer.invoke("get-devices");
      setDevices(deviceList);
    };
    fetchDevices();
  }, []);

  const handleFileShare = async (filePaths = []) => {
    const { ipcRenderer } = window.require("electron");
    let paths = filePaths;
    if (paths.length === 0) {
      paths = await ipcRenderer.invoke("select-file");
    }
    if (paths.length === 0 || !selectedDevice) return;

    ipcRenderer.send("start-transfer");
    await sendFiles(
      paths,
      selectedDevice,
      (prog) => {
        ipcRenderer.send("update-progress", { progress: Math.round(prog * 100), status: t("transferring") });
      },
      (entry) => {
        const store = require("./store");
        store.set("history", [...(store.get("history") || []), entry]);
      }
    );
    ipcRenderer.send("end-transfer");
    ipcRenderer.send("show-notification", {
      title: t("transfer_complete"),
      body: `${t("transfer_complete")} ${paths.length}`,
      tab: "home",
    });
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

  return (
    <motion.div
      className="bg-[#2F3136] rounded-lg p-4 w-full h-full flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <h2 className="text-lg font-bold text-white">{t("app_name")}</h2>
      <select
        className="mt-2 border border-[#72767D] rounded p-2 bg-[#2F3136] text-[#B9BBBE]"
        value={selectedDevice}
        onChange={(e) => setSelectedDevice(e.target.value)}
      >
        <option value="">{t("select_device")}</option>
        {devices.map((device) => (
          <option key={device.name} value={device.name}>
            {device.name}
          </option>
        ))}
      </select>
      <div
        className={`mt-4 p-4 border-2 border-dashed rounded-lg flex-1 ${
          isDragging ? "border-[#7289DA] bg-[#4F545C]" : "border-[#72767D]"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <p className="text-center text-[#B9BBBE]">{t("drag_drop")}</p>
      </div>
      <motion.button
        className="mt-2 bg-[#7289DA] text-white px-4 py-2 rounded-lg hover:bg-[#677BC4]"
        onClick={handleFileShare}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {t("select_files")}
      </motion.button>
    </motion.div>
  );
}

export default MiniApp;