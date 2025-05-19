const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage } = require("electron");
const windowStateKeeper = require("electron-window-state");
const path = require("path");
const MulticastDNS = require("multicast-dns");
const Store = require("./store");
const { Howl } = require("howler");
const fs = require("fs");
const os = require("os");
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);

let mainWindow = null;
let tray = null;
let isQuiting = false;
const APP_VERSION = "1.0.0";
const store = new Store();
const settings = store.get("settings") || {};
const devices = [];

async function addFirewallRules() {
  if (!settings.general.firewallAutoConfig) {
    console.log("Firewall auto-config disabled in settings");
    return;
  }

  const rules = [
    {
      name: "IntraShare-MDNS",
      protocol: "UDP",
      port: "5353",
      command: `netsh advfirewall firewall add rule name="IntraShare-MDNS" dir=in action=allow protocol=UDP localport=5353`,
    },
    {
      name: "IntraShare-WebRTC",
      protocol: "UDP",
      port: "49152-65535",
      command: `netsh advfirewall firewall add rule name="IntraShare-WebRTC" dir=in action=allow protocol=UDP localport=49152-65535`,
    },
    {
      name: "IntraShare-Signaling",
      protocol: "TCP",
      port: "4321",
      command: `netsh advfirewall firewall add rule name="IntraShare-Signaling" dir=in action=allow protocol=TCP localport=4321`,
    },
  ];

  for (const rule of rules) {
    try {
      const { stdout } = await execPromise(`netsh advfirewall firewall show rule name="${rule.name}"`);
      if (stdout.includes(rule.name)) {
        console.log(`Firewall rule ${rule.name} already exists`);
        continue;
      }
    } catch (err) {
      try {
        await execPromise(rule.command);
        console.log(`Added firewall rule: ${rule.name}`);
      } catch (addErr) {
        console.error(`Failed to add firewall rule ${rule.name}:`, addErr);
        mainWindow?.webContents.send("firewall-error", {
          message: `Failed to add firewall rule for ${rule.name}. Please add manually or run as administrator.`,
        });
      }
    }
  }
}

function createWindow() {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1280,
    defaultHeight: 720,
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, "icon.png"),
    frame: false,
    backgroundColor: settings.ui.customTheme?.backgroundImage ? "transparent" : "#2F3136",
  });

  mainWindowState.manage(mainWindow);
  mainWindow.loadURL("http://localhost:5173").catch((err) => {
    console.error("Failed to load URL:", err);
    app.quit();
  });

  mainWindow.on("close", (event) => {
    if (!isQuiting && settings.general.enableTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function getNetworkInterface(settings) {
  return settings.network.networkType === "local" ? undefined : "0.0.0.0";
}

function setupMDNS() {
  try {
    const interfaces = os.networkInterfaces();
    let ip;
    if (settings.network.enableHamachi) {
      ip = Object.values(interfaces)
        .flat()
        .find((i) => i.family === "IPv4" && i.address.startsWith("25."))?.address;
      if (!ip) {
        console.warn("Hamachi interface not found, falling back to local IP");
      }
    }
    if (!ip) {
      ip = Object.values(interfaces)
        .flat()
        .find((i) => i.family === "IPv4" && !i.internal)?.address || "192.168.0.100";
    }

    const mdns = MulticastDNS({ interface: ip });
    const serviceName = `intra-share._tcp.local`;
    const deviceName = `IntraShare-${Math.random().toString(36).substring(7)}`;

    mdns.on("query", (query) => {
      if (query.questions.some((q) => q.name === serviceName)) {
        mdns.respond({
          answers: [
            {
              name: serviceName,
              type: "SRV",
              data: { port: 4321, target: deviceName + ".local" },
            },
            {
              name: serviceName,
              type: "TXT",
              data: Buffer.from(`version=${APP_VERSION}`),
            },
            {
              name: deviceName + ".local",
              type: "A",
              data: ip,
            },
          ],
        }, (err) => {
          if (err) console.error("mDNS respond error:", err);
        });
      }
    });

    mdns.on("response", (response) => {
      const srv = response.answers.find((a) => a.type === "SRV" && a.name === serviceName);
      const txt = response.answers.find((a) => a.type === "TXT" && a.name === serviceName);
      const ip = response.answers.find((a) => a.type === "A" && a.name.includes(".local"));
      if (srv && txt && ip) {
        const version = txt.data.toString().split("=")[1];
        const existing = devices.find((d) => d.name === srv.data.target);
        if (!existing) {
          const device = {
            name: srv.data.target,
            host: ip.data,
            port: srv.data.port,
            status: "online",
            lastSeen: new Date().toISOString(),
            version,
          };
          devices.push(device);
          mainWindow?.webContents.send("device-list", devices);
        }
      }
    });

    const queryInterval = setInterval(() => {
      mdns.query({ questions: [{ name: serviceName, type: "SRV" }] }, (err) => {
        if (err) console.error("mDNS query error:", err);
      });
    }, 2000);

    mdns.on("error", (err) => {
      console.error("mDNS error:", err);
      if (settings.network.manualIpEnabled) {
        mainWindow?.webContents.send("mdns-error", { message: "mDNS failed, try manual IP input" });
      }
    });

    app.on("before-quit", () => {
      clearInterval(queryInterval);
      mdns.destroy();
    });

    return mdns;
  } catch (err) {
    console.error("Failed to setup mDNS:", err);
    if (settings.network.manualIpEnabled) {
      mainWindow?.webContents.send("mdns-error", { message: "mDNS initialization failed" });
    }
    return null;
  }
}

function createTray() {
  try {
    const trayFrames = [
      nativeImage.createFromPath(path.join(__dirname, "icon.png")),
      nativeImage.createFromPath(path.join(__dirname, "icon-frame-0.png")),
      nativeImage.createFromPath(path.join(__dirname, "icon-frame-1.png")),
      nativeImage.createFromPath(path.join(__dirname, "icon-frame-2.png")),
      nativeImage.createFromPath(path.join(__dirname, "icon-frame-3.png")),
    ];

    tray = new Tray(trayFrames[0]);
    let frameIndex = 0;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Open Intra Share",
        click: () => {
          mainWindow.show();
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          isQuiting = true;
          app.quit();
        },
      },
    ]);

    tray.setToolTip("Intra Share");
    tray.setContextMenu(contextMenu);

    tray.on("click", () => {
      mainWindow.show();
    });

    setInterval(() => {
      if (mainWindow.isVisible()) {
        frameIndex = (frameIndex + 1) % trayFrames.length;
        tray.setImage(trayFrames[frameIndex]);
      }
    }, 500);
  } catch (err) {
    console.error("Failed to create tray:", err);
  }
}

