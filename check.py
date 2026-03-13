import yaml
import requests
import subprocess
import time
import urllib.parse
import sys

try:
    with open("clash_nodes.yaml", "r", encoding='utf-8') as f:
        data = yaml.safe_load(f)
except Exception as e:
    print(f"读取 YAML 失败: {e}")
    sys.exit(1)

if not isinstance(data, dict):
    print(f"❌ 严重错误: Subconverter 转换节点失败！返回内容为: {data}")
    sys.exit(1)

proxies = data.get("proxies", [])
if not proxies:
    print("没有找到任何可用代理节点，退出。")
    sys.exit(0)

# 升级 1：禁用 IPv6，确保筛选出的节点符合国内常见网络环境
mihomo_config = {
    "allow-lan": True,
    "bind-address": "*",
    "ipv6": False, 
    "external-controller": "127.0.0.1:9090",
    "proxies": proxies
}
with open("mihomo_config.yaml", "w", encoding='utf-8') as f:
    yaml.dump(mihomo_config, f, allow_unicode=True)

print("启动 Mihomo 进行测速...")
process = subprocess.Popen(["./mihomo", "-d", ".", "-f", "mihomo_config.yaml"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(3) 

valid_proxies = []

# 定义严格测速函数
def test_proxy(name):
    encoded_name = urllib.parse.quote(name)
    # 升级 2：将超时时间严格限制在 2000ms，剔除高延迟垃圾节点
    test_url = f"http://127.0.0.1:9090/proxies/{encoded_name}/delay?timeout=2000&url=https://www.gstatic.com/generate_204"
    try:
        res = requests.get(test_url, timeout=3)
        if res.status_code == 200 and "delay" in res.json():
            return res.json()['delay']
    except:
        pass
    return 0

print("开始进行严格连通性测试 (双重验证)...")
for p in proxies:
    name = p['name']
    
    # 第一次测速
    delay1 = test_proxy(name)
    if delay1 > 0:
        # 升级 3：复测机制。停顿 0.5 秒后进行第二次测速，过滤“诈尸”节点
        time.sleep(0.5)
        delay2 = test_proxy(name)
        if delay2 > 0:
            print(f"[✅ 保留] {name} - 延迟: {delay2}ms")
            valid_proxies.append(p)
        else:
            print(f"[❌ 删除] {name} - 二次测速掉线 (极不稳定)")
    else:
        print(f"[❌ 删除] {name} - 测速不通")

process.terminate()

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
    
print(f"\n测速完成！初始节点 {len(proxies)} 个，严格保留有效节点 {len(valid_proxies)} 个。")
