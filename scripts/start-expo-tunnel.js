const { spawn } = require("child_process");
const path = require("path");

const expoCli = path.join(__dirname, "..", "node_modules", "expo", "bin", "cli");
const args = [expoCli, "start", "--tunnel", ...process.argv.slice(2)];

const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    EXPO_FORCE_WEBCONTAINER_ENV: "1",
    EXPO_UNSTABLE_HEADLESS: "0",
  },
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
