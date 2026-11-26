"""Connect the existing macOS Feishu LaunchAgent to the local GEPA optimizer."""
import argparse
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import tempfile
import time
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
AGENTS = Path.home() / "Library/LaunchAgents"
CONNECTOR = "com.osbornalpha.feishu-connector"
WORKER = "com.osbornalpha.feishu-auto-optimizer"
DOMAIN = f"gui/{os.getuid()}"


def atomic_file(path, data, mode=0o600):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        name = stream.name
        try:
            os.fchmod(stream.fileno(), mode)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        except BaseException:
            os.unlink(name)
            raise
    try:
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def control(*args, check=True):
    return subprocess.run(["/bin/launchctl", *map(str, args)], check=check,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode


def set_entry(env_text, key, value):
    pattern = r"(?m)^(?:export[ \t]+)?" + key + r"[ \t]*=.*$"
    line = key + "=" + value
    return re.sub(pattern, lambda _: line, env_text) if re.search(pattern, env_text) else env_text.rstrip("\n")+"\n"+line+"\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--disable", action="store_true")
    parser.add_argument("--redact-name", action="append", default=[], help="additional group display name to mask")
    args = parser.parse_args()
    plist_path = AGENTS / (WORKER + ".plist")
    connector = plistlib.loads((AGENTS / (CONNECTOR + ".plist")).read_bytes())
    if Path(connector["WorkingDirectory"]).resolve() != ROOT:
        raise SystemExit("此目录与已安装的正式飞书连接器不一致。")
    arguments = connector["ProgramArguments"]
    node = Path(arguments[0])
    env_file = Path(next(arg.split("=", 1)[1] for arg in arguments if arg.startswith("--env-file=")))
    process_env = connector.get("EnvironmentVariables", {})
    keys = ["FEISHU_DATA_DIR", "FEISHU_LLM_BASE_URL", "FEISHU_LLM_MODEL", "FEISHU_LLM_TIMEOUT_MS",
            "FEISHU_OPTIMIZATION_MONITOR_DB", "FEISHU_OPTIMIZATION_REDACT_NAMES"]
    # Nothing else from the connector environment passes to either stdout or the optimizer.
    script = "console.log(JSON.stringify(Object.fromEntries(process.argv.slice(1).map(k=>[k,process.env[k]]))))"
    result = subprocess.check_output([node, "--env-file="+str(env_file), "-e", script, *keys], env=process_env, cwd=ROOT)
    env = json.loads(result)
    data = Path(env.get("FEISHU_DATA_DIR") or ROOT/"build/feishu").resolve()
    directory = ROOT/"build/feishu-optimization/auto"
    python = ROOT/"build/feishu-optimization/venv/bin/python"
    raw_env = env_file.read_text()
    updated = set_entry(raw_env, "OSBORN_FEISHU_AUTO_OPTIMIZE", "false" if args.disable else "true")
    if args.redact_name:
        if any(not re.fullmatch(r"[\w\u3400-\u9fff ·.-]{2,60}", s) for s in args.redact_name):
            raise SystemExit("额外需要隐去的成员名称无效。")
        names = list(dict.fromkeys([s for s in (env.get("FEISHU_OPTIMIZATION_REDACT_NAMES") or "").split(",") if s] + args.redact_name))
        updated = set_entry(updated, "FEISHU_OPTIMIZATION_REDACT_NAMES", json.dumps(",".join(names), ensure_ascii=False))
    if not args.disable:
        base_url = env.get("FEISHU_LLM_BASE_URL") or ""
        url = urlsplit(base_url)
        if (url.scheme not in {"http", "https"} or url.hostname not in {"localhost", "127.0.0.1", "::1"} or
                url.username or url.password or url.query or url.fragment or url.path.rstrip("/") != "/v1" or not env.get("FEISHU_LLM_MODEL")):
            raise SystemExit("请先在正式连接器配置可用的本机模型。")
        subprocess.run([python, "-c", "import gepa"], cwd=ROOT, check=True)
        settings = dict(directory=str(directory), monitorPath=str(Path(env.get("FEISHU_OPTIMIZATION_MONITOR_DB") or data/"optimization-monitor.sqlite").resolve()),
                        liveQueuePath=str(data/"feishu-workflow.sqlite"), model=env["FEISHU_LLM_MODEL"],
                        baseUrl=base_url, timeoutMs=int(env.get("FEISHU_LLM_TIMEOUT_MS") or 35000), apply=True)
        directory.mkdir(parents=True, mode=0o700, exist_ok=True)
        directory.chmod(0o700)
        settings_path = directory/"settings.json"
        atomic_file(settings_path, (json.dumps(settings, ensure_ascii=False, indent=2)+"\n").encode())
        job = dict(Label=WORKER, ProgramArguments=[str(node), str(HERE/"auto-worker.mjs"), "--settings", str(settings_path)],
                   WorkingDirectory=str(ROOT), EnvironmentVariables={"PATH": str(node.parent)+":/opt/homebrew/bin:/usr/bin:/bin", "NODE_NO_WARNINGS": "1"},
                   RunAtLoad=True, StartInterval=300, Nice=10, LowPriorityIO=True, Umask=0o077,
                   StandardOutPath=str(directory/"worker.log"), StandardErrorPath=str(directory/"worker.err.log"))
        plist = plistlib.dumps(job)
        changed_job = not plist_path.exists() or plist_path.read_bytes() != plist
    if args.disable or changed_job:
        if control("print", DOMAIN+"/"+WORKER, check=False) == 0:
            control("bootout", DOMAIN+"/"+WORKER)
    if args.disable:
        plist_path.unlink(missing_ok=True)
    else:
        atomic_file(plist_path, plist)
    if raw_env != updated:
        atomic_file(env_file, updated.encode())
        control("kill", "SIGTERM", DOMAIN+"/"+CONNECTOR)
    if not args.disable and control("print", DOMAIN+"/"+WORKER, check=False):
        for attempt in range(5):
            if control("bootstrap", DOMAIN, plist_path, check=False) == 0:
                break
            time.sleep(1)
        else:
            raise SystemExit("自动优化服务尚未加载，请核对 LaunchAgent。")
    print("已停用本机自动优化。" if args.disable else "已启用本机自动优化，每五分钟巡检。")


if __name__ == "__main__":
    main()
