const fs = require('fs');
const net = require('net');

// ==========================================
// ⚙️ 1. 抓取与测速配置
// ==========================================
const CHANNELS = [
    'https://t.me/s/freeVPNjd',     
    'https://t.me/s/freekankan',  
    'https://t.me/s/v2ray_free_vpn'
];
const SUB_LIMIT = 30;      // 抓取订阅数量
const NODE_LIMIT = 50;     // 抓取节点数量
const TCP_TIMEOUT = 2500;  // 2.5秒测速标准
const CONCURRENCY_LIMIT = 200; // 并发控制防崩溃
const RENAME_PREFIX = "Telegram｜"; // 你的自定义前缀

// ==========================================
// 🛠️ 2. 你的专业级字典与规则
// ==========================================
const TAG_SEP = "｜";
const tagDict = {
    "Zx": "专线", "专线": "专线", "IPLC": "IPLC", "IEPL": "IEPL", "Fam": "家宽", "家宽": "家宽", 
    "直连": "直连", "Direct": "直连", "中继": "中转", "Relay": "中转", "Transit": "中转", "中转": "中转", 
    "深移": "中转", "广移": "中转", "沪日": "中转", "杭日": "中转", "动态": "动态", 
    "IPV6": "IPv6", "IPv6": "IPv6", "流媒体": "流媒体", "Netflix": "Netflix", "Disney": "Disney", 
    "chatGPT": "OpenAI", "OpenAI": "OpenAI", "BGP": "BGP", "CN2": "CN2", "GIA": "GIA", "CMI": "CMI", 
    "CMIN": "CMIN", "AIG": "AIG", "PCCW": "PCCW", "HKT": "HKT", "EIP": "EIP" 
};
const sortedTagKeys = Object.keys(tagDict).sort((a, b) => b.length - a.length);

const countryMap = [
    { keys: /香港|港|HK|Hong\s*Kong/i, flag: '🇭🇰', name: '香港' },
    { keys: /台湾|台|TW|Tai\s*wan|新北/i, flag: '🇨🇳', name: '台湾' }, 
    { keys: /澳门|澳|MO|Macau|Macao/i, flag: '🇲🇴', name: '澳门' },
    { keys: /日本|日|JP|Japan|Tokyo|Osaka/i, flag: '🇯🇵', name: '日本' },
    { keys: /韩国|韩|KR|Korea|Seoul|春川/i, flag: '🇰🇷', name: '韩国' },
    { keys: /新加坡|新|SG|Singapore|狮城/i, flag: '🇸🇬', name: '新加坡' },
    { keys: /美国|美|US|America|United\s*States|洛杉矶|硅谷|西雅图/i, flag: '🇺🇸', name: '美国' },
    { keys: /英国|英|GB|UK|London|England/i, flag: '🇬🇧', name: '英国' },
    { keys: /德国|德|DE|Germany|法兰克福/i, flag: '🇩🇪', name: '德国' },
    { keys: /法国|法|FR|France|巴黎/i, flag: '🇫🇷', name: '法国' },
    { keys: /加拿大|加|CA|Canada/i, flag: '🇨🇦', name: '加拿大' },
    { keys: /澳洲|澳大利亚|澳|AU|Australia|悉尼/i, flag: '🇦🇺', name: '澳洲' },
    { keys: /俄罗斯|俄|RU|Russia|莫斯科/i, flag: '🇷🇺', name: '俄罗斯' },
    { keys: /印度|印|IN|India|孟买/i, flag: '🇮🇳', name: '印度' },
    { keys: /泰国|泰|TH|Thailand|曼谷/i, flag: '🇹🇭', name: '泰国' },
    { keys: /马来西亚|马|MY|Malaysia/i, flag: '🇲🇾', name: '马来西亚' },
    { keys: /土耳其|土|TR|Turkey/i, flag: '🇹🇷', name: '土耳其' },
    { keys: /越南|越|VN|Vietnam/i, flag: '🇻🇳', name: '越南' },
    { keys: /印尼|ID|Indonesia|雅加达/i, flag: '🇮🇩', name: '印尼' },
    { keys: /菲律宾|菲|PH|Philippines/i, flag: '🇵🇭', name: '菲律宾' },
    { keys: /中国|中|CN|China|北京|上海|广州|深圳/i, flag: '🇨🇳', name: '中国' }
];

