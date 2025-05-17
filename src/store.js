const Store = require("electron-store");

const store = new Store({
  defaults: {
    settings: {
      theme: "dark",
      enableNotifications: true,
      autoReceive: false,
      miniModeDefault: false,
      enableTray: true,
      enableSound: true,
      notificationEvents: {
        home: true,
        chat: true,
      },
      notificationDevices: {},
      compressFiles: false,
      convertFiles: false,
      convertTo: "jpg",
      chunkedTransfer: false,
      lowPowerMode: false,
      enableAutoUpdate: true,
      retryAttempts: 3,
      networkType: "local",
      enableHamachi: false,
      shortcuts: {
        fileShare: "Ctrl+Shift+F",
        chatSend: "Ctrl+Enter",
      },
      userProfile: { name: "User", icon: "" },
      customTheme: { backgroundImage: "", fontFamily: "Noto Sans KR" },
      customColor: "#7289DA",
      opacity: 1,
      invert: false,
      brightness: 1,
      buttonStyle: "rounded",
      bandwidthLimit: 0,
      deviceGroups: [],
    },
    history: [],
    updateHistory: [],
    usageStats: [],
    activityLogs: [],
    speedTests: [],
    encryptionKeys: {},
  },
});

module.exports = store;