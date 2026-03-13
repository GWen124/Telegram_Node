import re
import requests
import base64
import hashlib

CHANNELS = [
    'https://t.me/s/proxygogogo',
    'https://t.me/s/freekankan',
    'https://t.me/s/freeVPNjd'
]

def get_nodes():
    nodes = []
    # 匹配各类协议
    raw_pattern = re.compile(r'(vmess|vless|ss|ssr|trojan|hysteria2)://[^\s\'"<>]+')
    # 匹配潜在的订阅链接
    sub_pattern = re.compile(r'https?://[^\s\'"<>]+')
    
    for url in CHANNELS:
        try:
            res = requests.get(url, timeout=10).text
            
            # 1. 抓取明文节点
            for m in raw_pattern.finditer(res):
                nodes.append(m.group(0))
                
            # 2. 抓取订阅链接并尝试解析 Base64
            for m in sub_pattern.finditer(res):
                sub_url = m.group(0)
                if "t.me" in sub_url: continue # 跳过频道本身的链接
                try:
                    sub_res = requests.get(sub_url, timeout=5).text
                    decoded = base64.b64decode(sub_res).decode('utf-8')
                    for rm in raw_pattern.finditer(decoded):
                        nodes.append(rm.group(0))
                except:
                    pass # 非 Base64 订阅或解析失败则跳过
        except Exception as e:
            print(f"Fetch error {url}: {e}")
            
    return nodes

def process_nodes(nodes):
    unique_configs = {} # md5(配置) -> 完整节点
    name_count = {}     # 名称 -> 出现次数
    final_nodes = []

    for node in nodes:
        # 切割节点：前面是配置，后面是名称 (兼容带 # 的情况)
        parts = node.split('#')
        config_part = parts[0]
        original_name = parts[1] if len(parts) > 1 else "Unnamed"
        
        # 1. 去重：只看配置部分的 MD5
        config_hash = hashlib.md5(config_part.encode()).hexdigest()
        if config_hash in unique_configs:
            continue
        unique_configs[config_hash] = node

        # 2. 重命名：处理名称重复
        if original_name in name_count:
            name_count[original_name] += 1
            new_name = f"{original_name}_{name_count[original_name]:02d}"
        else:
            name_count[original_name] = 1
            new_name = original_name
        
        # 重新组合节点
        final_nodes.append(f"{config_part}#{new_name}")
    
    return final_nodes

if __name__ == "__main__":
    nodes = get_nodes()
    processed = process_nodes(nodes)
    with open("raw_nodes.txt", "w", encoding='utf-8') as f:
        f.write("\n".join(processed))
    print(f"抓取并处理完毕，共保留 {len(processed)} 个独立节点。")
