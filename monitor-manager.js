const fs = require("fs");
const path = require("path");
const axios = require("axios");

// ============================================================
// monitor-manager v2 —— 修复原版三个缺陷：
// 1. save() 原子化（临时文件 + rename，防写一半损坏）
// 2. checkAll() 加互斥锁（防并发轮次互相覆盖）
// 3. checkMonitor() 独立捕获异常 + 每目标单独写回（慢目标不阻塞、失败不丢数据）
// 原版行为保持不变，仅增强健壮性。
// ============================================================

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "monitors.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");

// v2: 互斥锁，防止并发 checkAll 互相覆盖
let _checkLock = Promise.resolve();
let _checkQueue = null;

function load() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch (error) {
        console.error("[LOAD ERROR]", error.message);
        // v2: 损坏时备份现场，再重建，而不是静默吞掉用户数据
        try {
            const bak = DATA_FILE + ".corrupt." + Date.now();
            fs.copyFileSync(DATA_FILE, bak);
            console.error("[LOAD] 已备份损坏文件:", bak);
        } catch (e) {}
        fs.writeFileSync(DATA_FILE, "[]", "utf8");
        return [];
    }
}

// v2: 原子写入。先写临时文件再 rename，rename 是原子的；
// 即使进程在写一半被 kill，monitors.json 仍是完整旧文件。
function save(data) {
    const tmp = DATA_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 4), "utf8");
    fs.renameSync(tmp, DATA_FILE);
}

function addMonitor(config) {
    const list = load();
    if (list.find(item => item.name === config.name)) {
        throw new Error("Website already exists");
    }
    const monitor = {
        id: Date.now(),
        name: config.name,
        url: config.url,
        interval: Number(config.interval || 300),
        status: "unknown",
        responseTime: 0,
        lastCheck: null,
        error: null
    };
    list.push(monitor);
    save(list);
    return monitor;
}

function deleteMonitor(name) {
    const list = load();
    const oldLength = list.length;
    save(list.filter(item => item.name !== name));
    return list.length !== oldLength;
}

function getAllMonitor() {
    return load();
}

// v2: 单目标检查独立捕获所有异常，任何目标失败都不影响其他目标
async function checkMonitor(monitor) {
    const start = Date.now();
    try {
        const response = await axios.get(monitor.url, {
            timeout: 10000,
            validateStatus: () => true
        });
        monitor.responseTime = Date.now() - start;
        monitor.lastCheck = new Date().toISOString();
        if (response.status >= 200 && response.status < 400) {
            monitor.status = "online";
            monitor.error = null;
        } else {
            monitor.status = "warning";
            monitor.error = "HTTP " + response.status;
        }
    } catch (error) {
        monitor.status = "offline";
        monitor.responseTime = 0;
        monitor.lastCheck = new Date().toISOString();
        monitor.error = error.message;
    }
}

// v2: 串行化所有检查，且不持有旧快照 —— 每检查完一个目标，
// 立即把它的新状态合并回磁盘上的最新数据，避免覆盖期间的并发写入。
async function _checkAllInner() {
    const names = load().map(m => m.name);
    if (names.length === 0) return;
    console.log(`[CHECK] ${names.length} websites`);
    for (const name of names) {
        // 每次都重新读最新数据（可能期间有 add/delete）
        const list = load();
        const monitor = list.find(m => m.name === name);
        if (!monitor) continue;  // 期间被删除，跳过
        await checkMonitor(monitor);
        // 只更新这一个目标，保留磁盘上其他目标在期间发生的任何变化
        const fresh = load();
        const idx = fresh.findIndex(m => m.name === name);
        if (idx >= 0) {
            fresh[idx] = monitor;
            save(fresh);
        }
        console.log(`[${monitor.status}] ${monitor.name} ${monitor.responseTime}ms`);
    }
}

function checkAll() {
    // v2: 互斥 —— 并发调用排队执行，不再互相覆盖
    _checkQueue = (_checkQueue || Promise.resolve())
        .then(_checkAllInner)
        .catch(err => console.error("[CHECK ERROR]", err.message));
    return _checkQueue;
}

module.exports = { addMonitor, deleteMonitor, getAllMonitor, checkAll };
