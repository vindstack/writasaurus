export async function dialogCommand(): Promise<string | null> {
  if (Deno.build.os === "linux") {
    for (const cmd of ["zenity", "kdialog"]) {
      try {
        const perm = await Deno.permissions.query({ name: "run", command: cmd });
        if (perm.state !== "granted") continue;
        const res = await new Deno.Command("which", {
          args: [cmd],
          stdout: "null",
          stderr: "null",
        }).output();
        if (res.success) return cmd;
      } catch {
        // Continue searching
      }
    }
    return "zenity";
  }
  if (Deno.build.os === "darwin") return "osascript";
  return "powershell";
}

export async function chooseFile(
  action: "open" | "save",
  suggestedName = "manuscript.epub",
  filterName = "EPUB eBook",
  filterExtensions = ["*.epub"],
): Promise<string | null> {
  const command = await dialogCommand();
  if (!command) return null;
  const perm = await Deno.permissions.query({ name: "run", command });
  if (perm.state !== "granted") return null;

  let args: string[];
  if (command === "zenity") {
    const filter = `${filterName} | ${filterExtensions.join(" ")}`;
    args = [
      "--file-selection",
      `--title=${action === "open" ? "Open" : "Save"} Manuscript`,
      `--file-filter=${filter}`,
      ...(action === "save"
        ? ["--save", "--confirm-overwrite", `--filename=${suggestedName}`]
        : []),
    ];
  } else if (command === "kdialog") {
    const filter = `${filterExtensions.join(" ")}|${filterName}`;
    args = action === "open"
      ? ["--getopenfilename", ".", filter, `--title=Open Manuscript`]
      : ["--getsavefilename", suggestedName, filter, `--title=Save Manuscript`];
  } else if (command === "osascript") {
    const script = action === "open"
      ? 'POSIX path of (choose file with prompt "Open Manuscript")'
      : `POSIX path of (choose file name with prompt "Save Manuscript" default name "${
        suggestedName.replaceAll('"', "")
      }")`;
    args = ["-e", script];
  } else {
    const dialog = action === "open" ? "OpenFileDialog" : "SaveFileDialog";
    const winFilter = `${filterName} (${filterExtensions.join(";")})|${filterExtensions.join(";")}`;
    args = [
      "-NoProfile",
      "-Command",
      `Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.${dialog}; ` +
      `$d.Filter='${winFilter}'; ` +
      `$d.FileName='${suggestedName.replaceAll("'", "")}'; ` +
      `if($d.ShowDialog() -eq 'OK'){[Console]::Write($d.FileName)}`,
    ];
  }

  try {
    const output = await new Deno.Command(command, {
      args,
      stdout: "piped",
      stderr: "null",
    }).output();
    if (!output.success) return null;
    return new TextDecoder().decode(output.stdout).trim() || null;
  } catch {
    return null;
  }
}

function appStateDir(): string | null {
  const home = Deno.env.get("HOME");
  if (Deno.build.os === "linux") {
    const base = Deno.env.get("XDG_DATA_HOME") || (home ? `${home}/.local/share` : null);
    return base ? `${base}/writasaurus` : null;
  }
  if (Deno.build.os === "darwin") {
    return home ? `${home}/Library/Application Support/writasaurus` : null;
  }
  const base = Deno.env.get("LOCALAPPDATA") || Deno.env.get("APPDATA");
  return base ? `${base}\\writasaurus` : null;
}

async function operatingSystemDeviceId(): Promise<string | null> {
  if (Deno.build.os === "linux") {
    for (const path of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
      try {
        const value = (await Deno.readTextFile(path)).trim();
        if (value) return value;
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
    }
    return null;
  }
  const command = Deno.build.os === "darwin" ? "ioreg" : "powershell";
  const args = Deno.build.os === "darwin" ? ["-rd1", "-c", "IOPlatformExpertDevice"] : [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' -Name MachineGuid).MachineGuid",
  ];
  const permission = await Deno.permissions.query({ name: "run", command });
  if (permission.state !== "granted") {
    throw new Error(`Permission to read the ${Deno.build.os} device identifier was not granted.`);
  }
  const output = await new Deno.Command(command, {
    args,
    stdout: "piped",
    stderr: "null",
  }).output();
  if (!output.success) throw new Error(`Could not read the ${Deno.build.os} device identifier.`);
  const result = new TextDecoder().decode(output.stdout);
  const value = Deno.build.os === "darwin"
    ? result.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)?.[1]
    : result.trim();
  return value?.trim() || null;
}

export async function loadOrCreateInstallationId(): Promise<string> {
  try {
    const id = await operatingSystemDeviceId();
    if (id) return id;
  } catch (error) {
    console.warn(
      `Could not read the operating-system device identifier; using this installation's identifier: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
  const dir = appStateDir();
  if (!dir) throw new Error("Could not locate the Writasaurus application data directory.");
  const path = `${dir}/installation-id`;
  try {
    const value = (await Deno.readTextFile(path)).trim();
    if (/^[0-9a-f-]{36}$/i.test(value)) return value;
    throw new Error("The stored installation identifier is invalid.");
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  await Deno.mkdir(dir, { recursive: true });
  const value = crypto.randomUUID();
  try {
    await Deno.writeTextFile(path, value, { createNew: true });
    return value;
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
    const stored = (await Deno.readTextFile(path)).trim();
    if (!/^[0-9a-f-]{36}$/i.test(stored)) {
      throw new Error("The stored installation identifier is invalid.");
    }
    return stored;
  }
}

function lastFilePath(): string | null {
  const dir = appStateDir();
  return dir ? `${dir}/last-file.json` : null;
}

export async function loadLastFilePath(): Promise<string | null> {
  try {
    const path = lastFilePath();
    if (!path) return null;
    const data = JSON.parse(await Deno.readTextFile(path));
    return typeof data?.path === "string" ? data.path : null;
  } catch {
    return null;
  }
}

export async function saveLastFilePath(path: string): Promise<void> {
  try {
    const statePath = lastFilePath();
    if (!statePath) return;
    const dir = appStateDir();
    if (dir) await Deno.mkdir(dir, { recursive: true });
    await Deno.writeTextFile(statePath, JSON.stringify({ path }));
  } catch (error) {
    if (!(error instanceof Deno.errors.NotCapable)) {
      console.warn("Could not remember the last opened file.", error);
    }
  }
}

export async function clearLastFilePath(): Promise<void> {
  try {
    const statePath = lastFilePath();
    if (!statePath) return;
    await Deno.remove(statePath);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound) && !(error instanceof Deno.errors.NotCapable)) {
      console.warn("Could not clear the last opened file.", error);
    }
  }
}