const sortOrder = [
    '香港', '台湾', '澳门', '日本', '韩国', '新加坡', '美国', '英国', '德国', '法国', 
    '加拿大', '澳洲', '俄罗斯', '印度', '泰国', '马来西亚', '土耳其', '越南', '印尼', '菲律宾', 
    '中国', '未知'
];

// ==========================================
// 🔌 3. 底层解析与测速工具
// ==========================================
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

// 把 URI 拆解成包含 name 和 server 的对象
function parseNode(uri) {
    let name = "Unknown";
    let server = "";
    let port = 0;
    try {
        if (uri.startsWith('vmess://')) {
            const str = Buffer.from(uri.slice(8), 'base64').toString('utf8');
            const json = JSON.parse(str);
            name = json.ps || "Unknown";
            server = json.add || "";
            port = parseInt(json.port);
        } else {
            const match = uri.match(/@([^:]+):(\d+)/);
            if (match) { server = match[1]; port = parseInt(match[2]); }
            const parts = uri.split('#');
            if (parts.length > 1) name = decodeURIComponent(parts[1]);
        }
    } catch (e) {}
    return { uri, name, server, port, tags: [], multi: "", cFlag: '🏴', cName: '未知' };
}

// 把改好名字的对象重新塞回 URI
function repackageUri(node) {
    try {
        if (node.uri.startsWith('vmess://')) {
            const str = Buffer.from(node.uri.slice(8), 'base64').toString('utf8');
            const json = JSON.parse(str);
            json.ps = node.name; // 注入新名字
            return 'vmess://' + Buffer.from(JSON.stringify(json)).toString('base64');
        } else {
            const parts = node.uri.split('#');
            return parts[0] + '#' + encodeURIComponent(node.name);
        }
    } catch (e) { return node.uri; }
}

function decodeSub(body) {
    try {
        const decoded = Buffer.from(body, 'base64').toString('utf8');
        return decoded.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    } catch (e) { return body.split('\n').map(l => l.trim()).filter(l => l.includes('://')); }
}

