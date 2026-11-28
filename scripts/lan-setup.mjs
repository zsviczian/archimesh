import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isIPv4 } from 'node:net';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import console from 'node:console';
import process from 'node:process';

const target = resolve('.local/lan');
const gitOpenSsl = 'C:/Program Files/Git/usr/bin/openssl.exe';
const openssl =
  process.env.OPENSSL_BIN ??
  (process.platform === 'win32' && existsSync(gitOpenSsl)
    ? gitOpenSsl
    : 'openssl');

function ssl(args, directory) {
  const result = spawnSync(openssl, args, {
    cwd: directory,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error)
    throw new Error(
      'OpenSSL could not start. Set OPENSSL_BIN to its executable.',
    );
  if (result.status !== 0)
    throw new Error(result.stderr.trim() || 'OpenSSL command failed');
}

function setup(ip) {
  const octets = isIPv4(ip) ? ip.split('.').map(Number) : [];
  const assigned = Object.values(networkInterfaces())
    .flat()
    .some((address) => address && !address.internal && address.address === ip);
  if (
    !assigned ||
    !(
      octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    )
  ) {
    throw new Error(
      'Supply an assigned private IPv4 address, for example pnpm lan:setup 192.168.1.20',
    );
  }
  if (existsSync(target))
    throw new Error('LAN configuration already exists in .local/lan');
  mkdirSync(resolve('.local'), { recursive: true });
  const temporary = mkdtempSync(resolve('.local/lan-setup-'));
  try {
    const write = (name, text) =>
      writeFileSync(join(temporary, name), text, { flag: 'wx', mode: 0o600 });
    const keyArgs = [
      'genpkey',
      '-algorithm',
      'RSA',
      '-pkeyopt',
      'rsa_keygen_bits:3072',
      '-out',
    ];
    const label = `ArchiMesh local ${ip} ${randomBytes(4).toString('hex')}`;
    write(
      'ca.cnf',
      `[req]\ndistinguished_name = dn\n[dn]\n[ca]\nbasicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n`,
    );
    write(
      'leaf.cnf',
      `[req]\ndistinguished_name = dn\n[dn]\n[leaf]\nbasicConstraints=critical,CA:FALSE\nextendedKeyUsage=serverAuth\nkeyUsage=critical,digitalSignature,keyEncipherment\nsubjectAltName=IP:${ip}\n`,
    );
    ssl([...keyArgs, 'ca-key.pem'], temporary);
    ssl(
      [
        'req',
        '-new',
        '-x509',
        '-sha256',
        '-days',
        '365',
        '-key',
        'ca-key.pem',
        '-out',
        'archimesh-lan-ca.cer',
        '-subj',
        `/CN=${label}`,
        '-config',
        'ca.cnf',
        '-extensions',
        'ca',
      ],
      temporary,
    );
    ssl([...keyArgs, 'server-key.pem'], temporary);
    ssl(
      [
        'req',
        '-new',
        '-sha256',
        '-key',
        'server-key.pem',
        '-out',
        'request.csr',
        '-subj',
        '/CN=ArchiMesh LAN',
        '-config',
        'leaf.cnf',
      ],
      temporary,
    );
    ssl(
      [
        'x509',
        '-req',
        '-sha256',
        '-days',
        '365',
        '-in',
        'request.csr',
        '-CA',
        'archimesh-lan-ca.cer',
        '-CAkey',
        'ca-key.pem',
        '-set_serial',
        '0x' + randomBytes(16).toString('hex'),
        '-extfile',
        'leaf.cnf',
        '-extensions',
        'leaf',
        '-out',
        'server-cert.pem',
      ],
      temporary,
    );
    for (const name of ['ca-key.pem', 'request.csr', 'leaf.cnf', 'ca.cnf'])
      unlinkSync(join(temporary, name));

    const secret = randomBytes(32).toString('base64url');
    write('password.txt', secret + '\n');
    write(
      'config.json',
      JSON.stringify(
        {
          host: ip,
          port: 3443,
          passwordHash: createHash('sha256').update(secret).digest('hex'),
        },
        null,
        2,
      ) + '\n',
    );
    renameSync(temporary, target);
    console.log(`LAN origin https://${ip}:3443`);
    console.log('Public trust certificate: .local/lan/archimesh-lan-ca.cer');
    console.log('Generated passphrase: .local/lan/password.txt');
  } finally {
    if (existsSync(temporary)) {
      for (const name of readdirSync(temporary))
        unlinkSync(join(temporary, name));
      rmdirSync(temporary);
    }
  }
}

try {
  setup(process.argv[2] ?? '');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
