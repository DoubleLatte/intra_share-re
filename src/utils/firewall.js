const { exec } = require("child_process");

function checkFirewall(ports) {
  return new Promise((resolve) => {
    exec(`netstat -an | findstr :${ports.join(" :")}`, (err, stdout) => {
      const allOpen = ports.every((port) => stdout.includes(`:${port}`));
      resolve({ allOpen, details: stdout });
    });
  });
}

function openFirewallPorts(ports) {
  return new Promise((resolve, reject) => {
    const commands = ports.map(
      (port) => `netsh advfirewall firewall add rule name="IntraShare-${port}" dir=in action=allow protocol=TCP localport=${port}`
    );
    exec(commands.join(" && "), (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = { checkFirewall, openFirewallPorts };