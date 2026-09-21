// Course, chapter, lesson, and quiz content. Kept separate from db.js so the
// schema/migration logic isn't buried under this much data.
//
// Shape:
//   course: [code, title, slug, description, level, duration, icon]
//   chapter: { title, description, required, lessons: [lesson...], quiz }
//   lesson: [title, icon, content, command]
//   quiz question: [prompt, [option, ...], correctIndex]

export const COURSES = [
  {
    course: ["LX-100", "Linux Foundations", "linux-foundations", "Filesystem, permissions, processes, and the shell habits everything else depends on.", "Beginner", "12 hrs", "terminal"],
    chapters: [
      {
        title: "Getting Oriented",
        description: "Find your way around a Linux system from the shell.",
        required: true,
        lessons: [
          ["The Linux Mindset", "terminal", "Learn the shell as an interface to a real operating system.", "pwd"],
          ["Files & Directories", "folder", "Navigate, create, copy, move, and remove files safely.", "ls -la"],
          ["stdin, stdout & stderr", "arrow-right-left", "Understand streams and redirection.", "echo hello > output.txt"],
          ["Permissions", "lock", "Read, write, execute; chmod, chown, and umask.", "chmod 640 notes.txt"]
        ],
        quiz: [
          ["What does `pwd` print?", ["The current working directory", "A list of files", "The current user", "Disk usage"], 0],
          ["Which command changes a file's permissions?", ["chmod", "chown", "chgrp", "umask"], 0],
          ["What does the `>` operator do?", ["Redirects output to a file, overwriting it", "Pipes output to another command", "Appends output to a file", "Redirects input from a file"], 0],
          ["`ls -la` adds which two things to a plain `ls`?", ["Hidden files and a detailed listing", "Only hidden files", "Only file sizes", "Sorted output"], 0],
          ["Which stream does an error message normally go to?", ["stderr", "stdout", "stdin", "stdlog"], 0]
        ]
      },
      {
        title: "Operating the System",
        description: "Manage processes, packages, and identities.",
        required: true,
        lessons: [
          ["Processes", "activity", "Inspect, control, and understand running processes.", "ps aux"],
          ["Packages", "package", "Install, update, and remove software.", "apt update"],
          ["Users & Groups", "users", "Manage identities and group membership.", "id"],
          ["Environment", "settings", "PATH, variables, profiles, aliases, and shells.", "echo $PATH"]
        ],
        quiz: [
          ["Which command lists currently running processes?", ["ps", "ls", "top-only", "df"], 0],
          ["What does the PATH variable control?", ["Where the shell looks for executable commands", "The current directory", "The user's home folder", "File permissions"], 0],
          ["Which command shows your user and group IDs?", ["id", "who", "users", "groups-only"], 0],
          ["What's a typical way to install a package on a Debian-based system?", ["apt install", "yum grab", "pkg fetch", "brew add"], 0],
          ["A process's PID is...", ["A unique number identifying it while it runs", "Its file size", "Its priority level", "Its owner's user ID"], 0]
        ]
      },
      {
        title: "Real-World Skills",
        description: "Search, filter, and diagnose like you actually will on the job.",
        required: true,
        lessons: [
          ["Searching", "search", "Find files and content quickly.", "find . -name '*.log'"],
          ["Pipes & Filters", "git-branch", "Compose small tools into useful pipelines.", "cat access.log | grep 404"],
          ["Logs", "file-text", "Read system logs and diagnose failures.", "journalctl -n 20"],
          ["Capstone: Diagnose It", "target", "Solve a broken Linux workstation scenario.", "systemctl --failed"]
        ],
        quiz: [
          ["Which command searches file *contents* for a pattern?", ["grep", "find", "locate", "which"], 0],
          ["What does the `|` symbol do?", ["Sends one command's output into the next command's input", "Runs two commands at the same time", "Redirects output to a file", "Comments out the rest of the line"], 0],
          ["Which tool reads the systemd journal?", ["journalctl", "dmesg-only", "catlog", "tail -f /var/log/systemd"], 0],
          ["`find . -name '*.log'` searches...", ["The current directory and its subdirectories, by filename", "Only the current directory", "The whole filesystem", "Only hidden files"], 0],
          ["`systemctl --failed` lists...", ["Units that failed to start", "All running services", "All installed packages", "Recent logins"], 0]
        ]
      }
    ]
  },
  {
    course: ["LX-140", "Shell & Automation", "shell-automation", "Bash scripting, cron, pipes, text processing, and automation.", "Beginner–Intermediate", "10 hrs", "square-terminal"],
    chapters: [
      {
        title: "Bash Basics",
        description: "The building blocks of a real script.",
        required: true,
        lessons: [
          ["Bash Anatomy", "terminal", "Shell syntax, variables, quoting, and exit codes.", "bash --version"],
          ["Conditions", "git-branch", "Write reliable if/else logic.", "if [ -f app.log ]; then echo yes; fi"],
          ["Loops", "repeat", "Automate repetitive operations.", "for f in *.log; do echo $f; done"]
        ],
        quiz: [
          ["What does `$?` hold after a command runs?", ["Its exit code", "Its process ID", "Its output", "Its runtime in seconds"], 0],
          ["Which construct repeats an action for each item in a list?", ["for loop", "if statement", "case switch (alone)", "function definition (alone)"], 0],
          ["An exit code of 0 conventionally means...", ["Success", "Failure", "The script doesn't exist", "A syntax error"], 0],
          ["`if [ -f app.log ]; then ...` tests whether...", ["A regular file named app.log exists", "A directory named app.log exists", "The variable app.log is set", "app.log is executable"], 0],
          ["Which symbol starts a bash comment?", ["#", "//", "--", ";"], 0]
        ]
      },
      {
        title: "Composing Commands",
        description: "Turn one-liners into reusable tools.",
        required: true,
        lessons: [
          ["Functions", "box", "Turn repeated logic into reusable commands.", "function greet(){ echo hello; }"],
          ["Pipes", "arrow-right-left", "Build command pipelines without temporary files.", "ps aux | grep nginx"],
          ["Text Processing", "file-text", "Use grep, sed, awk, cut, sort, and uniq.", "awk '{print $1}' access.log"]
        ],
        quiz: [
          ["`awk '{print $1}'` prints...", ["The first field of each line", "The first line of the file", "The filename", "The line count"], 0],
          ["A bash function is defined so it can be...", ["Called by name, more than once", "Run only during boot", "Used only in cron", "Executed only as root"], 0],
          ["Piping `ps aux | grep nginx` finds...", ["Lines from `ps aux` that mention nginx", "The nginx config file", "Nginx's log file", "Nginx's process priority"], 0],
          ["Which tool is best suited to stream-edit text (e.g. find-and-replace)?", ["sed", "cat", "ls", "touch"], 0],
          ["`sort | uniq` on a list of lines gives you...", ["The distinct lines, in sorted order", "Only duplicate lines", "The line count", "The file size"], 0]
        ]
      },
      {
        title: "Scheduling & Safety",
        description: "Run scripts unattended, and keep them from failing silently.",
        required: true,
        lessons: [
          ["Cron", "clock", "Schedule scripts and recurring maintenance.", "crontab -l"],
          ["Defensive Bash", "shield", "Use strict modes and safe scripting patterns.", "set -euo pipefail"],
          ["Automation Project", "rocket", "Build a log rotation and alerting script.", "./rotate.sh"],
          ["Exit Codes", "circle-check", "Make scripts fail loudly and safely.", "echo $?"]
        ],
        quiz: [
          ["`crontab -l` does what?", ["Lists the current user's scheduled cron jobs", "Deletes all cron jobs", "Edits the crontab file", "Runs a job immediately"], 0],
          ["`set -euo pipefail` at the top of a script makes it...", ["Exit immediately on an error, an unset variable, or a failed pipe stage", "Run faster", "Skip comments", "Suppress all output"], 0],
          ["A cron schedule like `0 * * * *` runs...", ["Once every hour, on the hour", "Once a day at midnight", "Every minute", "Once a week"], 0],
          ["Why check `$?` after a critical command in a script?", ["To detect and handle failure explicitly", "To print the command's output", "To measure how long it took", "To see which user ran it"], 0],
          ["A defensively-written script that fails should generally...", ["Exit with a non-zero code and a clear message", "Exit 0 regardless, to avoid alarming anyone", "Retry forever silently", "Delete its own logs"], 0]
        ]
      }
    ]
  },
  {
    course: ["LX-210", "System Administration", "system-administration", "Users, services, storage, boot, logs, and real machine maintenance.", "Intermediate", "18 hrs", "server"],
    chapters: [
      {
        title: "Service Management",
        description: "Control what runs, when, and how it starts.",
        required: true,
        lessons: [
          ["Systemd Fundamentals", "cog", "Units, targets, and how systemd boots a modern Linux system.", "systemctl status"],
          ["Managing Services", "power", "Start, stop, enable, and inspect services.", "systemctl enable --now nginx"],
          ["Scheduled Tasks", "clock", "Timers and cron for recurring administrative work.", "systemctl list-timers"]
        ],
        quiz: [
          ["Which command starts a service now *and* enables it on boot?", ["systemctl enable --now <service>", "systemctl start <service> only", "systemctl status <service>", "systemctl mask <service>"], 0],
          ["A systemd \"unit\" typically represents...", ["A manageable resource like a service, socket, or mount", "A user account", "A log file", "A kernel module"], 0],
          ["`systemctl list-timers` shows...", ["Scheduled systemd timers and their next run", "Running processes", "Installed packages", "Disk usage"], 0],
          ["What does `systemctl status <service>` tell you?", ["Whether it's running, and its recent log lines", "Only whether it's installed", "Its configuration file contents", "Its memory limit"], 0],
          ["Disabling a service (without stopping it) means...", ["It won't start automatically on the next boot", "It stops immediately", "It's uninstalled", "It's masked from ever starting"], 0]
        ]
      },
      {
        title: "Storage & Filesystems",
        description: "Understand disks, partitions, and how they get mounted.",
        required: true,
        lessons: [
          ["Disk Partitioning", "hard-drive", "Partition tables, and how disks are divided up.", "lsblk"],
          ["Filesystem Types", "layers", "ext4, xfs, and choosing a filesystem.", "df -T"],
          ["Mounting & fstab", "link", "Attach filesystems, and make mounts persistent across reboots.", "cat /etc/fstab"]
        ],
        quiz: [
          ["`lsblk` shows...", ["Block devices and their partitions", "Running processes", "Loaded kernel modules", "Network interfaces"], 0],
          ["`/etc/fstab` controls...", ["Which filesystems get mounted automatically at boot", "Which services start at boot", "User login shells", "Firewall rules"], 0],
          ["`df -T` adds which column to a normal `df`?", ["Filesystem type", "Owner", "Last modified date", "Inode count"], 0],
          ["Mounting a filesystem means...", ["Attaching it to a directory so its files become accessible", "Formatting it", "Encrypting it", "Deleting it"], 0],
          ["ext4 and xfs are both examples of...", ["Filesystem types", "Partition tools", "Boot loaders", "Network protocols"], 0]
        ]
      },
      {
        title: "Users, Logs & Recovery",
        description: "Keep the system accountable and recoverable.",
        required: true,
        lessons: [
          ["User Administration", "user-cog", "Creating, locking, and managing accounts at scale.", "useradd -m student"],
          ["Log Management", "file-text", "Centralize and rotate logs so they're useful, not noise.", "journalctl -u nginx"],
          ["Backup Strategies", "database-backup", "3-2-1 backups, and what actually gets restored.", "rsync -av /data /backup"],
          ["Disaster Recovery", "life-buoy", "Plan for the day something real breaks.", "systemctl --failed"]
        ],
        quiz: [
          ["`useradd -m` creates...", ["A new user, with a home directory", "A new group only", "A locked account", "A root-equivalent account"], 0],
          ["The \"3-2-1\" backup rule means...", ["3 copies of data, on 2 different media, with 1 copy offsite", "3 backups a day", "2 backups, 1 test restore per year", "1 backup per server, kept for 3 months"], 0],
          ["`journalctl -u nginx` filters logs to...", ["Just the nginx systemd unit", "Just the last hour", "Just error-level lines", "Just boot messages"], 0],
          ["A backup you've never test-restored is...", ["Unverified — you don't actually know it works", "Guaranteed to work if the tool says so", "Only useful for compliance, not recovery", "Faster to restore than a tested one"], 0],
          ["A disaster recovery plan mainly answers...", ["What do we do, in what order, when something critical fails?", "How do we prevent all failures?", "How much RAM does the server have?", "Who installed the last package?"], 0]
        ]
      }
    ]
  },
  {
    course: ["LX-230", "Networking & Security", "networking-security", "TCP/IP, DNS, SSH, firewalls, packet analysis, and hardening.", "Intermediate", "14 hrs", "shield"],
    chapters: [
      {
        title: "Networking Fundamentals",
        description: "How machines actually find and talk to each other.",
        required: true,
        lessons: [
          ["TCP/IP Basics", "network", "Addresses, ports, and how packets actually travel.", "ip addr"],
          ["DNS Resolution", "compass", "How names turn into addresses.", "dig example.com"],
          ["Routing", "route", "How traffic finds its way between networks.", "ip route"]
        ],
        quiz: [
          ["A port number identifies...", ["A specific service or process on a host", "The host's physical location", "The host's MAC address", "The DNS server in use"], 0],
          ["`dig example.com` is used to...", ["Query DNS and see what it resolves to", "Ping the host", "Trace the network route", "Scan open ports"], 0],
          ["An IP address identifies...", ["A host (or interface) on a network", "A single running process", "A DNS record type", "A firewall rule"], 0],
          ["`ip route` shows...", ["The system's routing table", "Open network connections", "DNS cache entries", "Firewall rules"], 0],
          ["TCP, compared to UDP, is generally described as...", ["Connection-oriented and reliable", "Connectionless and faster", "Only used for DNS", "Only used for email"], 0]
        ]
      },
      {
        title: "Remote Access & Encryption",
        description: "Connect to systems, and keep the connection private.",
        required: true,
        lessons: [
          ["SSH Deep Dive", "square-terminal", "How SSH sessions are established and secured.", "ssh user@host"],
          ["SSH Key Management", "key", "Public/private key auth, agents, and rotation.", "ssh-keygen -t ed25519"],
          ["TLS/SSL Basics", "lock-keyhole", "How HTTPS actually protects a connection.", "openssl s_client -connect example.com:443"]
        ],
        quiz: [
          ["SSH key authentication is generally considered...", ["More secure than password authentication", "Less secure than password authentication", "Only usable for root", "Unrelated to security"], 0],
          ["`ssh-keygen` generates...", ["A public/private key pair", "A new user account", "A firewall rule", "A DNS record"], 0],
          ["In public-key auth, which key stays secret?", ["The private key", "The public key", "Both are shared", "Neither — SSH doesn't use keys"], 0],
          ["TLS primarily provides...", ["Encryption and authentication for a connection", "Faster page loads", "DNS resolution", "Firewall rules"], 0],
          ["A `.pub` file typically contains...", ["A public key, safe to share", "A private key, never to be shared", "A password hash", "A firewall policy"], 0]
        ]
      },
      {
        title: "Defense & Analysis",
        description: "See what's happening on the wire, and lock things down.",
        required: true,
        lessons: [
          ["Firewalls", "shield-check", "Filtering traffic with iptables and nftables.", "iptables -L"],
          ["Packet Analysis", "activity", "Reading traffic with tcpdump to understand what's really happening.", "tcpdump -i eth0 -n"],
          ["Hardening Checklist", "list-checks", "The unglamorous steps that stop most real attacks.", "ss -tulpn"]
        ],
        quiz: [
          ["A firewall primarily decides...", ["Which traffic is allowed in or out", "How fast the network is", "Which DNS server is used", "Which user is logged in"], 0],
          ["`tcpdump` is used to...", ["Capture and inspect network packets", "Configure firewall rules", "Generate SSH keys", "Manage systemd services"], 0],
          ["`ss -tulpn` lists...", ["Listening ports and the processes bound to them", "Running cron jobs", "Installed packages", "User login history"], 0],
          ["Disabling password SSH login in favor of keys is an example of...", ["Hardening", "Load balancing", "DNS caching", "Log rotation"], 0],
          ["A common, high-value first hardening step on a new server is...", ["Closing unused ports and disabling unused services", "Installing every available package", "Turning off the firewall for easier debugging", "Sharing the root password with the team"], 0]
        ]
      }
    ]
  },
  {
    course: ["LX-310", "DevOps & Containers", "devops-containers", "Docker, Kubernetes fundamentals, CI/CD, observability, and deployment.", "Advanced", "22 hrs", "boxes"],
    chapters: [
      {
        title: "Container Fundamentals",
        description: "Package an app so it runs the same everywhere.",
        required: true,
        lessons: [
          ["Docker Basics", "box", "Images, containers, and the difference between them.", "docker run hello-world"],
          ["Images & Layers", "layers", "How Dockerfiles build up reusable, cacheable layers.", "docker build -t app ."],
          ["Volumes & Networking", "network", "Persist data and let containers talk to each other.", "docker volume ls"]
        ],
        quiz: [
          ["A Docker image is best described as...", ["A read-only template a container is started from", "A running process", "A network configuration", "A virtual machine"], 0],
          ["Why does Docker build images in layers?", ["So unchanged layers can be cached and reused", "To make images larger", "To hide the Dockerfile", "To prevent updates"], 0],
          ["A Docker volume is mainly used to...", ["Persist data beyond a single container's lifecycle", "Speed up the CPU", "Replace the need for images", "Configure DNS"], 0],
          ["`docker run` versus `docker build` — which one starts a container?", ["docker run", "docker build", "Both do", "Neither — that's `docker start` only"], 0],
          ["Two containers on the same user-defined Docker network can generally...", ["Reach each other by container name", "Never communicate", "Only communicate via the host's public IP", "Share the same filesystem automatically"], 0]
        ]
      },
      {
        title: "Orchestration",
        description: "Run containers reliably, at more than one-machine scale.",
        required: true,
        lessons: [
          ["Kubernetes Concepts", "boxes", "Clusters, nodes, and the control plane at a high level.", "kubectl get nodes"],
          ["Pods & Deployments", "layout-grid", "The basic units Kubernetes schedules and manages.", "kubectl get pods"],
          ["Services & Ingress", "route", "Expose workloads inside and outside the cluster.", "kubectl get svc"],
          ["ConfigMaps & Secrets", "key-round", "Separate configuration and secrets from container images.", "kubectl get configmaps"]
        ],
        quiz: [
          ["In Kubernetes, a Pod is...", ["The smallest deployable unit, usually one or a few tightly-coupled containers", "A physical server", "A container image", "A network policy"], 0],
          ["A Kubernetes Deployment mainly manages...", ["Desired state and rollout of a set of Pods", "DNS records", "Firewall rules", "Disk partitions"], 0],
          ["A Kubernetes Service provides...", ["A stable network endpoint for a set of Pods", "A backup schedule", "A container image registry", "A log aggregator"], 0],
          ["Secrets exist separately from ConfigMaps mainly because...", ["Secrets hold sensitive values that need different handling", "Secrets are faster to read", "ConfigMaps can't hold text", "Kubernetes requires it for licensing"], 0],
          ["`kubectl get nodes` lists...", ["The machines in the cluster", "The running containers", "The DNS records", "The ingress rules"], 0]
        ]
      },
      {
        title: "Pipelines & Observability",
        description: "Ship changes safely, and know what's happening in production.",
        required: true,
        lessons: [
          ["CI/CD Fundamentals", "git-merge", "What continuous integration and delivery actually automate.", "git log --oneline -5"],
          ["Building a Pipeline", "workflow", "Stages: build, test, deploy.", "cat .github/workflows/ci.yml"],
          ["Monitoring & Metrics", "chart-line", "Know a system is healthy before a user tells you otherwise.", "curl localhost:3000/healthz"],
          ["Logging & Tracing", "scroll-text", "Follow a request across a distributed system.", "docker logs -f app"]
        ],
        quiz: [
          ["Continuous Integration primarily means...", ["Automatically building and testing every change", "Deploying straight to production with no tests", "Manually merging code once a month", "Only running tests before a release"], 0],
          ["A `/healthz` endpoint is typically used by...", ["Load balancers and orchestrators to check if an app is alive", "End users browsing the site", "The build pipeline's linter", "The DNS server"], 0],
          ["Structured (JSON) logs are generally preferred in production because...", ["They're easier for log-aggregation tools to parse and query", "They're shorter than plain text", "They don't need to be stored anywhere", "They replace the need for monitoring"], 0],
          ["A typical CI/CD pipeline stage order is...", ["Build, then test, then deploy", "Deploy, then build, then test", "Test, then deploy, then build", "There's no meaningful order"], 0],
          ["Distributed tracing helps you...", ["Follow a single request as it moves across services", "Compress log files", "Schedule cron jobs", "Manage DNS records"], 0]
        ]
      }
    ]
  },
  {
    course: ["LX-330", "Cloud Infrastructure", "cloud-infrastructure", "Linux at scale: infrastructure as code, monitoring, networking, and cost.", "Advanced", "16 hrs", "cloud"],
    chapters: [
      {
        title: "Infrastructure as Code",
        description: "Define infrastructure in text, not clicks.",
        required: true,
        lessons: [
          ["IaC Principles", "file-code", "Why infrastructure defined as code is repeatable and reviewable.", "terraform version"],
          ["Terraform Basics", "blocks", "Providers, resources, and plans.", "terraform plan"],
          ["State Management", "database", "What Terraform state is, and why it needs care.", "terraform state list"],
          ["Modules & Reuse", "package", "Package infrastructure patterns so teams stop copy-pasting.", "terraform init"]
        ],
        quiz: [
          ["Infrastructure as Code's main benefit is...", ["Infrastructure changes are reviewable, repeatable, and versioned", "It's always faster than clicking in a console", "It removes the need for testing", "It requires no documentation"], 0],
          ["Terraform state tracks...", ["The real-world resources Terraform is managing and their current config", "Only the Terraform code itself", "User login history", "DNS records only"], 0],
          ["`terraform plan` does what, *before* anything changes?", ["Shows what would change, without applying it", "Applies the changes immediately", "Deletes all resources", "Only validates syntax"], 0],
          ["A Terraform module is best described as...", ["A reusable, packaged set of infrastructure definitions", "A single cloud region", "A billing account", "A firewall rule"], 0],
          ["Why is Terraform state considered sensitive/important to protect?", ["It can contain resource details and sometimes secrets, and losing it breaks tracking", "It's just a log file with no real content", "It's automatically backed up by every provider", "It only matters in local development"], 0]
        ]
      },
      {
        title: "Cloud Networking & Compute",
        description: "Where things run, and how traffic reaches them.",
        required: true,
        lessons: [
          ["VPCs & Subnets", "network", "Isolate and segment cloud networks.", "Describe your default VPC"],
          ["Load Balancing", "scale", "Spread traffic across healthy instances.", "curl -I http://lb.example.com"],
          ["Auto Scaling", "trending-up", "Add and remove capacity automatically as demand changes.", "Describe an auto-scaling group"],
          ["Compute Instances", "server", "Choosing and sizing the machines that actually run your app.", "uptime"]
        ],
        quiz: [
          ["A VPC is best described as...", ["An isolated, private network within a cloud provider", "A single virtual machine", "A billing report", "A DNS record"], 0],
          ["A load balancer's main job is to...", ["Distribute incoming traffic across multiple healthy backends", "Store application data", "Encrypt disks", "Resolve DNS names"], 0],
          ["Auto scaling typically triggers on...", ["Metrics like CPU or request load crossing a threshold", "A fixed calendar date only", "Manual approval for every change", "The size of the codebase"], 0],
          ["A subnet is generally...", ["A smaller, segmented range within a larger network (VPC)", "A type of load balancer", "A billing category", "A DNS zone"], 0],
          ["Right-sizing a compute instance mainly balances...", ["Performance needs against cost", "Only disk space", "Only the OS version", "Only the region"], 0]
        ]
      },
      {
        title: "Operating at Scale",
        description: "Keep it running, keep it affordable, keep it recoverable.",
        required: true,
        lessons: [
          ["Cost Management", "wallet", "Where cloud spend actually goes, and how to see it.", "Review a billing report"],
          ["Monitoring & Alerts", "bell", "Get told about problems before customers do.", "curl localhost:3000/healthz"],
          ["Multi-Region Design", "globe", "Design for a region going away entirely.", "Describe a failover plan"],
          ["Incident Response", "siren", "What actually happens in the first ten minutes of an outage.", "Check the status page"]
        ],
        quiz: [
          ["A common driver of unexpectedly high cloud bills is...", ["Idle or oversized resources left running", "Using infrastructure as code", "Enabling monitoring", "Using a CDN"], 0],
          ["Alerting is most useful when it's...", ["Actionable, and tied to something a human can actually fix", "As noisy as possible, to catch everything", "Only checked once a week", "Sent to nobody in particular"], 0],
          ["Multi-region design mainly protects against...", ["An entire region becoming unavailable", "A single typo in application code", "Slow database queries", "DNS propagation delay"], 0],
          ["A good first step when an incident starts is usually to...", ["Assess impact and start communicating status", "Immediately roll back every recent deploy", "Wait for customers to stop complaining", "Reboot every server at once"], 0],
          ["A postmortem after an incident is mainly meant to...", ["Understand root cause and prevent recurrence, without blame", "Assign blame to whoever was on call", "Justify a bigger budget", "Satisfy a compliance checkbox only"], 0]
        ]
      }
    ]
  }
];
