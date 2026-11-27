import process from 'node:process';
import console from 'node:console';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

const root = resolve('.local');
const data = join(root, 'pgdata');
const stateFile = join(root, 'pg-state.json');
const log = join(root, 'postgres.log');
const portable = join(root, 'postgresql', 'pgsql', 'bin');
const bin = process.env.PG_BIN ?? (existsSync(portable) ? portable : '');
const password = () => randomBytes(24).toString('hex');
const roles = {
  archimesh: ['archimesh_owner', 'archimesh_app'],
  archimesh_test: ['archimesh_test_owner', 'archimesh_test_app'],
};

function pg(program, args, options = {}) {
  const executable = bin
    ? join(bin, program + (process.platform === 'win32' ? '.exe' : ''))
    : program;
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
  if (result.error) {
    throw new Error(
      `Cannot run ${program}. Set PG_BIN to the PostgreSQL 16 bin directory.`,
      {
        cause: result.error,
      },
    );
  }
  return result;
}

function run(program, args, options) {
  const result = pg(program, args, options);
  if (result.status !== 0) {
    throw new Error(
      `${program} exited with status ${result.status}: ${(result.stderr ?? '').trim()}`,
    );
  }
  return (result.stdout ?? '').trim();
}

function readState() {
  if (!existsSync(stateFile)) throw new Error('Run db:local setup first.');
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  if (
    state.version !== 1 ||
    !Number.isInteger(state.port) ||
    state.port < 1024 ||
    state.port > 65535 ||
    !['admin', ...Object.values(roles).flat()].every((key) =>
      /^[0-9a-f]{48}$/.test(state[key]),
    )
  ) {
    throw new Error(
      'Invalid local PostgreSQL state. Check .local/pg-state.json.',
    );
  }
  return state;
}

function isRunning() {
  const result = pg('pg_ctl', ['-D', data, 'status']);
  if (result.status === 0) return true;
  if (result.status === 3) return false;
  throw new Error(`pg_ctl status failed: ${(result.stderr ?? '').trim()}`);
}

function start(state) {
  if (!isRunning()) {
    run(
      'pg_ctl',
      [
        '-D',
        data,
        '-l',
        log,
        '-w',
        '-o',
        `-h 127.0.0.1 -p ${state.port}${process.platform === 'win32' ? '' : " -k ''"}`,
        'start',
      ],
      { stdio: 'ignore' },
    );
  }
  console.log(`Project PostgreSQL listening on 127.0.0.1:${state.port}`);
}

function sql(state, database, input) {
  return run(
    'psql',
    [
      '-X',
      '-qAt',
      '-w',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      '127.0.0.1',
      '-p',
      String(state.port),
      '-U',
      'archimesh_local_admin',
      '-d',
      database,
      '-f',
      '-',
    ],
    {
      input,
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => !key.toUpperCase().startsWith('PG'),
          ),
        ),
        PGPASSWORD: state.admin,
      },
    },
  );
}

async function checkPort(port) {
  const server = createServer();
  await new Promise((resolvePort, rejectPort) => {
    server.once('error', rejectPort);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, resolvePort);
  });
  await new Promise((resolvePort, rejectPort) =>
    server.close((error) => (error ? rejectPort(error) : resolvePort())),
  );
}

async function setup() {
  const version = run('initdb', ['--version']);
  if (!/PostgreSQL\) 16\./.test(version))
    throw new Error(`Expected PostgreSQL 16, found ${version}`);
  mkdirSync(root, { recursive: true });
  if (!existsSync(stateFile)) {
    if (existsSync(data) || existsSync('.env')) {
      throw new Error(
        'Existing .env or cluster data found. Preserve or move it before setup.',
      );
    }
    const requestedPort = Number(process.env.ARCHIMESH_PG_PORT ?? 55432);
    if (
      !Number.isInteger(requestedPort) ||
      requestedPort < 1024 ||
      requestedPort > 65535
    ) {
      throw new Error(
        'ARCHIMESH_PG_PORT must be an integer from 1024 to 65535.',
      );
    }
    await checkPort(requestedPort);
    const credentials = Object.fromEntries(
      Object.values(roles)
        .flat()
        .map((role) => [role, password()]),
    );
    writeFileSync(
      stateFile,
      JSON.stringify({
        version: 1,
        port: requestedPort,
        admin: password(),
        ...credentials,
      }),
      { flag: 'wx', mode: 0o600 },
    );
  }
  const state = readState();
  if (!existsSync(join(data, 'PG_VERSION'))) {
    const pwFile = join(root, `pg-init-${randomBytes(8).toString('hex')}`);
    writeFileSync(pwFile, state.admin + '\n', { flag: 'wx', mode: 0o600 });
    try {
      run('initdb', [
        '-D',
        data,
        '-U',
        'archimesh_local_admin',
        '--auth=scram-sha-256',
        '--encoding=UTF8',
        '--locale=C',
        '--pwfile',
        pwFile,
      ]);
    } finally {
      unlinkSync(pwFile);
    }
  }

  start(state);
  for (const [db, [owner, app]] of Object.entries(roles)) {
    for (const role of [owner, app]) {
      sql(
        state,
        'postgres',
        `
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
            CREATE ROLE ${role} LOGIN PASSWORD '${state[role]}';
          END IF;
        END $$;
      `,
      );
    }
    if (
      !sql(
        state,
        'postgres',
        `SELECT 1 FROM pg_database WHERE datname = '${db}';`,
      )
    ) {
      sql(state, 'postgres', `CREATE DATABASE ${db} OWNER ${owner};`);
    }
    sql(
      state,
      'postgres',
      `REVOKE CONNECT ON DATABASE ${db} FROM PUBLIC; GRANT CONNECT ON DATABASE ${db} TO ${app};`,
    );
    sql(
      state,
      db,
      `
      SET ROLE ${owner};
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      GRANT USAGE ON SCHEMA public TO ${app};
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app};
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${app};
    `,
    );
  }

  const url = (role, db) =>
    `postgresql://${role}:${state[role]}@127.0.0.1:${state.port}/${db}`;
  if (!existsSync('.env')) {
    writeFileSync(
      '.env',
      [
        `DATABASE_URL=${url('archimesh_app', 'archimesh')}`,
        `MIGRATION_DATABASE_URL=${url('archimesh_owner', 'archimesh')}`,
        `TEST_DATABASE_URL=${url('archimesh_test_app', 'archimesh_test')}`,
        `TEST_MIGRATION_DATABASE_URL=${url('archimesh_test_owner', 'archimesh_test')}`,
        'HOST=127.0.0.1',
        'PORT=3000',
        '',
      ].join('\n'),
      { flag: 'wx', mode: 0o600 },
    );
  }
  console.log('Local roles and databases are ready. Connection settings: .env');
}

try {
  const command = process.argv[2];
  if (command === 'setup') {
    await setup();
  } else if (command === 'start') {
    start(readState());
  } else if (command === 'stop') {
    readState();
    if (isRunning()) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    console.log('Project PostgreSQL stopped.');
  } else if (command === 'status') {
    const state = readState();
    console.log(
      `Project PostgreSQL on 127.0.0.1:${state.port} is ${isRunning() ? 'running' : 'stopped'}.`,
    );
  } else {
    throw new Error('Usage: pnpm db:local setup|start|stop|status');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
