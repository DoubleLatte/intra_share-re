import React, { useEffect, useState } from "react";

const { ipcRenderer } = window.electron;

function HomeTab() {
  const [devices, setDevices] = useState([]);
  const [manualIp, setManualIp] = useState("");
  const [error, setError] = useState(null);
  const [settings, setSettings] = useState({});

  useEffect(() => {
    ipcRenderer.invoke("get-settings").then((loadedSettings) => {
      setSettings(loadedSettings);
    });

    ipcRenderer.invoke("get-devices").then((devs) => setDevices(devs));
    ipcRenderer.on("device-list", (event, devs) => setDevices(devs));
    ipcRenderer.on("mdns-error", (event, { message }) => setError(message));
    ipcRenderer.on("firewall-error", (event, { message }) => setError(message));
    ipcRenderer.on("settings-updated", (event, updatedSettings) => {
      setSettings(updatedSettings);
    });

    return () => {
      ipcRenderer.removeAllListeners("device-list");
      ipcRenderer.removeAllListeners("mdns-error");
      ipcRenderer.removeAllListeners("firewall-error");
      ipcRenderer.removeAllListeners("settings-updated");
    };
  }, []);

  const addManualDevice = async () => {
    if (!settings.network?.manualIpEnabled) {
      setError("Manual IP input is disabled in settings");
      return;
    }
    const result = await ipcRenderer.invoke("add-manual-device", { ip: manualIp });
    if (!result.success) {
      setError(result.error);
    } else {
      setManualIp("");
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Devices</h2>
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {settings.network?.manualIpEnabled && (
        <div>
          <input
            type="text"
            value={manualIp}
            onChange={(e) => setManualIp(e.target.value)}
            placeholder="Enter IP (e.g., 25.123.45.67)"
          />
          <button onClick={addManualDevice}>Add Manual Device</button>
        </div>
      )}
      <ul>
        {devices.map((device) => (
          <li key={device.host}>
            {device.name} ({device.host}:{device.port})
          </li>
        ))}
      </ul>
    </div>
  );
}

export default HomeTab;