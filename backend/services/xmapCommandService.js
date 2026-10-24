/**
 * XMap 进程调用的统一入口：可执行文件位置与是否经 sudo 由环境变量决定。
 *
 *   XMAP_BIN        xmap 可执行文件，默认 `xmap`（从 PATH 查找）
 *   XMAP_USE_SUDO   默认 true（保持原有行为：`sudo xmap …`）；容器里给可执行文件设置了
 *                   cap_net_raw/cap_net_admin、应用以非 root 运行时设为 false，
 *                   这样容器内不需要 sudo，也不需要 NOPASSWD。
 *
 * 读取环境变量放在函数里而不是模块加载时，便于测试与启动后改配置。
 */

const getXmapBin = () => process.env.XMAP_BIN || 'xmap';

const useSudo = () => String(process.env.XMAP_USE_SUDO ?? 'true').toLowerCase() !== 'false';

/**
 * 返回 spawn 用的 { command, args }，以及用于展示/入库的 display 字符串。
 * args 必须已经过校验（见 xmapController 的 validateXmapParams），这里不做拼接转义。
 */
function buildXmapInvocation(args) {
  const bin = getXmapBin();
  if (useSudo()) {
    return { command: 'sudo', args: [bin, ...args], display: `sudo ${[bin, ...args].join(' ')}` };
  }
  return { command: bin, args, display: [bin, ...args].join(' ') };
}

/** 需要提权的辅助命令（pkill、bash -c 等）：启用 sudo 时前面加 sudo，否则原样执行。 */
function buildPrivileged(command, args) {
  return useSudo() ? { command: 'sudo', args: [command, ...args] } : { command, args };
}

module.exports = { getXmapBin, useSudo, buildXmapInvocation, buildPrivileged };
