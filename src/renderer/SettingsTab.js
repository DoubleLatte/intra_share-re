import React, { useState, useEffect } from "react";

const { ipcRenderer } = window.electron;

function SettingsTab() {
  const [settings, setSettings] = useState({
    enableTray: true,
    enableNotifications: true,
    hamachiEnabled: false,
    manualIpEnabled: false,
    firewallAutoConfig: true,
    autoSavePath: "./Received",
    autoStart: false,
  });

  useEffect(() => {
    ipcRenderer.invoke("get-settings").then((loadedSettings) => {
      setSettings(loadedSettings);
    });

    ipcRenderer.on("settings-updated", (event, updatedSettings) => {
      setSettings(updatedSettings);
    });

    return () => {
      ipcRenderer.removeAllListeners("settings-updated");
    };
  }, []);

  const handleToggle = async (key) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    const result = await ipcRenderer.invoke("save-settings", newSettings);
    if (!result.success) {
      alert(`Failed to save settings: ${result.error}`);
    }
  };

  const selectSavePath = async () => {
    const result = await ipcRenderer.invoke("select-folder");
    if (result[0]) {
      const newSettings = { ...settings, autoSavePath: result[0] };
      const saveResult = await ipcRenderer.invoke("save-settings", newSettings);
      if (!saveResult.success) {
        alert(`Failed to save settings: ${saveResult.error}`);
      }
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Settings</h2>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.enableTray}
            onChange={() => handleToggle("enableTray")}
          />
          Enable System Tray
        </label>
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.enableNotifications}
            onChange={() => handleToggle("enableNotifications")}
          />
          Enable Notifications
        </label>
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.hamachiEnabled}
            onChange={() => handleToggle("hamachiEnabled")}
          />
          Enable Hamachi Support
        </label>
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.manualIpEnabled}
            onChange={() => handleToggle("manualIpEnabled")}
          />
          Enable Manual IP Input
        </label>
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.firewallAutoConfig}
            onChange={() => handleToggle("firewallAutoConfig")}
          />
          Enable Automatic Firewall Configuration
        </label>
      </div>
      <div>
        <label>
          Auto Save Path:
          <input
            type="text"
            value={settings.autoSavePath}
            readOnly
            style={{ marginLeft: "10px", width: "200px" }}
          />
          <button onClick={selectSavePath} style={{ marginLeft: "10px" }}>
            Choose Path
          </button>
        </label>
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.autoStart}
            onChange={() => handleToggle("autoStart")}
          />
          Start on System Boot
        </label>
      </div>
    </div>
  );
}

export default SettingsTab;
