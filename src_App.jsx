import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import HomeTab from "./components/HomeTab";
import ChatTab from "./components/ChatTab";
import SettingsTab from "./components/SettingsTab";
import "./index.css";

function App() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("home");
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [settings, setSettings] = useState({
    theme: "dark",
    enableNotifications: true,
    autoReceive: false,
    miniModeDefault: false,
  });

  useEffect(() => {
    const { ipcRenderer } = window.require("electron");
    const fetchDevices = async () => {
      const deviceList = await ipcRenderer.invoke("get-devices");
      setDevices(deviceList);
    };
    fetchDevices();

    ipcRenderer.on("navigate-tab", (event, tab) => {
      setActiveTab(tab);
    });
    ipcRenderer.on("update-settings", () => {
      setSettings({ ...store.get("settings") });
    });

    return () => {
      ipcRenderer.removeAllListeners("navigate-tab");
      ipcRenderer.removeAllListeners("update-settings");
    };
  }, []);

  const tabs = [
    { id: "home", label: t("dashboard"), icon: "🏠" },
    { id: "chat", label: t("chat"), icon: "💬" },
    { id: "settings", label: t("settings"), icon: "⚙️" },
  ];

  return (
    <div className="flex h-screen bg-[#2F3136] text-[#B9BBBE] font-sans">
      <motion.div
        className="w-72 bg-[#202225] p-4 flex flex-col"
        initial={{ x: -72 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-xl font-bold text-white mb-4">Intra Share</h1>
        <div className="flex-1 overflow-y-auto">
          <h2 className="text-sm font-semibold text-[#72767D] mb-2">{t("select_device")}</h2>
          {devices.map((device) => (
            <motion.div
              key={device.name}
              className={`flex items-center p-2 rounded-lg cursor-pointer ${
                selectedDevice === device.name ? "bg-[#7289DA] text-white" : "hover:bg-[#35393F]"
              }`}
              onClick={() => setSelectedDevice(device.name)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="w-8 h-8 rounded-full bg-[#43B581] flex items-center justify-center mr-2">
                {device.status === "online" ? "🟢" : "🔴"}
              </span>
              <div>
                <p className="text-sm font-medium">{device.name}</p>
                <p className="text-xs text-[#72767D]">{device.host}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <div className="flex-1 flex flex-col">
        <div className="bg-[#36393F] p-2 flex justify-between items-center">
          <div className="flex space-x-2">
            {tabs.map((tab) => (
              <motion.button
                key={tab.id}
                className={`px-4 py-2 rounded-lg ${
                  activeTab === tab.id ? "bg-[#7289DA] text-white" : "hover:bg-[#4F545C]"
                }`}
                onClick={() => setActiveTab(tab.id)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                {tab.icon} {tab.label}
              </motion.button>
            ))}
          </div>
          <motion.button
            className="text-[#B9BBBE] hover:text-white"
            onClick={() => window.require("electron").ipcRenderer.send("toggle-mini-mode")}
            whileHover={{ rotate: 360 }}
            transition={{ duration: 0.3 }}
          >
            🔲
          </motion.button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          <AnimatePresence mode="wait">
            {activeTab === "home" && (
              <motion.div
                key="home"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                <HomeTab selectedDevice={selectedDevice} settings={settings} />
              </motion.div>
            )}
            {activeTab === "chat" && (
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                <ChatTab selectedDevice={selectedDevice} settings={settings} />
              </motion.div>
            )}
            {activeTab === "settings" && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                <SettingsTab settings={settings} setSettings={setSettings} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default App;