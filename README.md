# Port Manager

A Windows desktop app to view, manage, and kill processes using network ports. Built with Electron.

> **Tip:** After creating your GitHub repo, replace `YOUR_USERNAME` in the links below with your username.

---

## Who is this for?

- **Developers** – Stop dev servers (Vite, Next.js, Node) and free ports without hunting down PIDs
- **DevOps / Sysadmins** – Quickly identify what's using a port and terminate it
- **Anyone** – When "port already in use" blocks you, find and kill the process in one place

---

## Features

| Feature | Description |
|--------|-------------|
| **All Ports** | See every listening TCP port with process, PID, and address |
| **Port Types** | Color-coded badges: System, Development, Common, Unknown |
| **Development Tab** | Tag ports (Backend, Frontend, Database) and kill them by group |
| **Search & Sort** | Filter by port, app, or PID; sort by any column |
| **Details Panel** | Click a row to see full executable path |
| **One-Click Kill** | Terminate processes with confirmation (and a warning for system ports) |

---

## Prerequisites

- **Windows 10/11** – Uses `netstat`, `wmic`, `taskkill`
- **Node.js 18+** – For running from source or building

---

## Setup

### Option A: Run from source (development)

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/port-manager.git   # replace YOUR_USERNAME
cd port-manager

# Install dependencies
npm install

# Start the app
npm start
```

### Option B: Install the built app (no Node.js needed)

1. Go to [Releases](https://github.com/YOUR_USERNAME/port-manager/releases) (replace `YOUR_USERNAME` with your GitHub username)
2. Download **Port Manager Setup 1.0.0.exe** (installer) or **Port Manager 1.0.0.exe** (portable)
3. Run the installer or the portable exe

---

## How to use

### All Ports tab

- **View ports** – Every listening TCP port is listed with its process and PID
- **Sort** – Click a column header (Port, Type, Application, PID, etc.)
- **Search** – Type in the search bar to filter by port, app name, or PID
- **Tag** – Use the **Tag...** dropdown to mark a port as Backend, Frontend, or Database
- **Details** – Click a row (not the Kill button) to see full process path in the bottom panel
- **Kill** – Click **Kill** to force-terminate a process (you’ll get a confirmation)

### Development tab

- **Grouped ports** – Ports you tagged appear in Backend, Frontend, or Database sections
- **Kill all** – Use **Kill all Backend** (or Frontend/Database) to stop every process in that group
- **Individual Kill** – You can still kill single processes from the list

### Port type badges

| Badge | Meaning |
|-------|---------|
| **System** | Windows/OS services (RPC, SMB, NetBIOS, etc.) – avoid killing unless you know what you’re doing |
| **Development** | Dev servers (Vite, Next.js, Angular, etc.) – usually safe to kill |
| **Common** | Well-known services (Postgres, Redis, HTTP/HTTPS) – check before killing |
| **Unknown** | Port not in our reference – could be user apps or dynamic ports. Hover for tooltip. |

---

## Building from source

```bash
npm install
npm run build
```

Output in `dist/`:

- **Port Manager Setup 1.0.0.exe** – Installer (NSIS)
- **Port Manager 1.0.0.exe** – Portable (no install)

### Build only portable

```bash
npm run build:portable
```

### Custom icon (optional)

1. Add `assets/icon.ico` (256×256 recommended)
2. Add `"icon": "assets/icon.ico"` under `build.win` in `package.json`

---

## Tech stack

- **Electron** – Desktop app
- **Vanilla JS** – No frontend framework
- **Windows APIs** – `netstat`, `wmic`, `taskkill`, PowerShell (for process metadata)

---

## License

MIT
