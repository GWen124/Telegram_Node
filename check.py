import yaml
import requests
import subprocess
import time
import urllib.parse
import sys

# 1. 安全读取转换后的节点文件
try:
    with open("clash_nodes.yaml", "r", encoding='utf-8') as f:
        data = yaml.safe_load(f)
except Exception as e:
    print(f"读取 YAML 失败: {e}")
    sys.exit(1)

# 容错拦截：如果 Subconverter 转换失败返回纯文本
if not isinstance(data, dict):
    print(f"❌ 严重错误: Subconverter 转换节点失败！返回内容为: {data}")
    print("可能抓取到的节点格式损坏。")
    sys.exit(1)

proxies = data.get("proxies", [])
if not proxies:
    print("没有找到任何可用代理节点，退出。")
    sys.exit(0)

# 2. 生成 Mihomo 本地测速专用配置文件
mihomo_config = {
    "allow-lan": True,
    "bind-address": "*",
    "external-controller": "127.0.0.1:9090",
    "proxies": proxies
}
with open("mihomo_config.yaml", "w", encoding='utf-8') as f:
    yaml.dump(mihomo_config, f, allow_unicode=True)

# 3. 启动 Mihomo 内核
print("启动 Mihomo 进行测速...")
process = subprocess.Popen(["./mihomo", "-d", ".", "-f", "mihomo_config.yaml"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(3) # 给内核启动一点时间

valid_proxies = []

# 4. 利用 API 进行逐个真实测速
print("开始进行 generate_204 连通性测试...")
for p in proxies:
    name = p['name']
    encoded_name = urllib.parse.quote(name)
    # 测试目标: generate_204, 超时时间设定为 3000ms
    test_url = f"http://127.0.0.1:9090/proxies/{encoded_name}/delay?timeout=3000&url=https://www.gstatic.com/generate_204"
    
    try:
        res = requests.get(test_url, timeout=5)
        if res.status_code == 200 and "delay" in res.json():
            delay = res.json()['delay']
            if delay > 0:
                print(f"[✅ 保留] {name} - 延迟: {delay}ms")
                valid_proxies.append(p)
            else:
                print(f"[❌ 删除] {name} - 测速不通 (Delay 0)")
        else:
            print(f"[❌ 删除] {name} - 测速失败")
    except Exception as e:
        print(f"[❌ 删除] {name} - 请求超时或异常")

# 关闭 Mihomo 进程
process.terminate()

# 5. 生成最终的订阅文件 (包含你要求的 health-check 配置格式)
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
    
print(f"\n测速完成！初始节点 {len(proxies)} 个，保留有效节点 {len(valid_proxies)} 个。已保存至 final_sub.yaml")
