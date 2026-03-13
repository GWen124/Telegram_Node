const fs = require('fs');

// 增强版请求函数：模拟真实客户端，增加超时保护
async function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'User-Agent': 'v2rayN/6.39', // 模拟常用客户端 UA
                'Accept': '*/*',
                ...options.headers
            }
        });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        return null;
    }
}

async function main() {
    // 1. 定义极其稳定的静态源 + 动态频道
    const STATIC_SOURCES = [
        'https://raw.githubusercontent.com/freefq/free/master/v2',
        'https://raw.githubusercontent.com/aiboboxx/v2rayfree/main/v2',
        'https://raw.githubusercontent.com/vless-js/vless-js.github.io/main/v2ray.txt'
    ];
    
    const TELEGRAM_CHANNELS = [
        'https://t.me/s/freeVPNjd',
        'https://t.me/s/v2ray_free_vpn',
        'https://t.me/s/freekankan'
    ];

    console.log("🚀 WARP 环境已打通，开始深度抓取...");
    let allRawNodes = [];

    // 2. 处理静态源（这些通常是 Base64 编码的大池子）
    console.log("📡 正在从静态大池子获取节点...");
    for (const url of STATIC_SOURCES) {
        const res = await fetchWithTimeout(url);
        if (res && res.ok) {
            const text = await res.text();
            let decoded = text;
            try {
                // 尝试解码 Base64
                if (!text.includes('://')) {
                    decoded = Buffer.from(text, 'base64').toString();
                }
            } catch(e) {}
            const nodes = decoded.match(/(ss|ssr|vmess|vless|trojan|hysteria2|hy2):\/\/[^\s"<>|]+/g) || [];
            allRawNodes.push(...nodes);
            console.log(`✅ 静态源 [${url.substring(0, 30)}...] 贡献了 ${nodes.length} 个节点`);
        }
    }

    // 3. 处理 Telegram 动态频道
    console.log("📡 正在解析 Telegram 频道...");
    for (const url of TELEGRAM_CHANNELS) {
        const res = await fetchWithTimeout(url);
        if (res && res.ok) {
            const html = await res.text();
            // 提取所有链接，排除掉电报自身的链接
            const wideRegex = /(https?|ss|ssr|vmess|vless|trojan|hysteria2|hy2):\/\/[^\s"<>|]+(?<!\.)/g;
            const matches = html.match(wideRegex) || [];
            const nodes = matches.filter(l => !l.includes('t.me') && !l.includes('telegram.org'));
            
            // 如果提取到的是 http/https，说明是订阅地址，进一步抓取
            for (const item of nodes) {
                if (item.startsWith('http')) {
                    const subRes = await fetchWithTimeout(item);
                    if (subRes && subRes.ok) {
                        const subText = await subRes.text();
                        const subNodes = subText.match(/(ss|ssr|vmess|vless|trojan|hysteria2|hy2):\/\/[^\s"<>|]+/g) || [];
                        allRawNodes.push(...subNodes);
                    }
                } else {
                    allRawNodes.push(item);
                }
            }
            console.log(`✅ 频道 [${url.split('/').pop()}] 解析完成`);
        }
    }

    // 4. 去重、清洗
    const finalNodes = [...new Set(allRawNodes)]
        .map(n => n.trim())
        .filter(n => n.includes('://'));

    if (finalNodes.length === 0) {
        console.log("⚠️ 未能抓取到任何有效节点。");
        return;
    }

    // 5. 写入文件（Base64 格式，方便直接导入客户端）
    const output = Buffer.from(finalNodes.join('\n')).toString('base64');
    fs.writeFileSync('sub.txt', output);

    console.log(`\n🎉 任务圆满完成！`);
    console.log(`--------------------------------`);
    console.log(`📊 原始抓取总数: ${allRawNodes.length}`);
    console.log(`✨ 去重后有效数: ${finalNodes.length}`);
    console.log(`💾 结果已保存至 sub.txt`);
    console.log(`--------------------------------`);
}

main();
