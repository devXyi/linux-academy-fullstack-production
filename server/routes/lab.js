import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import { labLimiter, labDemoLimiter } from "../middleware/rateLimiters.js";

export const labRouter = Router();

// This is a fixed-output simulator, not a real shell — nothing here executes
// on the server. Wiring the lab to real isolated command execution (gVisor/
// Firecracker-style sandboxing, per-session containers, network isolation,
// resource quotas, cleanup jobs) is a separate infrastructure project in its
// own right and is intentionally out of scope here: shipping a fast "real"
// version would mean shipping an arbitrary command execution endpoint, which
// is not something to improvise.
const OUTPUTS = {
  pwd: "/home/student",
  whoami: "student",
  id: "uid=1000(student) gid=1000(student) groups=1000(student),27(sudo)",
  ls: "bin  labs  notes  projects",
  "ls -la":
    "drwxr-xr-x  5 student student  4096 labs\ndrwxr-xr-x  3 student student  4096 projects\n-rw-r--r--  1 student student   214 notes.txt",
  "cat /etc/os-release": 'PRETTY_NAME="Ubuntu 24.04 LTS"\nVERSION_ID="24.04"',
  "echo hello": "hello",
  "echo $PATH": "/usr/local/bin:/usr/bin:/bin",
  "ps aux": "USER   PID %CPU %MEM COMMAND\nroot     1  0.0  0.1 /sbin/init\nstudent 812  0.1  0.2 bash",
  "df -h": "Filesystem  Size  Used Avail Use% Mounted on\n/dev/vda1    40G   9G   29G  24% /",
  "free -h": "Mem: 7.7Gi 2.1Gi 4.9Gi",
  hostname: "academy-lab",
  "uname -a": "Linux academy-lab 6.8.0 x86_64 GNU/Linux",
  "ip addr": "2: eth0: <UP> inet 10.20.0.15/24",
  "ip route": "default via 10.20.0.1 dev eth0",
  "ss -tulpn": "tcp LISTEN 0 128 0.0.0.0:22 sshd",
  "systemctl --failed": "0 loaded units listed.",
  "journalctl -n 20": "Sep 17 academy-lab systemd[1]: Started student session.",
  "apt update": "Reading package lists... Done\nAll packages are up to date."
};
const ALLOWED = new Set(Object.keys(OUTPUTS).concat(["date"]));

// The anonymous homepage terminal gets a small, curated taste — not the
// full command set the authenticated in-app lab has.
const DEMO_ALLOWED = new Set(["pwd", "whoami", "id", "ls", "echo hello", "date", "hostname"]);

function normalize(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ") // collapse repeated whitespace, like a real shell would
    .slice(0, 200);
}

function run(command, allowed) {
  if (!command) return "";
  if (command === "date") return new Date().toString();
  if (!allowed.has(command)) {
    const bin = command.split(" ")[0];
    return `bash: ${bin}: command accepted only in the safe academy simulator`;
  }
  return OUTPUTS[command];
}

// Full simulator — behind auth so it isn't a wide-open unauthenticated POST
// endpoint, and rate-limited per-account rather than per-IP.
labRouter.post("/lab/execute", authRequired, labLimiter, (req, res) => {
  res.json({ output: run(normalize(req.body?.command), ALLOWED) });
});

// Small, unauthenticated taste for the homepage hero terminal.
labRouter.post("/lab/demo", labDemoLimiter, (req, res) => {
  res.json({ output: run(normalize(req.body?.command), DEMO_ALLOWED) });
});
