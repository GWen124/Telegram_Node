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
# 1. 结构安全过滤 & 全局精准去重
# ==========================================
proxies = []
seen_hashes = set()
seen_names = set() 

for p in raw_proxies:
    # --- 防内核崩溃装甲：拦截明显损坏的垃圾节点 ---
    try:
        if 'server' not in p or not p['server']: continue
        if 'port' not in p: continue
        port = int(p['port'])
        if not (1 <= port <= 65535): continue
        if p.get('type') in ['vless', 'vmess', 'trojan']:
            # 简单的长度校验，拦截残缺的 UUID 导致内核致命崩溃
            if 'uuid' in p and len(str(p['uuid'])) < 10: continue
            if 'password' in p and len(str(p['password'])) < 2: continue
    except:
        continue # 直接抛弃导致验证失败的节点
    # -----------------------------------------------

    p_config = {k: v for k, v in p.items() if k != 'name'}
    config_str = json.dumps(p_config, sort_keys=True)
    config_hash = hashlib.md5(config_str.encode('utf-8')).hexdigest()
    
    if config_hash not in seen_hashes:
        seen_hashes.add(config_hash)
        
        # 防重名机制，保证 YAML 配置合法
        original_name = str(p.get('name', 'Unnamed'))
        new_name = original_name
        counter = 1
        while new_name in seen_names:
            new_name = f"{original_name} {counter}"
            counter += 1
        seen_names.add(new_name)
        p['name'] = new_name
        
        proxies.append(p)

print(f"✅ 全局去重完毕: 抓取总计 {len(raw_proxies)} 个，安全过滤与去重后剩余 {len(proxies)} 个物理独立节点。")

mihomo_config = {
    "allow-lan": True,
    "bind-address": "*",
    "external-controller": "127.0.0.1:9090",
    "proxies": proxies
}
with open("mihomo_config.yaml", "w", encoding='utf-8') as f:
    yaml.dump(mihomo_config, f, allow_unicode=True)

# 启动 Mihomo 并捕获它的错误输出，精准定位崩溃元凶
with open("mihomo_error.log", "w") as err_file:
    process = subprocess.Popen(["./mihomo", "-d", ".", "-f", "mihomo_config.yaml"], stdout=subprocess.DEVNULL, stderr=err_file)

time.sleep(5) # 给几百个节点留出启动时间

# 检测内核是否已经崩溃闪退
if process.poll() is not None:
    with open("mihomo_error.log", "r") as err_file:
        error_msg = err_file.read()
    print(f"\n❌ 严重致命错误: 发现格式异常的野生节点，导致 Mihomo 内核启动崩溃！")
    print(f"================== 内核报错日志 ==================")
    print(error_msg)
    print(f"==================================================")
    sys.exit(1)

valid_proxies = []

# ==========================================
# 2. 测速机制
# ==========================================
MAX_DELAY = 2500 

def test_proxy(name, retries=2):
    encoded_name = urllib.parse.quote(name)
    test_url = f"http://127.0.0.1:9090/proxies/{encoded_name}/delay?timeout={MAX_DELAY}&url=https://www.gstatic.com/generate_204"
    
    for attempt in range(retries):
        try:
            res = requests.get(test_url, timeout=(MAX_DELAY/1000) + 1.5)
            if res.status_code == 200 and "delay" in res.json():
                delay = res.json()['delay']
                if delay > 0:
                    return delay
        except:
            pass
        if attempt < retries - 1:
            time.sleep(0.5)
            
    return 0

print(f"开始进行【双重验证】连通性测试 (限时 {MAX_DELAY}ms)...")
for p in proxies:
    original_name = p['name']
    delay = test_proxy(original_name)
    
    if 0 < delay <= MAX_DELAY:
        print(f"[✅ 保留] {original_name} - 延迟: {delay}ms")
        valid_proxies.append(p)
    elif delay > MAX_DELAY:
        print(f"[⚠️ 太慢剔除] {original_name} - 延迟: {delay}ms")
    else:
        print(f"[❌ 彻底死链] {original_name} - 测速超时或失效")

process.terminate()

# ==========================================
# 3. 智能归属地查询与重命名
# ==========================================
print("\n正在查询节点 IP 归属地并重新命名...")
country_counters = {}
ip_cache = {} 

def get_country(server):
    if server in ip_cache:
        return ip_cache[server]
    try:
        res = requests.get(f"http://ip-api.com/json/{server}?lang=zh-CN", timeout=3).json()
        if res.get('status') == 'success':
            country = res.get('country', '未知地区')
            country = country.replace("中国香港", "香港").replace("中国台湾", "台湾").replace("中国澳门", "澳门").replace("美利坚合众国", "美国")
            ip_cache[server] = country
            time.sleep(0.1) 
            return country
    except:
        pass
    ip_cache[server] = '未知地区'
    return '未知地区'

for p in valid_proxies:
    server = p.get('server', '')
    country = get_country(server)
    
    if country not in country_counters:
        country_counters[country] = 1
    else:
        country_counters[country] += 1
        
    new_name = f"{country} {country_counters[country]:02d}"
    p['name'] = new_name
    print(f"  🏷️  重命名: {server} -> {new_name}")

# ==========================================
# 4. 生成最终配置文件
# ==========================================
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
    
print(f"\n🎉 测速与归属地重命名完成！最终保留极品节点 {len(valid_proxies)} 个。")
