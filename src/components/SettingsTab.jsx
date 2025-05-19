import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { requestVersionInfo, compareVersions } from "../utils/versionCheck";

function SettingsTab({ settings, setSettings, clearHistory, updateStatus }) {
  const { t } = useTranslation();
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDevices, setNewGroupDevices] = useState("");
  const [profileName, setProfileName] = useState(settings.userProfile.name);
  const [profileIcon, setProfileIcon] = useState(settings.userProfile.icon);
  const [backgroundImage, setBackgroundImage] = useState(settings.customTheme.backgroundImage);
  const [fontFamily, setFontFamily] = useState(settings.customTheme.fontFamily);
  const [versionInfo, setVersionInfo] = useState([]);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [shortcuts, setShortcuts] = useState(settings.shortcuts || {
    fileShare: "Ctrl+Shift+F",
    chatSend: "Ctrl+Enter",
  });
  const [patchNote, setPatchNote] = useState("");

  const handleSave = () => {
    setSettings({
      ...settings,
      userProfile: { name: profileName, icon: profileIcon },
      customTheme: { backgroundImage, fontFamily },
      shortcuts,
      notificationDevices: settings.notificationDevices || {},
      retryAttempts: settings.retryAttempts || 3,
      enableTray: settings.enableTray !== undefined ? settings.enableTray : true,
    });
    const { ipcRenderer } = window.require("electron");
    ipcRenderer.send("update-tray");
    alert(t("settings_saved"));
  };

  const handleClearHistory = () => {
    clearHistory();
    alert(t("history_cleared"));
  };

  const addDeviceGroup = () => {
    if (newGroupName && newGroupDevices) {
      const devices = newGroupDevices.split(",").map((d) => d.trim());
      const newGroup = { name: newGroupName, devices };
      setSettings({
        ...settings,
        deviceGroups: [...settings.deviceGroups, newGroup],
      });
      setNewGroupName("");
      setNewGroupDevices("");
    }
  };

  const removeDeviceGroup = (index) => {
    setSettings({
      ...settings,
      deviceGroups: settings.deviceGroups.filter((_, i) => i !== index),
    });
  };

  const handleIconUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setProfileIcon(url);
    }
  };

  const handleBackgroundUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setBackgroundImage(url);
    }
  };

  const handleUpdateNow = () => {
    const { ipcRenderer } = window.require("electron");
    ipcRenderer.send("check-update");
  };

  const handleGenerateKey = async () => {
    const { ipcRenderer } = window.require("electron");
    const publicKey = await ipcRenderer.invoke("generate-encryption-key");
    alert(t("encryption_key_generated"));
  };

  const handleCheckVersions = async () => {
    const { ipcRenderer } = window.require("electron");
    const devices = await ipcRenderer.invoke("get-devices");
    const results = [];
    for (const device of devices) {
      await new Promise((resolve) => {
        requestVersionInfo(device, (data) => {
          results.push({
            name: device.name,
            version: data.version,
            status: compareVersions("1.0.0", data.version),
            updateHistory: data.updateHistory || [],
          });
          resolve();
        });
      });
    }
    setVersionInfo(results);
    setShowVersionModal(true);
  };

  const handleToggleDeviceNotification = (deviceName) => {
    setSettings({
      ...settings,
      notificationDevices: {
        ...settings.notificationDevices,
        [deviceName]: !settings.notificationDevices[deviceName],
      },
    });
  };

  const handleSavePatchNote = () => {
    if (patchNote.trim()) {
      const updateHistory = store.get("updateHistory") || [];
      updateHistory.push({
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        changes: [patchNote],
      });
      store.set("updateHistory", updateHistory);
      setPatchNote("");
      alert(t("patch_note_saved"));
      const { ipcRenderer } = window.require("electron");
      ipcRenderer.send("update-tray");
    }
  };

  return (
    <div className="bg-[#36393F] text-[#B9BBBE] shadow-lg rounded-lg p-6">
      <h2 className="text-xl font-bold text-white">{t("settings")}</h2>
      <div className="mt-4">
        <h3 className="text-lg font-semibold text-white">{t("version_check")}</h3>
        <button
          className="bg-[#7289DA] text-white px-4 py-2 rounded hover:bg-[#677BC4]"
          onClick={handleCheckVersions}
        >
          {t("check_versions")}
        </button>
      </div>
      <div className="mt-4">
        <h3 className="text-lg font-semibold text-white">{t("auto_update")}</h3>
        <label className="text-[#B9BBBE] text-sm">
          <input
            type="checkbox"
            checked={settings.enableAutoUpdate}
            onChange={(e) => setSettings({ ...settings, enableAutoUpdate: e.target.checked })}
          />
          {t("enable_auto_update")}
        </label>
        {updateStatus && (
          <div className="mt-2">
            <p>{updateStatus}</p>
            <button
              className="mt-2 bg-[#7289DA] text-white px-4 py-2 rounded hover:bg-[#677BC4]"
              onClick={handleUpdateNow}
            >
              {t("update_now")}
            </button>
          </div>
        )}
      </div>
      <div className="mt-4">
        <h3 className="text-lg font-semibold text-white">{t("patch_notes")}</h3>
        <textarea
          className="border border-[#72767D] rounded p-2 w-full bg-[#2F3136] text-[#B9BBBE]"
          value={patchNote}
          onChange={(e) => setPatchNote(e.target.value)}
          placeholder={t("enter_patch_note")}
          rows={4}
        />
        <button
          className="mt-2 bg-[#7289DA] text-white px-4 py-2 rounded hover:bg-[#677BC4]"
          onClick={handleSavePatchNote}
        >
          {t("save_patch_note")}
        </button>
      </div>
      <div className="mt-4">
        <h3 className="text-lg font-semibold text-white">{t("retry_settings")}</h3>
        <label className="text-[#B9BBBE] text-sm">{t("retry_attempts")}</label>
        <input
          type="number"
          className="border border-[#72767D] rounded p-2 w-full bg-[#2F3136] text-[#B9BBBE]"
          value={settings.retryAttempts || 3}
          onChange={(e) => setSettings({ ...settings, retryAttempts: parseInt(e.target.value) || 3 })}
        />
      </div>
      <div className="mt-4">
        <h3 className="text-lg font-semibold text-white">{t("shortcuts")}</h3>
        <div className="mt-2">
          <label className="text-[#B9BBBE] text-sm">{t("file_share_shortcut")}</label>
          <input
            type="text"
            className="border border-[#72767D] rounded p-2 w-full bg-[#2F3136] text-[#B9BBBE]"
            value={shortcuts.fileShare}
            onChange={(e) => setShortcuts({ ...shortcuts, fileShare: e.target.value })}
          />
        </div>
        <div className="mt-2">
          <label className="text-[#B9BBBE] text-sm">{t("chat_send_shortcut")}</label>
          <input
            type="text"
            className="border border-[#72767D] rounded p-2 w-full bg-[#2F3136] text-[#B9BBBE]"
            value={shortcuts.chatSend}
            onChange={(e) => setShortcuts({ ...shortcuts, chatSend: e.target.value })}
          />
        </div>
      </div>
      <div className="mt-4">
        <h3 className="text-lg font-semibold text-white">{t("device_notifications")}</h3>
        {Object.keys(settings.notificationDevices).map((device) => (
          <label key={device} className="block text-[#B9BBBE] text-sm">
            <input
              type="checkbox"
              checked={settings.notificationDevices[device]}
              onChange={() => handleToggleDeviceNotification(device)}
            />
            {device}
          </label>
        ))}
      </div>
      <div className="mt-4">
        <h3 className="text-lg font-semibold text-white">{t("system_tray")}</h3>
        <label className="text-[#B9BBBE] text-sm">
          <input
            type="checkbox"
            checked={settings.enableTray !== undefined ? settings.enableTray : true}
            onChange={(e) => setSettings({ ...settings, enableTray: e.target.checked })}
          />
          {t("enable_system_tray")}
        </label>
      </div>
      <div className="mt-4">
        <h3 className="text-lg font-semibold text-white">{t("chat_encryption")}</h3>
        <button
          className="bg-[#7289DA] text-white px-4 py-2 rounded hover:bg-[#677BC4]"
          onClick={handleGenerateKey}
        >
          {t("generate_encryption_key")}
        </button>
      </div>
      <div className="mt-4">
        <h3 className="text-lg font-semibold text-white">{t("user_profile")}</h3>
        <div className="mt-2">
          <label className="text-[#B9BBBE] text-sm">{t("profile_name")}</label>
          <input
            type="text"
            className="border border-[#72767D] rounded p-2 w-full bg-[#2F3136] text-[#B9BBBE]"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
          />
        </div>
        <div className="mt-2">
          <label className="text-[#B9BBBE] text-sm">{t("profile_icon")}</label>
          <input type="file" accept="image/*" onChange={handleIconUpload} />
          {profileIcon && <img src={profileIcon} alt="Profile" className="w-16 h-16 mt-2 rounded-full" />}
        </div>
      </div>
      <div className="mt-4">
        <h3 className="text-lg font-semibold text-white">{t("custom_theme")}</h3>
        <div className="mt-2">
          <label className="text-[#B9BBBE] text-sm">{t("background_image")}</label>
          <input type="file" accept="image/*" onChange={handleBackgroundUpload} />
          {backgroundImage && <img src={backgroundImage} alt="Background" className="w-32 h-16 mt-2 rounded" />}
        </div>
        <div className="mt-2">
          <label className="text-[#B9BBBE] text-sm">{t("font_family")}</label>
          <select
            className="border border-[#72767D] rounded p-2 w-full bg-[#2F3136] text-[#B9BBBE]"
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
          >
            <option value="Noto Sans KR">Noto Sans KR</option>
            <option value="Arial">Arial</option>
            <option value="Helvetica">Helvetica</option>
          </select>
        </div>
      </div>
      <div className="mt-4">
        <label className="text-[#B9BBBE] text-sm">{t("theme")}</label>
        <select
          className="border border-[#72767D] rounded p-2 w-full bg-[#2F3136] text-[#B9BBBE]"
          value={settings.theme}
          onChange={(e) => setSettings({ ...settings, theme: e.target.value })}
        >
          <option value="dark">{t("dark")}</option>
          <option value="light">{t("light")}</option>
          <option value="highContrast">{t("high_contrast")}</option>
        </select>
      </div>
      <div className="mt-4">
        <label className="text-[#B9BBBE] text-sm">{t("primary_color")}</label>
        <input
          type="color"
          className="border border-[#72767D] rounded p-1 w-full bg-[#2F3136]"
          value={settings.customColor}
          onChange={(e) => setSettings({ ...settings, customColor: e.target.value })}
        />
      </div>
      <div className="mt-4">
        <label className="text-[#B9BBBE] text-sm">{t("opacity")}</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          className="w-full"
          value={settings.opacity}
          onChange={(e) => setSettings({ ...settings, opacity: e.target.value })}
        />
      </div>
      <div className="mt-4">
        <label className="text-[#B9BBBE] text-sm">
          <input
            type="checkbox"
            checked={settings.invert}
            onChange={(e) => setSettings({ ...settings, invert: e.target.checked })}
          />
          {t("invert_colors")}
        </label>
      </div>
      <div className="mt-4">
        <label className="text-[#B9BBBE] text-sm">{t("brightness")}</label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          className="w-full"
          value={settings.brightness}
          onChange={(e) => setSettings({ ...settings, brightness: e.target.value })}
        />
      </div>
      <div className="mt-4">
        <label className="text-[#B9BBBE] text-sm">{t("button_style")}</label>
        <select
          className="border border-[#72767D] rounded p-2 w-full bg-[#2F3136] text-[#B9BBBE]"
          value={settings.buttonStyle}
          onChange={(e) => setSettings({ ...settings, buttonStyle: e.target.value })}
        >
          <option value="rounded">{t("rounded")}</option>
          <option value="square">{t("square")}</option>
        </select>
      </div>
      <div className="mt-4">
        <label className="text-[#B9BBBE] text-sm">
          <input
            type="checkbox"
            checked={settings.autoReceive}
            onChange={(e) => setSettings({ ...settings, autoReceive: e.target.checked })}
          />
          {t("auto_receive")}
        </label>
      </div>
      <div className="mt-4">
        <label className="text-[#B9BBBE] text-sm">
          <input
            type="checkbox"
            checked={settings.compressFiles}
            onChange={(e) => setSettings({ ...settings, compressFiles: e.target.checked })}
          />
          {t("compress_files")}
        </label>
      </div>
      <div className="mt-4">
        <label className="text-[#B9BBBE] text-sm">
          <input
            type="checkbox"
            checked={settings.convertFiles}
            onChange={(e) => setSettings({ ...settings, convertFiles: e.target.checked })}
          />
          {t("convert_files")}
        </label>
        {settings.convertFiles && (
          <div className="mt-2">
            <label className="text-[#B9BBBE] text-sm">{t("convert_to")}</label>
            <select
              className="border border-[#72767D] rounded p-2 w-full bg-[#2F3136] text-[#B9BBBE]"
              onChange={(e) => setSettings({ ...settings, convertTo: e.target.value })}
            >
              <option value="jpg">{t("jpg")}</option>
              <option value="png">{t("png")}</option>
              <option value="pdf">{t("pdf")}</option>
            </select>
          </div>
        )}
      </div>
      <div className="mt-4">
        <label className="text-[#B9BBBE] text-sm">
          <input
            type="checkbox"
            checked={settings.chunkedTransfer}
            onChange={(e) => setSettings({ ...settings, chunkedTransfer: e.target.checked })}
          />
          {t("chunked_transfer")}
        </label>
      </div>
      <div className="mt-4">
        <label className="text-[#B9BBBE] text-sm">
          <input
            type="checkbox"
            checked={settings.lowPowerMode}
            onChange={(e)
