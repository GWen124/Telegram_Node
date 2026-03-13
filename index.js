const fs = require('fs');
const net = require('net');

// ⚙️ 自定义配置
const CHANNELS = [
    'https://t.me/s/freeVPNjd',     
    'https://t.me/s/freekankan',  
    'https://t.me/s/v2ray_free_vpn'
];
const SUB_LIMIT = 5;      // 每个频道取几个订阅链接
const NODE_LIMIT = 10;    // 每个频道取几个单节点
const TCP_TIMEOUT = 2500; // TCP 测速超时时间 (毫秒)，越短过滤越严格

// TCP 连通性测试函数
function pingTcp(host, port) {
    return new Promise((resolve) => {
        if (!host || !port) return resolve(false);
        const socket = new net.Socket();
        socket.setTimeout(TCP_TIMEOUT);
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
        socket.on('error', () => { socket.destroy(); resolve(false); });
        socket.connect(port, host);
    });
}

// 粗略解析节点提取 IP 和 Port
function extractHostPort(uri) {
    try {
        if (uri.startsWith('vmess://')) {
            const json = JSON.parse(Buffer.from(uri.slice(8), 'base64').toString('utf8'));
            return { host: json.add, port: parseInt(json.port) };
        }
        // ss, trojan, vless 格式通常包含 @host:port
        const match = uri.match(/@([^:]+):(\d+)/);
        if (match) return { host: match[1], port: parseInt(match[2]) };
    } catch (e) {}
    return null;
}

// 解码 Base64 订阅内容为单节点数组
function decodeSub(body) {
    try {
        const decoded = Buffer.from(body, 'base64').toString('utf8');
        return decoded.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    } catch (e) {
        // 如果不是 Base64，当做明文处理
        return body.split('\n').map(l => l.trim()).filter(l => l.includes('://'));
    }
}

async function main() {
    let globalSubLinks = [];
    let globalNodeLinks = [];

    console.log('🚀 开始从 Telegram 抓取链接...');
    for (const url of CHANNELS) {
        try {
            const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
            const html = await res.text();
            
            let links = [];
            // 抓超链接
            const hrefRegex = /href=["'](https?:\/\/[^"']+)["']/g;
            let hMatch; while ((hMatch = hrefRegex.exec(html))) links.push(hMatch[1]);
            
            // 抓文本
            const cleanText = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&');
            const wideRegex = /(https?|ss|ssr|vmess|vless|trojan|hysteria2|hy2):\/\/[^\s"<>]+/g;
            let wMatch; while ((wMatch = wideRegex.exec(cleanText))) {
                links.push(wMatch[0].replace(/[.,!?;）)]+$/, ''));
            }

            const unique = [...new Set(links)].filter(l => !/\/\/(t\.me|telegram\.org)\//.test(l));
            globalSubLinks.push(...unique.filter(l => l.startsWith('http')).slice(-SUB_LIMIT));
            globalNodeLinks.push(...unique.filter(l => !l.startsWith('http')).slice(-NODE_LIMIT));
        } catch (e) { console.log(`频道 ${url} 抓取失败`); }
    }

    const finalSubLinks = [...new Set(globalSubLinks)];
    console.log(`📦 发现 ${finalSubLinks.length} 个订阅链接，开始下载...`);

    let rawNodes = [...new Set(globalNodeLinks)];
    for (const sub of finalSubLinks) {
        try {
            const res = await fetch(sub, { headers: { 'user-agent': 'ClashMeta/1.18.0' } });
            const body = await res.text();
            rawNodes.push(...decodeSub(body));
        } catch (e) {}
    }

    // 去重并排除 Surge 不支持的协议
    rawNodes = [...new Set(rawNodes)].filter(n => !n.startsWith('vless://') && !n.startsWith('ssr://'));
    console.log(`🔍 聚合完成，开始进行 TCP 并发测速 (共 ${rawNodes.length} 个节点)...`);

    // 并发测速剔除死节点
    const aliveNodes = [];
    const testPromises = rawNodes.map(async (uri) => {
        const target = extractHostPort(uri);
        if (!target) {
            aliveNodes.push(uri); // 无法解析的直接放行
            return;
        }
        const isAlive = await pingTcp(target.host, target.port);
        if (isAlive) aliveNodes.push(uri);
    });

    await Promise.all(testPromises);

    console.log(`✅ 测速完毕！存活节点：${aliveNodes.length} 个。正在生成订阅文件...`);
    
    // 生成 Surge 兼容的 Base64 订阅
    const finalBase64 = Buffer.from(aliveNodes.join('\n')).toString('base64');
    fs.writeFileSync('sub.txt', finalBase64);
    console.log('🎉 成功生成 sub.txt 文件！');
}

main();
