import os from 'node:os';
import type { NetworkAddress } from '@pcshop/shared';

// Adapters phones on the shop WiFi can't reach (VMs, containers, VPNs, Bluetooth).
const VIRTUAL_ADAPTER =
  /vethernet|virtualbox|vmware|wsl|hyper-v|docker|vbox|loopback|bluetooth|tap|tailscale|zerotier|npcap|vpn/i;

function isPrivateLan(address: string): boolean {
  const [a, b] = address.split('.').map(Number) as [number, number];
  return (a === 192 && b === 168) || a === 10 || (a === 172 && b >= 16 && b <= 31);
}

/** IPv4 addresses of this computer that other devices on the LAN might use to reach the app. */
export function listLanAddresses(
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): NetworkAddress[] {
  const found: NetworkAddress[] = [];
  for (const [interfaceName, infos] of Object.entries(interfaces)) {
    for (const info of infos ?? []) {
      if (info.family !== 'IPv4' || info.internal || info.address.startsWith('169.254.')) continue;
      found.push({
        address: info.address,
        interfaceName,
        recommended: isPrivateLan(info.address) && !VIRTUAL_ADAPTER.test(interfaceName),
      });
    }
  }
  // Recommended first; among those, 192.168.x.x (typical home/shop routers) before others.
  const rank = (a: NetworkAddress) =>
    (a.recommended ? 0 : 2) + (a.address.startsWith('192.168.') ? 0 : 1);
  return found.sort((x, y) => rank(x) - rank(y));
}
