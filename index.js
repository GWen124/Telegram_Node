const fs = require('fs');
const net = require('net');

// ==========================================
// ⚙️ 1. 基础配置
// ==========================================
const CHANNELS = [
    'https://t.me/s/freeVPNjd',     
    'https://t.me/s/freekankan',  
    'https://t.me/s/v2ray_free_vpn'
];
const SUB_LIMIT = 50;      
const NODE_LIMIT = 100;    
const TCP_TIMEOUT = 2500;  
const CONCURRENCY_LIMIT = 200; 
const RENAME_PREFIX = "Telegram｜"; 

// ==========================================
// 🛠️ 2. 你的专业级字典 (完整保留)
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
    { keys: /美国|美|US|America|United\s*States/i, flag: '🇺🇸', name: '美国' },
    { keys: /英国|英|GB|UK|London/i, flag: '🇬🇧', name: '英国' },
    { keys: /德国|德|DE|Germany/i, flag: '🇩🇪', name: '德国' },
    { keys: /法国|法|FR|France/i, flag: '🇫🇷', name: '法国' },
    { keys: /中国|中|CN|China/i, flag: '🇨🇳', name: '中国' }
];

const sortOrder = ['香港', '台湾', '澳门', '日本', '韩国', '新加坡', '美国', '英国', '德国', '法国', '中国', '未知'];

// ==========================================
// 🔌 3. 核心工具函数
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
    // 这里保留原始 URI，确保重命名前数据不丢失
    return { uri, name, server, port, tags: [], multi: "", cFlag: '🏴', cName: '未知' };
}

function repackageUri(node) {
    try {
        if (node.uri.startsWith('vmess://')) {
            const str = Buffer.from(node.uri.slice(8), 'base64').toString('utf8');
            const json = JSON.parse(str);
            json.ps = node.name;
            return 'vmess://' + Buffer.from(JSON.stringify(json)).toString('base64');
        } else {
            const parts = node.uri.split('#');
            return parts[0] + '#' + encodeURIComponent(node.name);
        }
    } catch (e) { return node.uri; }
}

// ==========================================
// 🚀 4. 执行流程
// ==========================================
async function main() {
    let rawUris = [];

    // --- 第一步：抓取所有可能的链接 ---
    for (const url of CHANNELS) {
        try {
            const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
            const html = await res.text();
            const wideRegex = /(https?|ss|vmess|vless|trojan):\/\/[^\s"<>]+/g;
            let match; while ((match = wideRegex.exec(html))) {
                rawUris.push(match[0].replace(/[.,!?;）)]+$/, ''));
            }
        } catch (e) {}
    }

    // --- 第二步：解析并过滤黑名单 (不看名字，只看 server 连通性) ---
    let parsedNodes = [...new Set(rawUris)].map(parseNode).filter(p => {
        if (!p.server || /^(0\.0\.0\.0|127\.0\.0\.1|1\.1\.1\.1|8\.8\.8\.8)$/.test(p.server)) return false;
        const trashRegex = /(官网|网址|获取|订阅|到期|过期|剩余|套餐|客服|公告|教程|重置|续费|porn|过滤掉)/i;
        return !trashRegex.test(p.name);
    });

    console.log(`🔍 准备对 ${parsedNodes.length} 个潜在节点进行 TCP 测速...`);

    // --- 第三步：测速筛选可用节点 ---
    const aliveNodes = [];
    for (let i = 0; i < parsedNodes.length; i += CONCURRENCY_LIMIT) {
        const batch = parsedNodes.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.all(batch.map(async (p) => {
            if (await pingTcp(p.server, p.port)) aliveNodes.push(p);
        }));
    }

    // --- 第四步：执行你的重命名逻辑 (确保不覆盖) ---
    let grouped = {};
    aliveNodes.forEach(p => {
        let tempName = p.name;
        // 地区识别
        for (let c of countryMap) {
            if (c.keys.test(tempName)) { p.cFlag = c.flag; p.cName = c.name; break; }
        }
        // 标签提取
        sortedTagKeys.forEach(key => {
            let regex = new RegExp(key, "i");
            if (regex.test(tempName)) {
                if (!p.tags.includes(tagDict[key])) p.tags.push(tagDict[key]);
                tempName = tempName.replace(regex, "");
            }
        });
        // 倍率提取
        const blMatch = tempName.match(/((倍率|X|x|×)\D?((\d{1,3}\.)?\d+)\D?)|((\d{1,3}\.)?\d+)(倍|X|x|×)/i);
        if (blMatch) {
            const val = blMatch[0].match(/(\d[\d.]*)/)[0];
            if (val !== "1" && val !== "1.0") p.multi = "x" + val;
        }

        if (!grouped[p.cName]) grouped[p.cName] = [];
        grouped[p.cName].push(p);
    });

    const finalUris = [];
    const sortedRegions = Object.keys(grouped).sort((a, b) => (sortOrder.indexOf(a) || 999) - (sortOrder.indexOf(b) || 999));

    for (let region of sortedRegions) {
        grouped[region].forEach((item, index) => {
            // 这里是关键：自增序号保证了名字在输出给 Surge 时永远不冲突
            let seq = (index + 1).toString().padStart(2, '0');
            let newName = `${RENAME_PREFIX}${item.cFlag} ${region} ${seq}`;
            if (item.tags.length > 0) newName += ` [ ${item.tags.join(TAG_SEP)} ]`;
            if (item.multi) newName += ` ${item.multi}`;
            
            item.name = newName;
            finalUris.push(repackageUri(item));
        });
    }

    fs.writeFileSync('sub.txt', Buffer.from(finalUris.join('\n')).toString('base64'));
    console.log(`🎉 任务完成！生成的 sub.txt 包含 ${finalUris.length} 个完美重命名的节点。`);
}

main();
