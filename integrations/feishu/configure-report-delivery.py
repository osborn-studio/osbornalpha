"""Configure the destination for formal account reports in the bound Feishu group."""
import argparse
import getpass
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
AGENT = "com.osbornalpha.feishu-connector"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["webhook", "app", "off"])
    parser.add_argument("--directory", type=Path, help="use a standalone connector directory without restarting launchd")
    args = parser.parse_args()
    directory = args.directory
    if directory is None:
        plist = plistlib.loads((Path.home()/"Library/LaunchAgents"/(AGENT+".plist")).read_bytes())
        if Path(plist["WorkingDirectory"]).resolve() != ROOT:
            raise SystemExit("该工作区与已安装的连接器不一致。")
        directory = Path(plist.get("EnvironmentVariables", {}).get("FEISHU_DATA_DIR", ROOT/"build"/"feishu"))
    path = directory/"feishu-report-delivery.json"
    if args.mode == "off":
        path.unlink(missing_ok=True)
    else:
        bound = json.loads((directory/"feishu-bindings.json").read_text())
        if not re.fullmatch(r"oc_[A-Za-z0-9_-]+", bound.get("chatId", "")):
            raise SystemExit("请先完成正式连接器与目标群的绑定。")
        config = {"mode": args.mode, "chatId": bound["chatId"]}
        if args.mode == "webhook":
            config["url"] = getpass.getpass("请输入上述绑定群中自定义机器人的 Webhook（隐藏输入）：").strip()
            if not re.fullmatch(r"https://(?:open\.feishu\.cn|open\.larksuite\.com)/open-apis/bot/v2/hook/[A-Za-z0-9_-]{8,150}", config["url"]):
                raise SystemExit("Webhook 格式不正确。")
            secret = getpass.getpass("签名密钥（可直接回车）：").strip()
            if len(secret) > 256 or any(c in secret for c in "\r\n"):
                raise SystemExit("签名密钥格式不正确。")
            if secret:
                config["secret"] = secret
        with tempfile.NamedTemporaryFile(dir=directory, mode="w", delete=False) as stream:
            temporary = Path(stream.name)
            os.fchmod(stream.fileno(), 0o600)
            json.dump(config, stream)
        try:
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
    if args.directory is None:
        subprocess.run(["launchctl", "kill", "SIGTERM", f"gui/{os.getuid()}/{AGENT}"], check=True)
    print("已保存正式查询播报设置。")


if __name__ == "__main__":
    main()
