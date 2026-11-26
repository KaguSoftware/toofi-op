import { describe, expect, it } from 'vitest';
import { QR_INK, QR_PAPER, QUIET_MODULES, menuSiteBase, qrModules, qrPath, qrScale, sortForPrint, tableUrl } from './qrLogic';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';

describe('the code is black on white', () => {
  it('never takes a brand colour', () => {
    expect(QR_INK).toBe('black');
    expect(QR_PAPER).toBe('white');
  });
});

describe('qrPath', () => {
  it('draws exactly the dark modules as horizontal runs', () => {
    const modules = qrModules(`https://menu.example.com/t/${TOKEN}`);
    const { d, size } = qrPath(modules);
    expect(size).toBe(modules.size);
    expect((d.match(/M\d+ \d+h\d+v1h-\d+z/g) ?? []).join('')).toBe(d);
    const grid = new Uint8Array(size * size);
    for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      const [x, y, run] = [Number(m[1]), Number(m[2]), Number(m[3])];
      for (let i = 0; i < run; i++) grid[y * size + x + i] = 1;
    }
    for (let i = 0; i < size * size; i++) expect(grid[i]).toBe(modules.data[i] ? 1 : 0);
  });

  it('is deterministic and differs per address', () => {
    const a = qrPath(qrModules('https://menu.example.com/t/a')).d;
    expect(qrPath(qrModules('https://menu.example.com/t/a')).d).toBe(a);
    expect(qrPath(qrModules('https://menu.example.com/t/b')).d).not.toBe(a);
  });
});

describe('qrScale', () => {
  it('fits the modules plus the quiet zone into the box', () => {
    expect(QUIET_MODULES).toBe(4);
    expect(qrScale(25, 330)).toBe(10);
  });
});

describe('menuSiteBase: a card never carries a dead address', () => {
  it.each([undefined, '', '   ', 'not a url ::'])('refuses a missing or unreadable address (%j) in every build', (raw) => {
    expect(menuSiteBase(raw, true).ok).toBe(false);
    expect(menuSiteBase(raw, false).ok).toBe(false);
  });

  it.each([
    'http://localhost:3000',
    'https://localhost',
    'http://127.0.0.1:3000',
    'http://0.0.0.0',
    'http://[::1]:3000',
    'http://10.0.0.5',
    'http://192.168.1.20:3000',
    'http://172.16.0.1',
    'http://172.31.255.255',
    'http://169.254.1.1',
    'http://desk.local',
    'http://menu.localhost',
    'http://menu',
  ])('a production build refuses %s', (raw) => {
    expect(menuSiteBase(raw, true)).toEqual({ ok: false, reason: 'local' });
  });

  it('a development build allows a local address, so the card can be tried', () => {
    expect(menuSiteBase('http://localhost:3000', false)).toEqual({ ok: true, base: 'http://localhost:3000' });
    expect(menuSiteBase('http://192.168.1.20:3000', false)).toEqual({ ok: true, base: 'http://192.168.1.20:3000' });
  });

  it('does not mistake a public address that starts like a private one', () => {
    expect(menuSiteBase('https://172.32.0.1', true).ok).toBe(true);
    expect(menuSiteBase('https://100.example.com', true).ok).toBe(true);
    expect(menuSiteBase('https://localhost.example.com', true).ok).toBe(true);
  });

  it('refuses a scheme that is not http or https', () => {
    expect(menuSiteBase('ftp://menu.example.com', true)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('keeps the host and any path, drops the trailing slash, query and hash', () => {
    expect(menuSiteBase('https://menu.example.com/', true)).toEqual({ ok: true, base: 'https://menu.example.com' });
    expect(menuSiteBase('https://menu.example.com/m/?a=1#b', true)).toEqual({ ok: true, base: 'https://menu.example.com/m' });
  });

  it('reads a bare host as https', () => {
    expect(menuSiteBase('menu.example.com', true)).toEqual({ ok: true, base: 'https://menu.example.com' });
  });
});

describe('tableUrl', () => {
  it('is {menu site}/t/{token}', () => {
    expect(tableUrl('https://menu.example.com', TOKEN)).toBe(`https://menu.example.com/t/${TOKEN}`);
    expect(tableUrl('https://menu.example.com/m', TOKEN)).toBe(`https://menu.example.com/m/t/${TOKEN}`);
  });
});

describe('sortForPrint', () => {
  it('orders labels as people read them: 2 before 10', () => {
    const rows = [{ label: 'T10' }, { label: 'T2' }, { label: 'T1' }];
    expect(sortForPrint(rows).map((r) => r.label)).toEqual(['T1', 'T2', 'T10']);
  });
  it('does not change its input', () => {
    const rows = [{ label: '2' }, { label: '1' }];
    sortForPrint(rows);
    expect(rows[0]?.label).toBe('2');
  });
});
