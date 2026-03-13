const fs = require('fs');
const net = require('net');

// 1. 扩充源，确保基数够大
const CHANNELS = [
    'https://t.me/s/v2ray_free_vpn', 'https://t.me/s/free8964', 'https://t.me/s/Clash_VPNS',
    'https://t.me/s/v2ray_nodes', 'https://t.me/s/daily_proxies', 'https://t.me/s/freeVPNjd',
    'https://t.me/s/v2free666', 'https://t.me/s/Outline_Vpn', 'https://t.me/s/Jichangdog'
];

const RENAME_PREFIX = "Telegram｜";

// 你的标签字典
const tagDict = { "Zx": "专线", "IPLC": "IPLC", "IEPL": "IEPL", "Fam": "家宽", "直连": "直连", "中转": "中转", "Netflix": "Netflix", "OpenAI": "OpenAI" };
const sortedTagKeys = Object.keys(tagDict).sort((a, b) => b.length - a.length);

const countryMap = [
    { keys: /香港|港|HK/i, flag: '🇭🇰', name: '香港' },
    { keys: /台湾|台|TW/i, flag: '🇨🇳', name: '台湾' },
    { keys: /日本|日|JP/i, flag: '🇯🇵', name: '日本' },
    { keys: /美国|美|US/i, flag: '🇺🇸', name: '美国' },
    { keys: /新加坡|新|SG/i, flag: '🇸🇬', name: '新加坡' },
    { keys: /韩国|韩|KR/i, flag: '🇰🇷', name: '韩国' }
];

// 解析函数：高度兼容
function parseNode(uri) {
    let name = "Unknown", server = "", port = 0;
    try {
        if (uri.startsWith('vmess://')) {
            const b = JSON.parse(Buffer.from(uri.slice(8), 'base64').toString());
            name = b.ps || "未命名"; server = b.add; port = b.port;
        } else if (uri.includes('#')) {
            const parts = uri.split('#');
            name = decodeURIComponent(parts[1]);
            const info = parts[0].match(/@?([^:]+):(\d+)/);
            if (info) { server = info[1]; port = info[2]; }
        }
    } catch (e) {}
    return { uri, name, server, port, tags: [], cFlag: '🏴', cName: '其他' };
}

async function main() {
    let rawUris = [];
    console.log("🌐 开始抓取 Telegram 节点...");

    for (const url of CHANNELS) {
        try {
            const res = await fetch(url);
            const text = await res.text();
            const matches = text.match(/(ss|vmess|vless|trojan):\/\/[a-zA-Z0-9%?#=&.@\-\/\[\]:]+/g) || [];
            rawUris.push(...matches);
        } catch (e) {}
    }

    // 去重并解析
    let nodes = [...new Set(rawUris)].map(parseNode).filter(n => n.server);
    console.log(`📊 共抓取到 ${nodes.length} 个节点，正在进入命名流程...`);

    // --- 关键修改：不再剔除“不通”的节点，只做重命名 ---
    let grouped = {};
    nodes.forEach(p => {
        let tempName = p.name;
        // 匹配国家
        for (let c of countryMap) {
            if (c.keys.test(tempName)) { p.cFlag = c.flag; p.cName = c.name; break; }
        }
        // 匹配标签
        sortedTagKeys.forEach(key => {
            if (new RegExp(key, "i").test(tempName)) {
                if (!p.tags.includes(tagDict[key])) p.tags.push(tagDict[key]);
            }
        });

        if (!grouped[p.cName]) grouped[p.cName] = [];
        grouped[p.cName].push(p);
    });

    const finalResult = [];
    const regions = Object.keys(grouped).sort();

    regions.forEach(region => {
        grouped[region].forEach((item, index) => {
            let seq = (index + 1).toString().padStart(2, '0');
            let newName = `${RENAME_PREFIX}${item.cFlag} ${region} ${seq}`;
            if (item.tags.length > 0) newName += ` [ ${item.tags.join('｜')} ]`;
            
            // 重新封装
            if (item.uri.startsWith('vmess://')) {
                let b = JSON.parse(Buffer.from(item.uri.slice(8), 'base64').toString());
                b.ps = newName;
                finalResult.push('vmess://' + Buffer.from(JSON.stringify(b)).toString('base64'));
            } else {
                finalResult.push(item.uri.split('#')[0] + '#' + encodeURIComponent(newName));
            }
        });
    });

    // 写入文件
    fs.writeFileSync('sub.txt', Buffer.from(finalResult.join('\n')).toString('base64'));
    console.log(`🎉 任务成功！已生成 sub.txt，共 ${finalResult.length} 个节点。`);
}

main();
