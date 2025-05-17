function runSpeedTest() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id: Date.now(),
        downloadSpeed: (Math.random() * 100).toFixed(2),
        uploadSpeed: (Math.random() * 50).toFixed(2),
        ping: (Math.random() * 100).toFixed(0),
        timestamp: new Date().toISOString(),
      });
    }, 2000);
  });
}

module.exports = { runSpeedTest };