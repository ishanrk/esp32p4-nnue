"""Prepare local artifacts and hashes. Never flash, deploy or publish."""
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def git(*args): return subprocess.check_output(["git",*args],cwd=ROOT).decode()

def main():
    source_paths = sorted(set(filter(None,git("ls-files","-z").split("\0"))) |
                          set(filter(None,git("ls-files","--others","--exclude-standard","-z").split("\0"))))
    if any(path.startswith(".private/") for path in source_paths):
        raise SystemExit("Private material is included in source paths")
    source_digest = hashlib.sha256("".join(f"{path}\0{sha(ROOT/path)}\n" for path in source_paths).encode()).hexdigest()
    files = ["esp/build/bootloader/bootloader.bin", "esp/build/partition_table/partition-table.bin",
             "esp/build/esp32p4_nnue.bin", "esp/build/flasher_args.json", "esp/build/flash_args",
             "build/ishanrk-serial-chess-0.1.0-rc.1.tgz", "build/serial-chess-adapter-0.1.0-rc.1.tar.gz"]
    for name in files:
        if not (ROOT/name).is_file(): raise SystemExit(f"Build prerequisite missing: {name}")
    out = ROOT/"build/release-candidate"
    out.mkdir(parents=True,exist_ok=True)
    firmware = out/"esp32p4-firmware-1.2-rc.1.tar.gz"
    with tarfile.open(firmware,"w:gz") as archive:
        for name in files[:5]: archive.add(ROOT/name,arcname=name.removeprefix("esp/build/"),recursive=False)
    with tarfile.open(firmware) as archive:
        assert not any(".private" in name or "study" in name for name in archive.getnames())
    commands = json.loads((ROOT/"esp/build/compile_commands.json").read_text())
    project = json.loads((ROOT/"esp/build/project_description.json").read_text())
    if project["target"] != "esp32p4": raise SystemExit("Expected the reference ESP32 P4 target")
    main_command = next(item for item in commands if item["file"].endswith("esp/main/app.c"))
    report = {"status":"local release candidate, not physically tested or published", "target":"ESP32-P4",
              "firmware_version":project["project_version"], "esp_idf":project["git_revision"], "source_commit":git("rev-parse","HEAD").strip(),
              "source_digest":source_digest,"source_digest_method":"sha256 of sorted path NUL file_sha256 LF records",
              "working_tree":git("status","--short"),"compile_command":main_command,
              "flash_arguments":json.loads((ROOT/"esp/build/flasher_args.json").read_text()),
              "files":[{"path":name,"bytes":(ROOT/name).stat().st_size,"sha256":sha(ROOT/name)} for name in files],
              "firmware_archive":{"path":str(firmware.relative_to(ROOT)),"sha256":sha(firmware)},
              "remaining":["Owner source license and contribution provenance decision before publication", "Physical board flashing and USB validation", "Power interruption, watchdog, heap and stack observations", "Complete game recording"]}
    (out/"manifest.json").write_text(json.dumps(report,indent=2)+"\n")
    print(f"Prepared {out.relative_to(ROOT)}/manifest.json. No hardware or publication action performed.")

if __name__ == "__main__": main()