app.whenReady().then(async () => {
  try {
    // 자동 시작 설정 적용
    app.setLoginItemSettings({
      openAtLogin: settings.general.autoStart,
      path: process.execPath,
    });

    await addFirewallRules();
    createWindow();
    if (settings.general.enableTray) createTray();
    const mdns = setupMDNS();
    if (!mdns) throw new Error("mDNS initialization failed");

    ipcMain.handle("get-devices", () => devices);

    ipcMain.handle("add-manual-device", async (event, { ip, port = 4321 }) => {
      if (!settings.network.manualIpEnabled) {
        return { success: false, error: "Manual IP input is disabled in settings" };
      }
      try {
        const device = {
          name: `Manual-${ip}`,
          host: ip,
          port,
          status: "online",
          lastSeen: new Date().toISOString(),
          version: "unknown",
        };
        if (!devices.find((d) => d.host === ip)) {
          devices.push(device);
          mainWindow?.webContents.send("device-list", devices);
        }
        return { success: true };
      } catch (err) {
        console.error("Manual device add error:", err);
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle("save-settings", async (event, newSettings) => {
      try {
        store.set("settings", { ...settings, ...newSettings });
        mainWindow?.webContents.send("settings-updated", store.get("settings"));
        if (newSettings.general?.firewallAutoConfig !== undefined) {
          await addFirewallRules();
        }
        if (newSettings.general?.autoStart !== undefined) {
          app.setLoginItemSettings({
            openAtLogin: newSettings.general.autoStart,
            path: process.execPath,
          });
        }
        return { success: true };
      } catch (err) {
        console.error("Save settings error:", err);
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle("get-settings", async () => {
      try {
        return store.get("settings");
      } catch (err) {
        console.error("Get settings error:", err);
        return {};
      }
    });

    ipcMain.on("start-transfer", () => {
      tray?.setImage(nativeImage.createFromPath(path.join(__dirname, "icon-frame-1.png")));
    });

    ipcMain.on("end-transfer", () => {
      tray?.setImage(nativeImage.createFromPath(path.join(__dirname, "icon.png")));
    });

    ipcMain.on("update-progress", (event, { progress, status }) => {
      mainWindow?.setProgressBar(progress / 100);
      tray?.setToolTip(`Intra Share - ${status} (${progress}%)`);
    });

    ipcMain.on("show-notification", (event, { title, body, tab, device }) => {
      if (!settings.notifications.enableNotifications || !settings.notifications.notificationEvents[tab]) return;

      const notification = new Notification({
        title,
        body,
        icon: path.join(__dirname, "icon.png"),
      });

      notification.on("click", () => {
        mainWindow.show();
        mainWindow.webContents.send("navigate", { tab, device });
      });

      notification.show();

      if (settings.notifications.enableSound) {
        try {
          const sound = new Howl({ src: [path.join(__dirname, "notification.mp3")] });
          sound.play();
        } catch (err) {
          console.error("Failed to play notification sound:", err);
        }
      }
    });

    ipcMain.handle("select-file", async () => {
      const { dialog } = require("electron");
      try {
        const result = await dialog.showOpenDialog(mainWindow, {
          properties: ["openFile", "multiSelections"],
        });
        return result.filePaths;
      } catch (err) {
        console.error("File selection error:", err);
        return [];
      }
    });

    ipcMain.handle("select-folder", async () => {
      const { dialog } = require("electron");
      try {
        const result = await dialog.showOpenDialog(mainWindow, {
          properties: ["openDirectory"],
        });
        return result.filePaths;
      } catch (err) {
        console.error("Folder selection error:", err);
        return [];
      }
    });

    ipcMain.on("window-control", (event, action) => {
      if (action === "minimize") mainWindow.minimize();
      else if (action === "maximize") mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
      else if (action === "close") mainWindow.hide();
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (err) {
    console.error("App initialization error:", err);
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuiting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});