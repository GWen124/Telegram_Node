import re
import requests
import base64
import hashlib

# 目标频道
CHANNELS = [
    'https://t.me/s/proxygogogo',
    'https://t.me/s/freekankan',
    'https://t.me/s/freeVPNjd'
]

def get_nodes():
    raw_nodes = []
    # 匹配 vmess, vless, ss, trojan, hysteria2 等协议
    pattern = re.compile(r'(vmess|vless|ss|ssr|trojan|hysteria2)://[^\s<"]+')
    
    for url in CHANNELS:
        try:
            res = requests.get(url, timeout=10)
            matches = pattern.findall(res.text)
            # 获取完整链接
            for m in pattern.finditer(res.text):
                raw_nodes.append(m.group(0))
        except Exception as e:
            print(f"Error fetching {url}: {e}")
    
    return raw_nodes

def process_nodes(nodes):
    unique_configs = {} # md5(config) -> node_url
    name_count = {}     # name -> count
    final_nodes = []

    for node in nodes:
        # 1. 去重逻辑：去除名称(备注)部分后对比配置
        # 简单的做法是去除 URL 中 '#' 之后的部分作为配置指纹
        config_part = node.split('#')[0]
        config_hash = hashlib.md5(config_part.encode()).hexdigest()
        
        if config_hash in unique_configs:
            continue
        unique_configs[config_hash] = node

        # 2. 重命名逻辑
        parts = node.split('#')
        original_name = parts[1] if len(parts) > 1 else "Unnamed"
        
        if original_name in name_count:
            name_count[original_name] += 1
            new_name = f"{original_name}_{name_count[original_name]}"
        else:
            name_count[original_name] = 1
            new_name = original_name
        
        final_nodes.append(f"{config_part}#{new_name}")
    
    return final_nodes

if __name__ == "__main__":
    nodes = get_nodes()
    processed = process_nodes(nodes)
    with open("raw_nodes.txt", "w") as f:
        f.write("\n".join(processed))