// ==========================================
// 🚀 4. 主程序流程
// ==========================================
async function main() {
    let globalSubLinks = [];
    let globalNodeLinks = [];

    console.log('🚀 开始从 Telegram 抓取链接...');
    for (const url of CHANNELS) {
        try {
            const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
            const html = await res.text();
            
            let links = [];
            const hrefRegex = /href=["'](https?:\/\/[^"']+)["']/g;
            let hMatch; while ((hMatch = hrefRegex.exec(html))) links.push(hMatch[1]);
            
            const cleanText = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&');
            const wideRegex = /(https?|ss|ssr|vmess|vless|trojan|hysteria2|hy2):\/\/[^\s"<>]+/g;
            let wMatch; while ((wMatch = wideRegex.exec(cleanText))) links.push(wMatch[0].replace(/[.,!?;）)]+$/, ''));

            const unique = [...new Set(links)].filter(l => !/\/\/(t\.me|telegram\.org)\//.test(l));
            globalSubLinks.push(...unique.filter(l => l.startsWith('http')).slice(-SUB_LIMIT));
            globalNodeLinks.push(...unique.filter(l => !l.startsWith('http')).slice(-NODE_LIMIT));
        } catch (e) {}
    }

    const finalSubLinks = [...new Set(globalSubLinks)];
    console.log(`📦 发现 ${finalSubLinks.length} 个订阅链接，开始并发获取节点...`);

    let rawUris = [...new Set(globalNodeLinks)];
    const fetchSubs = finalSubLinks.map(async (sub) => {
        try {
            const res = await fetch(sub, { headers: { 'user-agent': 'ClashMeta/1.18.0' }, signal: AbortSignal.timeout(6000) });
            const body = await res.text();
            return decodeSub(body);
        } catch (e) { return []; }
    });
    
    const subResults = await Promise.all(fetchSubs);
    subResults.forEach(nodes => rawUris.push(...nodes));

    // 去重，排除 Surge 不支持的 vless/ssr
    rawUris = [...new Set(rawUris)].filter(n => !n.startsWith('vless://') && !n.startsWith('ssr://'));
    
    // ==========================================
    // 🧹 5. 解析并执行你的强力黑名单过滤
    // ==========================================
    let parsedNodes = rawUris.map(parseNode).filter(p => {
        if (!p.server || /^(0\.0\.0\.0|127\.0\.0\.1|1\.1\.1\.1|8\.8\.8\.8)$/.test(p.server)) return false;
        const trashRegex = /(官网|网址|获取|订阅|到期|过期|剩余|套餐|联系|邮箱|客服|通知|打不开|浏览器|最新客户端|下载新客户端|公告|发布|用不了|教程|导航|重置|续费|资源服|教学服|emby|porn|http:\/\/|https:\/\/|过滤掉)/i;
        if (trashRegex.test(p.name)) return false;
        return true;
    });

    console.log(`🔍 过滤垃圾节点后剩余 ${parsedNodes.length} 个，开始 TCP 测速...`);

    // ==========================================
    // ⚡ 6. 分批 TCP 测速
    // ==========================================
    const aliveNodes = [];
    for (let i = 0; i < parsedNodes.length; i += CONCURRENCY_LIMIT) {
        const batch = parsedNodes.slice(i, i + CONCURRENCY_LIMIT);
        const testPromises = batch.map(async (p) => {
            const isAlive = await pingTcp(p.server, p.port);
            if (isAlive) aliveNodes.push(p);
        });
        await Promise.all(testPromises);
        console.log(`⏳ 测速进度: ${Math.min(i + CONCURRENCY_LIMIT, parsedNodes.length)} / ${parsedNodes.length}`);
    }

    console.log(`✅ 测速完毕！存活节点：${aliveNodes.length} 个。开始执行专业重命名规则...`);
    
    // ==========================================
    // 🎨 7. 你的专业级提取与重命名逻辑
    // ==========================================
    let grouped = {};

    aliveNodes.forEach(p => {
        let tempName = p.name;
        // A. 地区识别
        for (let c of countryMap) {
            if (c.keys.test(tempName)) { p.cFlag = c.flag; p.cName = c.name; break; }
        }
        // B. 标签提取
        sortedTagKeys.forEach(key => {
            let regex = new RegExp(key, "i");
            if (regex.test(tempName)) {
                let formattedTag = tagDict[key];
                if (!p.tags.includes(formattedTag)) p.tags.push(formattedTag);
                tempName = tempName.replace(regex, "");
            }
        });
        // C. 倍率提取
        const blMatch = tempName.match(/((倍率|X|x|×)\D?((\d{1,3}\.)?\d+)\D?)|((\d{1,3}\.)?\d+)(倍|X|x|×)/i);
        if (blMatch) {
            const rev = blMatch[0].match(/(\d[\d.]*)/)[0];
            if (rev !== "1" && rev !== "1.0") p.multi = "x" + rev; 
        }

        if (!grouped[p.cName]) grouped[p.cName] = [];
        grouped[p.cName].push(p);
    });

    // D. 地区排序
    let sortedRegions = Object.keys(grouped).sort((a, b) => {
        let idxA = sortOrder.indexOf(a); let idxB = sortOrder.indexOf(b);
        if (idxA === -1) idxA = 999; if (idxB === -1) idxB = 999;
        return idxA - idxB;
    });

    const finalCleanUris = [];
    
    // E. 节点内排序与重命名拼接
    for (let region of sortedRegions) {
        let items = grouped[region];
        // 排序规则：纯净节点在前，带标签节点在后
        items.sort((a, b) => {
            let aHasTag = a.tags.length > 0 ? 1 : 0;
            let bHasTag = b.tags.length > 0 ? 1 : 0;
            if (aHasTag !== bHasTag) return aHasTag - bHasTag;
            return a.name.localeCompare(b.name);
        });

        items.forEach((item, index) => {
            let seq = (index + 1).toString().padStart(2, '0'); // 生成 01, 02...
            let coreName = `${item.cFlag} ${region} ${seq}`;
            let newName = RENAME_PREFIX + coreName;
            
            if (item.tags.length > 0) newName += ` [ ${item.tags.join(TAG_SEP)} ]`; 
            if (item.multi !== "") newName += ` ${item.multi}`;
            
            item.name = newName; // 替换旧名字
            finalCleanUris.push(repackageUri(item)); // 重新打包成链接
        });
    }

    // ==========================================
    // 📦 8. 输出供 Surge 拉取
    // ==========================================
    const finalBase64 = Buffer.from(finalCleanUris.join('\n')).toString('base64');
    fs.writeFileSync('sub.txt', finalBase64);
    console.log('🎉 成功生成最纯净的 sub.txt 文件！');
}

main();
