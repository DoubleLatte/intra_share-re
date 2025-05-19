const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage } = require("electron");
  const windowStateKeeper = require("electron-window-state");
  const path = require("path");
  const MulticastDNS = require("multicast-dns");
  const Store = require("./store");
  const { Howl } = require("howler");
  const fs = require("fs");

  let mainWindow = null;
  let tray = null;
  let isQuiting = false;
  const APP_VERSION = "1.0.0";
  const store = new Store();
  const settings = store.get("settings") || {};
  const devices = [];

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
      backgroundColor: settings.customTheme?.backgroundImage ? "transparent" : "#2F3136",
    });

    mainWindowState.manage(mainWindow);
    mainWindow.loadURL("http://localhost:5173");

    mainWindow.on("close", (event) => {
      if (!isQuiting && settings.enableTray) {
        event.preventDefault();
        mainWindow.hide();
      }
    });

    mainWindow.on("closed", () => {
      mainWindow = null;
    });
  }

  function getNetworkInterface(settings) {
    return settings.networkType === "local" ? undefined : "0.0.0.0";
  }

  function setupMDNS() {
    const mdns = MulticastDNS();
    const serviceName = `intra-share._tcp.local`;
    const deviceName = `IntraShare-${Math.random().toString(36).substring(7)}`;

    // 장치 광고
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
              data: "192.168.0.100", // 실제 IP로 대체 (동적 획득 필요)
            },
          ],
        });
      }
    });

    // 장치 탐색
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

    // 주기적 쿼리
    setInterval(() => {
      mdns.query({ questions: [{ name: serviceName, type: "SRV" }] });
    }, 2000);

    return mdns;
  }

  function createTray() {
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
  }

  app.whenReady().then(() => {
    createWindow();
    if (settings.enableTray) createTray();
    setupMDNS();

    ipcMain.handle("get-devices", () => devices);

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
      if (!settings.enableNotifications || !settings.notificationEvents[tab]) return;

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

      if (settings.enableSound) {
        const sound = new Howl({ src: [path.join(__dirname, "notification.mp3")] });
        sound.play();
      }
    });

    ipcMain.handle("select-file", async () => {
      const { dialog } = require("electron");
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile", "multiSelections"],
      });
      return result.filePaths;
    });

    ipcMain.handle("select-folder", async () => {
      const { dialog } = require("electron");
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory"],
      });
      return result.filePaths;
    });

    ipcMain.on("window-control", (event, action) => {
      if (action === "minimize") mainWindow.minimize();
      else if (action === "maximize") mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
      else if (action === "close") mainWindow.hide();
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("before-quit", () => {
    isQuiting = true;
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });