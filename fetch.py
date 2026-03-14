import re
import requests
import base64
import urllib.parse
import json
import hashlib
import yaml
from datetime import datetime, timedelta, timezone

# ==========================================
# 1. 订阅源配置
# ==========================================
CHANNELS = [
    'https://t.me/s/proxygogogo',
    'https://t.me/s/freekankan',
    'https://t.me/s/freeVPNjd'
]

# 这里的列表会被脚本自动修改！
EXTERNAL_URLS = [
    "https://raw.githubusercontent.com/ovmvo/FreeSub/refs/heads/main/sub/permanent/mihomo.yaml",
    "https://raw.githubusercontent.com/clashv2ray-hub/v2rayfree/refs/heads/main/v2ray.txt",
    "https://raw.githubusercontent.com/shaoyouvip/free/refs/heads/main/all.yaml",
    "https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub"
]

DYNAMIC_REPOS = [
    "free-nodes/v2rayfree", 
    "free-nodes/clashfree"
]

# ==========================================
# 2. 核心探测与统计函数
# ==========================================
def count_nodes_in_text(text, is_yaml=False):
    try:
        if is_yaml:
            data = yaml.safe_load(text)
            if isinstance(data, dict) and 'proxies' in data:
                return len(data['proxies'])
        else:
            try:
                dec = base64.b64decode(text).decode('utf-8', errors='ignore')
                return len(re.findall(r'(vmess|vless|ss|ssr|trojan|hysteria2)://', dec))
            except:
                return len(re.findall(r'(vmess|vless|ss|ssr|trojan|hysteria2)://', text))
    except:
        pass
    return 0

def get_and_heal_tg_nodes():
    print("\n" + "="*50)
    print("📡 阶段 1: 抓取 Telegram 频道野生节点")
    print("="*50)
    raw_nodes = []
    raw_pattern = re.compile(r'(vmess|vless|ss|ssr|trojan|hysteria2)://[^\s\'"<>]+')
    sub_pattern = re.compile(r'https?://[^\s\'"<>]+')
    
    for url in CHANNELS:
        try:
            res = requests.get(url, timeout=10).text
            channel_count = 0
            for m in raw_pattern.finditer(res):
                raw_nodes.append(m.group(0))
                channel_count += 1
            for m in sub_pattern.finditer(res):
                sub_url = m.group(0)
                if "t.me" in sub_url: continue 
                try:
                    sub_res = requests.get(sub_url, timeout=5).text
                    decoded = base64.b64decode(sub_res).decode('utf-8', errors='ignore')
                    for rm in raw_pattern.finditer(decoded):
                        raw_nodes.append(rm.group(0))
                        channel_count += 1
                except: pass 
            print(f"  [✅ 成功] 获取 {channel_count:3} 个节点 <- {url}")
        except Exception as e:
            print(f"  [❌ 失败] 无法访问 <- {url}")

    clean_nodes = []
    seen_configs = set()
    for node in raw_nodes:
        try:
            if node.startswith("vmess://"):
                b64_str = node[8:].split('#')[0] 
                b64_str += "=" * ((4 - len(b64_str) % 4) % 4)
                v_json = json.loads(base64.b64decode(b64_str).decode('utf-8'))
                v_config = {k: v for k, v in v_json.items() if k != 'ps'}
                config_hash = hashlib.md5(str(v_config).encode()).hexdigest()
                if config_hash in seen_configs: continue
                seen_configs.add(config_hash)
                clean_node = "vmess://" + base64.b64encode(json.dumps(v_json, separators=(',', ':')).encode('utf-8')).decode('utf-8')
                clean_nodes.append(clean_node)
            else:
                parts = node.split('#', 1)
                config_part = parts[0]
                config_hash = hashlib.md5(config_part.encode()).hexdigest()
                if config_hash in seen_configs: continue
                seen_configs.add(config_hash)
                if len(parts) > 1:
                    safe_name = urllib.parse.quote(urllib.parse.unquote(parts[1]))
                    clean_nodes.append(f"{config_part}#{safe_name}")
                else:
                    clean_nodes.append(config_part)
        except: continue
        
    print(f"  --> 净化与初步去重后，TG 频道共保留 {len(clean_nodes)} 个有效节点。")
    return clean_nodes

def remove_dead_links_from_code(valid_urls):
    """读取自身源码，替换 EXTERNAL_URLS 列表，实现自我进化"""
    try:
        with open(__file__, 'r', encoding='utf-8') as f:
            content = f.read()

        # 生成新的代码块
        if not valid_urls:
            new_list_str = "EXTERNAL_URLS = [
    "https://raw.githubusercontent.com/ovmvo/FreeSub/refs/heads/main/sub/permanent/mihomo.yaml",
    "https://raw.githubusercontent.com/clashv2ray-hub/v2rayfree/refs/heads/main/v2ray.txt",
    "https://raw.githubusercontent.com/shaoyouvip/free/refs/heads/main/all.yaml",
    "https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub"
]"
        else:
            new_list_str = "EXTERNAL_URLS = [
    "https://raw.githubusercontent.com/ovmvo/FreeSub/refs/heads/main/sub/permanent/mihomo.yaml",
    "https://raw.githubusercontent.com/clashv2ray-hub/v2rayfree/refs/heads/main/v2ray.txt",
    "https://raw.githubusercontent.com/shaoyouvip/free/refs/heads/main/all.yaml",
    "https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub"
]"

        # 使用正则替换掉旧的列表
        new_content = re.sub(r'EXTERNAL_URLS\s*=\s*\[.*?\]', new_list_str, content, flags=re.DOTALL)

        if new_content != content:
            with open(__file__, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print("\n  [♻️ 源码净化] 脚本已自我修改，永久删除了失效的链接！")
    except Exception as e:
        print(f"\n  [⚠️ 源码净化失败] {e}")

def check_external_links():
    print("\n" + "="*50)
    print("🔗 阶段 2: 探测固定外部订阅源 (含自动清理死链)")
    print("="*50)
    valid_urls = []
    dead_urls = []
    
    for url in EXTERNAL_URLS:
        is_yaml = url.endswith('.yaml') or url.endswith('.yml')
        try:
            res = requests.get(url, timeout=10)
            if res.status_code == 200:
                count = count_nodes_in_text(res.text, is_yaml)
                if count > 0:
                    print(f"  [✅ 存活] 发现 {count:3} 个节点 <- {url}")
                    valid_urls.append(url)
                else:
                    print(f"  [⚠️ 空链] 未发现节点 <- {url} (标记为死链)")
                    dead_urls.append(url)
            else:
                print(f"  [❌ 报错] HTTP {res.status_code} <- {url} (标记为死链)")
                dead_urls.append(url)
        except Exception as e:
            print(f"  [❌ 超时] 无法连接 <- {url} (标记为死链)")
            dead_urls.append(url)

    # 如果发现了死链，触发自我净化
    if dead_urls:
        remove_dead_links_from_code(valid_urls)
            
    return valid_urls

def get_dynamic_links():
    print("\n" + "="*50)
    print("📅 阶段 3: 智能嗅探日期动态仓库 (${datePath})")
    print("="*50)
    dynamic_urls = []
    tz = timezone(timedelta(hours=8)) 
    today = datetime.now(tz)
    yesterday = today - timedelta(days=1)
    found_repos = set()
    
    for date_obj in [today, yesterday]:
        date_path = date_obj.strftime("%Y/%m/%Y%m%d")
        for repo in DYNAMIC_REPOS:
            if repo in found_repos: continue 
            
            possible_paths = [
                f"node_list/{date_path}.yaml",
                f"node_list/{date_path}.txt",
                f"{date_path}.yaml",
                f"{date_path}.txt"
            ]
            for path in possible_paths:
                test_url = f"https://raw.githubusercontent.com/{repo}/main/{path}"
                try:
                    res = requests.get(test_url, timeout=5)
                    if res.status_code == 200:
                        is_yaml = test_url.endswith('.yaml')
                        count = count_nodes_in_text(res.text, is_yaml)
                        if count > 0:
                            print(f"  [✅ 命中] 发现 {count:3} 个节点 <- {test_url}")
                            dynamic_urls.append(test_url)
                            found_repos.add(repo)
                            break 
                except: pass
                
    return dynamic_urls

if __name__ == "__main__":
    tg_nodes = get_and_heal_tg_nodes()
    valid_external_urls = check_external_links()
    dynamic_urls = get_dynamic_links()
    
    print("\n" + "="*50)
    print("🚀 阶段 4: 资源聚合与下发")
    print("="*50)
    
    if tg_nodes:
        final_string = "\n".join(tg_nodes)
        b64_content = base64.b64encode(final_string.encode('utf-8')).decode('utf-8')
        with open("tg_nodes.txt", "w", encoding='utf-8') as f:
            f.write(b64_content)
    else:
        with open("tg_nodes.txt", "w") as f: f.write("")
    
    all_urls = ["http://127.0.0.1:8000/tg_nodes.txt"] + valid_external_urls + dynamic_urls
    encoded_url = urllib.parse.quote("|".join(all_urls))
    sub_api = f"http://127.0.0.1:25500/sub?target=clash&url={encoded_url}&insert=false"
    
    with open("sub_api_url.txt", "w") as f:
        f.write(sub_api)
        
    print(f"  --> 剔除死链后，最终下发给 Subconverter 的有效订阅入口: {len(all_urls)} 个。")
    print("  --> 等待 check.py 进行全局底层去重与极速测速...\n")
