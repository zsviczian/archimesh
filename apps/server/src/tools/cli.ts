import { createReadStream } from 'node:fs';
import { parseArgs } from 'node:util';
import { changesetSchema } from '@archimesh/contracts';
import { ZodError } from 'zod';
import {
  createModelClient,
  draftInput,
  exportInput,
  maxPayloadBytes,
  ModelClientError,
  neighborhoodInput,
  objectInput,
  providerInput,
  searchInput,
  toolError,
} from './api.js';

const usage = [
  'Usage: pnpm model:cli <command> [options]',
  '',
  '  search [--q text] [--type kind] [--scope scope] [--limit n] [--cursor uuid]',
  '  get --id uuid [--revision uuid]',
  '  neighborhood --id uuid [--direction inbound|outbound|both]',
  '  metamodel',
  '  providers --id capability-uuid',
  '  validate --file changeset.json',
  '  draft --file scenario.json',
  '  export [--scope scope] [--type kind] [--recorded-at timestamp] [--effective-on date]',
  '',
  'Set ARCHIMESH_IDENTITY to a synthetic demo identity before making requests.',
].join('\n');

async function readRequestFile(fileName: string): Promise<unknown> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let body = '';
  try {
    for await (const chunk of createReadStream(fileName, {
      end: maxPayloadBytes,
    })) {
      bytes += chunk.byteLength;
      if (bytes > maxPayloadBytes) throw new Error('file too large');
      body += decoder.decode(chunk, { stream: true });
    }
    return JSON.parse(body + decoder.decode()) as unknown;
  } catch {
    throw new ModelClientError(
      'The request file must contain readable UTF-8 JSON under 1 MiB.',
    );
  }
}

async function cli() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      id: { type: 'string' },
      q: { type: 'string' },
      type: { type: 'string' },
      scope: { type: 'string' },
      limit: { type: 'string' },
      cursor: { type: 'string' },
      revision: { type: 'string' },
      direction: { type: 'string' },
      file: { type: 'string' },
      'recorded-at': { type: 'string' },
      'effective-on': { type: 'string' },
    },
  });
  if (values.help || !positionals.length) {
    console.log(usage);
    return;
  }

  if (positionals.length !== 1) {
    throw new ModelClientError(
      'Use one command and its named options. Run --help for usage.',
    );
  }
  const [command] = positionals;
  const args = Object.fromEntries(
    Object.entries({
      id: values.id,
      q: values.q,
      type: values.type,
      scopeId: values.scope,
      limit: values.limit === undefined ? undefined : Number(values.limit),
      cursor: values.cursor,
      revision: values.revision,
      direction: values.direction,
      recordedAt: values['recorded-at'],
      effectiveOn: values['effective-on'],
    }).filter(([, value]) => value !== undefined),
  );
  if (command === 'validate' || command === 'draft') {
    if (!values.file || Object.keys(args).length) {
      throw new ModelClientError(
        'Use --file to supply the JSON request for this command.',
      );
    }
    const client = createModelClient(process.env);
    const request = await readRequestFile(values.file);
    const result =
      command === 'validate'
        ? await client.validate(changesetSchema.parse(request))
        : await client.draft(draftInput.parse(request));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (values.file)
    throw new ModelClientError(
      'The --file option is only for validate and draft.',
    );
  const client = createModelClient(process.env);
  const actions = {
    search: () => client.search(searchInput.parse(args)),
    get: () => client.object(objectInput.parse(args)),
    neighborhood: () => client.neighborhood(neighborhoodInput.parse(args)),
    metamodel: () => {
      if (Object.keys(args).length)
        throw new ModelClientError('metamodel takes no options.');
      return client.metamodel();
    },
    providers: () => client.providers(providerInput.parse(args)),
    export: () => client.exportContext(exportInput.parse(args)),
  };
  const action = actions[command as keyof typeof actions];
  if (!Object.hasOwn(actions, command)) {
    throw new ModelClientError('Unknown command. Run --help for usage.');
  }
  const result = await action();
  console.log(JSON.stringify(result, null, 2));
}

try {
  await cli();
} catch (error) {
  const message =
    error instanceof ZodError ||
    (error instanceof TypeError &&
      'code' in error &&
      String(error.code).startsWith('ERR_PARSE_ARGS_'))
      ? 'Invalid command input. Run --help for usage.'
      : toolError(error);
  console.error(message);
  process.exitCode = 1;
}
