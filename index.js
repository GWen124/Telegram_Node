const fs = require('fs');

async function main() {
    // ==========================================
    // ⚙️ 配置区 (完全对标你的 Sub-Store 脚本数字)
    // ==========================================
    const SUB_LIMIT = 30;     
    const NODE_LIMIT = 50;   
    const FETCH_TIMEOUT = 4000; 
    const CHANNELS = [
        'https://t.me/s/freeVPNjd',     
        'https://t.me/s/freekankan',  
        'https://t.me/s/v2ray_free_vpn'
    ];

    console.log("🛠️ 正在执行全协议递归抓取...");

    // 1. 抓取网页源码
    const contents = await Promise.all(CHANNELS.map(async url => {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
            return await res.text();
        } catch (e) {
            console.log(`⚠️ 无法读取频道: ${url}`);
            return '';
        }
    }));

    let globalSubLinks = [];
    let globalNodeLinks = [];

    contents.forEach(html => {
        if (!html) return;
        let channelLinks = [];

        // 提取链接 (策略 A: href, 策略 B: 文本)
        const combinedRegex = /(https?|ss|ssr|vmess|vless|trojan|hysteria2|hy2):\/\/[^\s"<>]+/g;
        const matches = html.match(combinedRegex) || [];
        
        const ignoreRegex = /\/\/(t\.me|telegram\.org|google\.com|gstatic\.com|apple\.com|twitter\.com|facebook\.com)\//;
        const filtered = [...new Set(matches)].filter(l => !ignoreRegex.test(l));

        globalSubLinks.push(...filtered.filter(l => l.startsWith('http')).slice(-SUB_LIMIT));
        globalNodeLinks.push(...filtered.filter(l => !l.startsWith('http')).slice(-NODE_LIMIT));
    });

    const finalSubLinks = [...new Set(globalSubLinks)];
    const finalNodeLinks = [...new Set(globalNodeLinks)];
    console.log(`🔗 订阅链接: ${finalSubLinks.length} | 单节点: ${finalNodeLinks.length}`);

    // 2. 递归下载订阅内容
    let proxiesFromSub = [];
    for (const url of finalSubLinks) {
        try {
            const res = await fetch(url, { 
                headers: { 'user-agent': 'ClashMeta/1.18.0' }, 
                signal: AbortSignal.timeout(FETCH_TIMEOUT) 
            });
            const body = await res.text();
            let decoded = body;
            // 尝试 Base64 解码，如果不包含协议头则认为是加密的
            if (!body.includes('://')) {
                try { decoded = Buffer.from(body, 'base64').toString(); } catch(e) {}
            }
            const nodes = decoded.match(/(ss|ssr|vmess|vless|trojan|hysteria2|hy2):\/\/[^\s"<>|]+/g) || [];
            proxiesFromSub.push(...nodes);
        } catch (e) {}
    }

    // 3. 合并所有节点
    const allRawNodes = [...proxiesFromSub, ...finalNodeLinks];
    const uniqueRawNodes = [...new Set(allRawNodes)];

    // 4. 【核心】防止重名覆盖逻辑
    const nameMap = new Map();
    const finalResult = [];

    uniqueRawNodes.forEach(proxy => {
        try {
            if (proxy.startsWith('vmess://')) {
                let config = JSON.parse(Buffer.from(proxy.slice(8), 'base64').toString());
                let baseName = config.ps || "Unnamed_VMess";
                let count = (nameMap.get(baseName) || 0) + 1;
                nameMap.set(baseName, count);
                config.ps = count > 1 ? `${baseName} ${count}` : baseName;
                finalResult.push('vmess://' + Buffer.from(JSON.stringify(config)).toString('base64'));
            } else if (proxy.includes('#')) {
                // 处理 ss/ssr/vless/trojan/hy2 等带 # 备注的协议
                let parts = proxy.split('#');
                let baseUri = parts[0];
                let baseName = decodeURIComponent(parts[1] || "Unnamed_Node");
                let count = (nameMap.get(baseName) || 0) + 1;
                nameMap.set(baseName, count);
                let finalName = count > 1 ? `${baseName} ${count}` : baseName;
                finalResult.push(`${baseUri}#${encodeURIComponent(finalName)}`);
            } else {
                // 没有备注的节点直接存入
                finalResult.push(proxy);
            }
        } catch (e) {
            finalResult.push(proxy); // 解析失败则保留原样
        }
    });

    // 5. 导出 Base64 (全协议保留)
    fs.writeFileSync('sub.txt', Buffer.from(finalResult.join('\n')).toString('base64'));
    console.log(`✅ 处理完成！`);
    console.log(`📊 抓取总数: ${uniqueRawNodes.length}`);
    console.log(`💾 最终去重编号后总数: ${finalResult.length}`);
}

main();
