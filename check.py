import yaml
import requests
import subprocess
import time
import urllib.parse
import sys
import hashlib
import json

try:
    with open("clash_nodes.yaml", "r", encoding='utf-8') as f:
        data = yaml.safe_load(f)
except Exception as e:
    print(f"读取 YAML 失败: {e}")
    sys.exit(1)

if not isinstance(data, dict):
    print(f"❌ 严重错误: Subconverter 转换节点失败！返回内容为: {data}")
    sys.exit(1)

raw_proxies = data.get("proxies", [])
if not raw_proxies:
    print("没有找到任何可用代理节点，退出。")
    sys.exit(0)

# ==========================================
# 核心升级：全局精准去重 (比较底层配置，无视名字差异)
# ==========================================
proxies = []
seen_hashes = set()

for p in raw_proxies:
    # 剥离 'name' 字段，只对比服务器、端口、UUID等核心参数
    p_config = {k: v for k, v in p.items() if k != 'name'}
    # 转为排序后的 JSON 字符串以确保哈希稳定性
    config_str = json.dumps(p_config, sort_keys=True)
    config_hash = hashlib.md5(config_str.encode('utf-8')).hexdigest()
    
    if config_hash not in seen_hashes:
        seen_hashes.add(config_hash)
        proxies.append(p)

print(f"✅ 全局去重完毕: 抓取总计 {len(raw_proxies)} 个，去重后剩余 {len(proxies)} 个独立节点。")

# 生成测速配置文件
mihomo_config = {
    "allow-lan": True,
    "bind-address": "*",
    "external-controller": "127.0.0.1:9090",
    "proxies": proxies
}
with open("mihomo_config.yaml", "w", encoding='utf-8') as f:
    yaml.dump(mihomo_config, f, allow_unicode=True)

print("启动 Mihomo 进行测速...")
process = subprocess.Popen(["./mihomo", "-d", ".", "-f", "mihomo_config.yaml"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(3) 

valid_proxies = []

def test_proxy(name):
    encoded_name = urllib.parse.quote(name)
    test_url = f"http://127.0.0.1:9090/proxies/{encoded_name}/delay?timeout=2000&url=https://www.gstatic.com/generate_204"
    try:
        res = requests.get(test_url, timeout=3)
        if res.status_code == 200 and "delay" in res.json():
            return res.json()['delay']
    except:
        pass
    return 0

print("开始进行连通性测试...")
for p in proxies:
    original_name = p['name']
    delay = test_proxy(original_name)
    if delay > 0:
        print(f"[✅ 保留] {original_name} - 延迟: {delay}ms")
        valid_proxies.append(p)
    else:
        print(f"[❌ 删除] {original_name} - 测速不通")

process.terminate()

# ==========================================
# 统一重命名
# ==========================================
PREFIX = "免费节点" # 修改为你喜欢的名字
for index, p in enumerate(valid_proxies, start=1):
    new_name = f"{PREFIX}_{index:03d}"
    p['name'] = new_name

final_output = {
    "proxies": valid_proxies,
    "proxy-groups": [
        {
            "name": "🚀 自动选择",
            "type": "url-test",
            "proxies": [p['name'] for p in valid_proxies],
            "url": "https://www.gstatic.com/generate_204",
            "interval": 3600
        }
    ]
}

with open("final_sub.yaml", "w", encoding='utf-8') as f:
    yaml.dump(final_output, f, allow_unicode=True, sort_keys=False)
    
print(f"\n🎉 测速与重命名完成！最终保留有效节点 {len(valid_proxies)} 个。")
