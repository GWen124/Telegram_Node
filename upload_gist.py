import yaml
import os
import requests
import sys

try:
    with open("sources.yaml", "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)
except Exception as e:
    print(f"读取 sources.yaml 失败: {e}")
    sys.exit(0)

gist_enable = config.get("GIST_ENABLE", False)
gist_id = config.get("GIST_ID", "")
gist_token = os.getenv("GIST_TOKEN", "")

if not gist_enable:
    print("ℹ️ Gist 同步处于 [关闭] 状态，结果将仅保存在当前仓库中。")
    sys.exit(0)

if not gist_id or not gist_token:
    print("⚠️ 开启了 Gist 同步，但缺失 GIST_ID 或 GIST_TOKEN (Secret)，跳过同步！")
    sys.exit(0)

print(f"🔄 检测到 Gist 同步已开启，准备推送至 Gist: {gist_id} ...")
files_payload = {}

# 提取需要上传的订阅文件
for filename in ["final_sub.yaml", "final_sub.txt"]:
    if os.path.exists(filename):
        with open(filename, "r", encoding="utf-8") as f:
            content = f.read()
            files_payload[filename] = {"content": content}

if not files_payload:
    print("⚠️ 没有找到生成的 final_sub.yaml 或 final_sub.txt，无法同步。")
    sys.exit(0)

# 使用 GitHub API 更新 Gist
url = f"https://api.github.com/gists/{gist_id}"
headers = {
    "Authorization": f"token {gist_token}",
    "Accept": "application/vnd.github.v3+json"
}

res = requests.patch(url, headers=headers, json={"files": files_payload})
if res.status_code == 200:
    print("🎉 成功将最新订阅同步至 Gist！")
else:
    print(f"❌ 同步至 Gist 失败: HTTP {res.status_code} - {res.text}")
