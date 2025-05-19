import React, { useState, useEffect } from "react";

const { ipcRenderer } = window.electron;

function SettingsTab() {
  const [settings, setSettings] = useState({
    general: {
      enableTray: true,
      autoStart: false,
      enableAutoUpdate: true,
      firewallAutoConfig: true,
      retryAttempts: 3,
    },
    ui: {
      theme: "dark",
      miniModeDefault: false,
      customTheme: { backgroundImage: "", fontFamily: "Noto Sans KR" },
      customColor: "#7289DA",
      opacity: 1,
      invert: false,
      brightness: 1,
      buttonStyle: "rounded",
    },
    notifications: {
      enableNotifications: true,
      enableSound: true,
      notificationEvents: { home: true, chat: true },
      notificationDevices: {},
    },
    network: {
      networkType: "local",
      enableHamachi: false,
      manualIpEnabled: false,
      bandwidthLimit: 0,
    },
    fileTransfer: {
      autoReceive: false,
      autoSavePath: "./Received",
      compressFiles: false,
      convertFiles: false,
      convertTo: "jpg",
      chunkedTransfer: false,
    },
    shortcuts: {
      fileShare: "Ctrl+Shift+F",
      chatSend: "Ctrl+Enter",
    },
    userProfile: {
      name: "User",
      icon: "",
    },
    miscellaneous: {
      lowPowerMode: false,
      deviceGroups: [],
    },
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

  const handleToggle = async (category, key) => {
    const newSettings = {
      ...settings,
      [category]: { ...settings[category], [key]: !settings[category][key] },
    };
    const result = await ipcRenderer.invoke("save-settings", newSettings);
    if (!result.success) {
      alert(`Failed to save settings: ${result.error}`);
    }
  };

  const handleChange = async (category, key, value) => {
    const newSettings = {
      ...settings,
      [category]: { ...settings[category], [key]: value },
    };
    const result = await ipcRenderer.invoke("save-settings", newSettings);
    if (!result.success) {
      alert(`Failed to save settings: ${result.error}`);
    }
  };

  const selectSavePath = async () => {
    const result = await ipcRenderer.invoke("select-folder");
    if (result[0]) {
      try {
        fs.accessSync(result[0], fs.constants.W_OK);
        const newSettings = {
          ...settings,
          fileTransfer: { ...settings.fileTransfer, autoSavePath: result[0] },
        };
        const saveResult = await ipcRenderer.invoke("save-settings", newSettings);
        if (!saveResult.success) {
          alert(`Failed to save settings: ${saveResult.error}`);
        }
      } catch (err) {
        alert("Selected path is not writable");
      }
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Settings</h2>
      <h3>General</h3>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.general.enableTray}
            onChange={() => handleToggle("general", "enableTray")}
          />
          Enable System Tray
        </label>
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.general.autoStart}
            onChange={() => handleToggle("general", "autoStart")}
          />
          Start on System Boot
        </label>
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.general.enableAutoUpdate}
            onChange={() => handleToggle("general", "enableAutoUpdate")}
          />
          Enable Auto Update
        </label>
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.general.firewallAutoConfig}
            onChange={() => handleToggle("general", "firewallAutoConfig")}
          />
          Enable Automatic Firewall Configuration
        </label>
      </div>
      <div>
        <label>
          Retry Attempts:
          <input
            type="number"
            value={settings.general.retryAttempts}
            onChange={(e) => handleChange("general", "retryAttempts", parseInt(e.target.value))}
            style={{ marginLeft: "10px", width: "60px" }}
          />
        </label>
      </div>

      <h3>User Interface</h3>
      <div>
        <label>
          Theme:
          <select
            value={settings.ui.theme}
            onChange={(e) => handleChange("ui", "theme", e.target.value)}
            style={{ marginLeft: "10px" }}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">System</option>
          </select>
        </label>
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.ui.miniModeDefault}
            onChange={() => handleToggle("ui", "miniModeDefault")}
          />
          Default Mini Mode
        </label>
      </div>
      <div>
        <label>
          Button Style:
          <select
            value={settings.ui.buttonStyle}
            onChange={(e) => handleChange("ui", "buttonStyle", e.target.value)}
            style={{ marginLeft: "10px" }}
          >
            <option value="rounded">Rounded</option>
            <option value="square">Square</option>
          </select>
        </label>
      </div>

      <h3>Notifications</h3>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.notifications.enableNotifications}
            onChange={() => handleToggle("notifications", "enableNotifications")}
          />
          Enable Notifications
        </label>
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.notifications.enableSound}
            onChange={() => handleToggle("notifications", "enableSound")}
          />
          Enable Notification Sound
        </label>
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.notifications.notificationEvents.home}
            onChange={() =>
              handleChange("notifications", "notificationEvents", {
                ...settings.notifications.notificationEvents,
                home: !settings.notifications.notificationEvents.home,
              })
            }
          />
          Home Tab Notifications
        </label>
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.notifications.notificationEvents.chat}
            onChange={() =>
              handleChange("notifications", "notificationEvents", {
                ...settings.notifications.notificationEvents,
                chat: !settings.notifications.notificationEvents.chat,
              })
            }
          />
          Chat Notifications
        </label>
      </div>

      <h3>Network</h3>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.network.enableHamachi}
            onChange={() => handleToggle("network", "enableHamachi")}
          />
          Enable Hamachi Support
        </label>
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.network.manualIpEnabled}
            onChange={() => handleToggle("network", "manualIpEnabled")}
          />
          Enable Manual IP Input
        </label>
      </div>
      <div>
        <label>
          Network Type:
          <select
            value={settings.network.networkType}
            onChange={(e) => handleChange("network", "networkType", e.target.value)}
            style={{ marginLeft: "10px" }}
          >
            <option value="local">Local</option>
            <option value="public">Public</option>
          </select>
        </label>
      </div>
      <div>
        <label>
          Bandwidth Limit (KB/s):
          <input
            type="number"
            value={settings.network.bandwidthLimit}
            onChange={(e) => handleChange("network", "bandwidthLimit", parseInt(e.target.value))}
            style={{ marginLeft: "10px", width: "60px" }}
          />
        </label>
      </div>

      <h3>File Transfer</h3>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.fileTransfer.autoReceive}
            onChange={() => handleToggle("fileTransfer", "autoReceive")}
          />
          Auto Receive Files
        </label>
      </div>
      <div>
        <label>
          Auto Save Path:
          <input
            type="text"
            value={settings.fileTransfer.autoSavePath}
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
            checked={settings.fileTransfer.compressFiles}
            onChange={() => handleToggle("fileTransfer", "compressFiles")}
          />
          Compress Files
        </label>
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.fileTransfer.convertFiles}
            onChange={() => handleToggle("fileTransfer", "convertFiles")}
          />
          Convert Files
        </label>
      </div>
      <div>
        <label>
          Convert To:
          <select
            value={settings.fileTransfer.convertTo}
            onChange={(e) => handleChange("fileTransfer", "convertTo", e.target.value)}
            style={{ marginLeft: "10px" }}
          >
            <option value="jpg">JPG</option>
            <option value="png">PNG</option>
          </select>
        </label>
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.fileTransfer.chunkedTransfer}
            onChange={() => handleToggle("fileTransfer", "chunkedTransfer")}
          />
          Enable Chunked Transfer
        </label>
      </div>

      <h3>Shortcuts</h3>
      <div>
        <label>
          File Share Shortcut:
          <input
            type="text"
            value={settings.shortcuts.fileShare}
            onChange={(e) => handleChange("shortcuts", "fileShare", e.target.value)}
            style={{ marginLeft: "10px", width: "100px" }}
          />
        </label>
      </div>
      <div>
        <label>
          Chat Send Shortcut:
          <input
            type="text"
            value={settings.shortcuts.chatSend}
            onChange={(e) => handleChange("shortcuts", "chatSend", e.target.value)}
            style={{ marginLeft: "10px", width: "100px" }}
          />
        </label>
      </div>

      <h3>User Profile</h3>
      <div>
        <label>
          Name:
          <input
            type="text"
            value={settings.userProfile.name}
            onChange={(e) => handleChange("userProfile", "name", e.target.value)}
            style={{ marginLeft: "10px", width: "150px" }}
          />
        </label>
      </div>
    </div>
  );
}

export default SettingsTab;