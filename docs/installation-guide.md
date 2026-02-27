# Copilot CLI Installation Guide for Air-Gapped Environments

This guide explains how to download and install the **Copilot CLI v0.0.418+** in air-gapped (disconnected) environments where internet access is restricted.

## Overview

The Forge VS Code extension requires the Copilot CLI binary to run. In air-gapped environments, you cannot download the CLI directly on the target machine. Instead, follow this process:

1. **Download** the CLI binary on a **connected machine**
2. **Transfer** it to the **disconnected target machine** via approved media
3. **Install** and **verify** on the target

---

## Prerequisites

- **Connected machine:** Internet access to GitHub, ability to download files
- **Target machine:** Air-gapped environment, VS Code 1.93+, terminal access
- **Approved transfer media:** USB drive, approved file transfer system, or other compliance-approved method

---

## Step 1: Download Copilot CLI on a Connected Machine

### 1.1 Locate the Latest Release

Open a web browser and navigate to the **Copilot CLI releases page**:

```
https://github.com/github/copilot-cli/releases
```

### 1.2 Download the Binary

Look for the latest release tagged **v0.0.418 or higher**. Download the appropriate binary for your operating system:

| Operating System | File Name |
|------------------|-----------|
| **macOS (Intel)** | `copilot-darwin-amd64` or `copilot-v0.0.418-darwin-amd64` |
| **macOS (Apple Silicon)** | `copilot-darwin-arm64` or `copilot-v0.0.418-darwin-arm64` |
| **Linux (x86_64)** | `copilot-linux-amd64` or `copilot-v0.0.418-linux-amd64` |
| **Windows (x86_64)** | `copilot-windows-amd64.exe` or `copilot-v0.0.418-windows-amd64.exe` |

**Example:** For Linux x86_64, the file URL looks like:
```
https://github.com/github/copilot-cli/releases/download/v0.0.418/copilot-linux-amd64
```

### 1.3 Verify the Binary (Recommended)

GitHub provides checksums (SHA256) for each release. After downloading, verify the file's integrity:

```bash
# On macOS/Linux, download the checksums file (replace v0.0.418 with your actual downloaded version)
curl -L https://github.com/github/copilot-cli/releases/download/v0.0.418/checksums.txt -o checksums.txt

# Verify the binary (replace v0.0.418 with your actual downloaded version)
sha256sum -c checksums.txt --ignore-missing
# Expected output: copilot-linux-amd64: OK

# On macOS, use shasum instead
shasum -a 256 -c checksums.txt --ignore-missing
```

---

## Step 2: Transfer to the Air-Gapped Target Machine

Use an **approved transfer method** to move the binary to the disconnected environment. Common options:

- **USB drive:** Copy the binary to a USB drive on the connected machine, physically transfer to the target machine
- **Approved file transfer system:** Use your organization's secure file transfer mechanism (e.g., secure portal, approved tool)
- **Offline storage:** Burn to CD/DVD or other approved media

**Important:** Ensure the binary is transferred securely and verify integrity on the target machine (Step 3).

---

## Step 3: Install on the Target Machine

### 3.1 Locate the Binary

On the target (disconnected) machine, navigate to where you transferred the binary. Example:

```bash
# Copy to a working directory
mkdir -p ~/copilot-cli
cd ~/copilot-cli
ls -la copilot-linux-amd64  # Verify the file exists
```

### 3.2 Make the Binary Executable

On macOS and Linux, mark the binary as executable:

```bash
chmod +x copilot-linux-amd64
```

(On Windows, `.exe` files are automatically executable.)

### 3.3 Add to PATH (Option A: Global Installation)

Move the binary to a directory on your system's `$PATH` so it can be called from anywhere:

**Linux/macOS:**
```bash
# Option 1: Copy to /usr/local/bin (requires sudo)
sudo cp copilot-linux-amd64 /usr/local/bin/copilot

# Option 2: Copy to ~/.local/bin (no sudo, add to PATH if needed)
mkdir -p ~/.local/bin
cp copilot-linux-amd64 ~/.local/bin/copilot
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

**Windows (PowerShell as Administrator):**
```powershell
# Create a directory for copilot binary
New-Item -ItemType Directory -Path "$env:APPDATA\copilot" -Force
Copy-Item .\copilot-windows-amd64.exe "$env:APPDATA\copilot\copilot.exe"

# Add to PATH via environment variables
[Environment]::SetEnvironmentVariable(
    "Path",
    "$env:APPDATA\copilot;$([Environment]::GetEnvironmentVariable('Path', 'User'))",
    "User"
)
# Restart terminal after this change
```

### 3.4 Specify CLI Path in Settings (Option B: Local Configuration)

Alternatively, configure the path directly in the Forge extension settings without adding to `$PATH`:

1. In VS Code, open **Settings** (`Ctrl+,` / `Cmd+,`)
2. Search for `forge.copilot.cliPath`
3. Enter the **full path** to the binary:
   ```
   /home/user/copilot-cli/copilot-linux-amd64
   ```
   or (Windows):
   ```
   C:\Users\user\copilot-cli\copilot-windows-amd64.exe
   ```

---

## Step 4: Verify Installation

### 4.1 Check Version

Run the following command in a terminal to verify the CLI is installed and accessible:

```bash
copilot --version
```

**Expected output:**
```
copilot version 0.0.418
```

(Version number may be higher if you downloaded a newer release.)

### 4.2 Verify CLI Can Start

Test that the CLI can start in server mode:

```bash
copilot server
```

You should see output indicating the CLI is running, for example:
```
Copilot CLI server listening on stdio
```

Press `Ctrl+C` to stop the server.

### 4.3 Test the Extension

Once the CLI is verified:

1. Open VS Code
2. Look for the Forge icon in the VS Code bottom panel (next to Terminal and Output)
3. Click the icon to open the Forge sidebar
4. Type a message (e.g., `hello`), then click **Send** or press **Ctrl+Enter** (or **Cmd+Enter** on macOS) to submit it
5. If configured correctly, you should see the response stream

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **`copilot: command not found`** | The binary is not on `$PATH`. Either move it to `/usr/local/bin` (Linux/macOS) or configure `forge.copilot.cliPath` in settings. |
| **`Permission denied` when running copilot** | Run `chmod +x copilot-linux-amd64` to make the binary executable. |
| **`Wrong binary for this OS`** | Verify you downloaded the correct binary for your operating system (e.g., `linux-amd64` for Linux x86_64, not macOS). |
| **`copilot server` hangs or crashes** | Check that the CLI version is 0.0.418 or higher. Run `copilot --version` to confirm. |
| **VS Code shows "Copilot CLI not found" error** | Verify the `copilot` command works in a terminal. If using `forge.copilot.cliPath`, ensure the path is correct and absolute. |

---

## Summary

1. **Download** the Copilot CLI v0.0.418+ from GitHub on a connected machine
2. **Transfer** the binary to your air-gapped target machine via approved media
3. **Make executable** and **add to PATH** (Linux/macOS) or configure in Forge settings
4. **Verify** with `copilot --version` and `copilot server`
5. **Test** the Forge extension in VS Code

Once the CLI is installed and verified, proceed to [Configuration Reference](configuration-reference.md) to set up the Azure AI Foundry endpoint.
