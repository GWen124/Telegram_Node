const fs = require('fs');

async function main() {
    const SUB_LIMIT = 50;     
    const NODE_LIMIT = 100;   
    const FETCH_TIMEOUT = 5000; // 稍微增加超时，给订阅下载留空间
    const CHANNELS = [
        'https://t.me/s/freeVPNjd',     
        'https://t.me/s/freekankan',  
        'https://t.me/s/v2ray_free_vpn',
        'https://t.me/s/Clash_VPNS',  // 额外加两个源
        'https://t.me/s/v2ray_nodes'
    ];

    console.log("🛠️ 正在执行增强型递归抓取 (GitHub 适配版)...");

    // 1. 获取网页源码
    const contents = await Promise.all(CHANNELS.map(async url => {
        try {
            const res = await fetch(url, { 
                headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                signal: AbortSignal.timeout(FETCH_TIMEOUT) 
            });
            return await res.text();
        } catch (e) { return ''; }
    }));

    let globalSubLinks = [];
    let globalNodeLinks = [];

    contents.forEach(html => {
        if (!html) return;
        // 匹配所有可能的节点和链接
        const wideRegex = /(https?|ss|ssr|vmess|vless|trojan|hysteria2|hy2):\/\/[^\s"<>|]+/g;
        const matches = html.match(wideRegex) || [];
        
        const ignoreRegex = /\/\/(t\.me|telegram\.org|google\.com|gstatic\.com|apple\.com|twitter\.com|facebook\.com)\//;
        const filtered = [...new Set(matches)].filter(l => !ignoreRegex.test(l));

        globalSubLinks.push(...filtered.filter(l => l.startsWith('http')).slice(-SUB_LIMIT));
        globalNodeLinks.push(...filtered.filter(l => !l.startsWith('http')).slice(-NODE_LIMIT));
    });

    const finalSubLinks = [...new Set(globalSubLinks)];
    const finalNodeLinks = [...new Set(globalNodeLinks)];
    console.log(`📡 频道解析完毕。发现订阅源: ${finalSubLinks.length} 个, 原始单节点: ${finalNodeLinks.length} 个`);

    // 2. 递归下载订阅内容
    let proxiesFromSub = [];
    for (const url of finalSubLinks) {
        try {
            // 关键：伪装成 Clash 或 Surge，防止被屏蔽
            const res = await fetch(url, { 
                headers: { 'user-agent': 'ClashMeta/1.18.0' }, 
                signal: AbortSignal.timeout(FETCH_TIMEOUT) 
            });
            if (!res.ok) continue;

            const body = await res.text();
            let decoded = body;
            
            // 自动判断是否需要 Base64 解码
            if (!body.includes('://')) {
                try {
                    const temp = Buffer.from(body, 'base64').toString('utf8');
                    if (temp.includes('://')) decoded = temp;
                } catch(e) {}
            }

            const nodes = decoded.match(/(ss|ssr|vmess|vless|trojan|hysteria2|hy2):\/\/[^\s"<>|]+/g) || [];
            if (nodes.length > 0) {
                console.log(`✅ 成功从 [${url.substring(0, 30)}...] 获取 ${nodes.length} 个节点`);
                proxiesFromSub.push(...nodes);
            }
        } catch (e) {
            // 即使失败也不报错，继续下一个
        }
    }

    // 3. 合并所有节点并去重
    const allRawNodes = [...new Set([...proxiesFromSub, ...finalNodeLinks])];
    
    // 4. 防止重名覆盖逻辑
    const nameMap = new Map();
    const finalResult = [];

    allRawNodes.forEach(proxy => {
        try {
            if (proxy.startsWith('vmess://')) {
                let config = JSON.parse(Buffer.from(proxy.slice(8), 'base64').toString());
                let baseName = config.ps || "VMess_Node";
                let count = (nameMap.get(baseName) || 0) + 1;
                nameMap.set(baseName, count);
                config.ps = count > 1 ? `${baseName} ${count}` : baseName;
                finalResult.push('vmess://' + Buffer.from(JSON.stringify(config)).toString('base64'));
            } else if (proxy.includes('#')) {
                let parts = proxy.split('#');
                let baseUri = parts[0];
                let baseName = decodeURIComponent(parts[1] || "Node");
                let count = (nameMap.get(baseName) || 0) + 1;
                nameMap.set(baseName, count);
                let finalName = count > 1 ? `${baseName} ${count}` : baseName;
                finalResult.push(`${baseUri}#${encodeURIComponent(finalName)}`);
            } else {
                finalResult.push(proxy);
            }
        } catch (e) {
            finalResult.push(proxy);
        }
    });

    // 5. 写入并输出
    fs.writeFileSync('sub.txt', Buffer.from(finalResult.join('\n')).toString('base64'));
    console.log(`\n🎉 处理完成！`);
    console.log(`📊 最终 sub.txt 包含节点数: ${finalResult.length}`);
}

main();
