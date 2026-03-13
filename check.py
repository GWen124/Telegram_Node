import yaml
import requests
import subprocess
import time
import urllib.parse

# 1. 读取转换后的节点文件
with open("clash_nodes.yaml", "r", encoding='utf-8') as f:
    data = yaml.safe_load(f)

proxies = data.get("proxies", [])
if not proxies:
    print("没有找到节点，退出。")
    exit(0)

# 2. 生成 Mihomo 测速专用配置文件
mihomo_config = {
    "allow-lan": True,
    "bind-address": "*",
    "external-controller": "127.0.0.1:9090",
    "proxies": proxies
}
with open("mihomo_config.yaml", "w", encoding='utf-8') as f:
    yaml.dump(mihomo_config, f, allow_unicode=True)

# 3. 启动 Mihomo 核心
print("启动 Mihomo 进行测速...")
process = subprocess.Popen(["./mihomo", "-d", ".", "-f", "mihomo_config.yaml"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(3) # 等待内核启动完毕

valid_proxies = []

# 4. 利用 API 进行逐个测速 (相当于手动触发 health-check)
print("开始进行 204 连通性测试...")
for p in proxies:
    name = p['name']
    encoded_name = urllib.parse.quote(name)
    # 你要求的测速方案：测试 generate_204
    test_url = f"http://127.0.0.1:9090/proxies/{encoded_name}/delay?timeout=3000&url=https://www.gstatic.com/generate_204"
    
    try:
        res = requests.get(test_url, timeout=5)
        if res.status_code == 200 and "delay" in res.json():
            delay = res.json()['delay']
            if delay > 0:
                print(f"[保留] {name} - 延迟: {delay}ms")
                valid_proxies.append(p)
            else:
                print(f"[删除] {name} - 测速不通 (Delay 0)")
        else:
            print(f"[删除] {name} - 测速失败")
    except Exception as e:
        print(f"[删除] {name} - 请求超时或异常")

# 关闭 Mihomo
process.terminate()

# 5. 输出最终结果，并为你加上 p: &p 的锚点格式（供后续使用）
final_output = {
    "proxies": valid_proxies,
    # 模拟你要求的锚点输出格式，方便你直接导入其他客户端
    "proxy-groups": [
        {
            "name": "Auto-Test",
            "type": "url-test",
            "proxies": [p['name'] for p in valid_proxies],
            "url": "https://www.gstatic.com/generate_204",
            "interval": 3600
        }
    ]
}

with open("final_sub.yaml", "w", encoding='utf-8') as f:
    yaml.dump(final_output, f, allow_unicode=True, sort_keys=False)
    
print(f"测速完成！初始节点 {len(proxies)} 个，保留有效节点 {len(valid_proxies)} 个。")
