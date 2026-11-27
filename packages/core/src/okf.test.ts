import { describe, expect, it } from 'vitest';
import {
  ConceptError,
  parseConcept,
  remapConceptIds,
  serializeConcept,
  validateRelationship,
  withViewPositions,
} from './index.js';

const id = 'd789e5f3-4f52-4851-85a0-841d34cc5f82';
const other = 'd69d85c7-8fae-498b-aa8c-be1a4ee4d665';
const edge = '3031e42d-a2ab-4977-91fe-aaba9adbfe9f';
const viewId = '3501194b-818d-48ed-82fa-a2c77de956e5';

const standard = {
  id,
  type: 'capability',
  title: 'Supplier onboarding',
  body: '\n# Model\n\nScreen new suppliers.\n\n---\n\n[Related concept](other.md)\n',
};
const model = (extra = '', body = standard.body) =>
  '---\ntype: capability\ntitle: Supplier onboarding\nx-archimesh-model:\n  id: ' +
  id +
  '\n' +
  extra +
  '---\n' +
  body;

describe('canonical OKF concepts', () => {
  it('round-trips the modeled values without changing the body', () => {
    const markdown = serializeConcept({
      ...standard,
      body: standard.body.replaceAll('\n', '\r\n') + 'Kit 🧭',
      description: 'Fictional supplier onboarding',
      lifecycle: 'active',
      aliases: ['Vendor onboarding'],
      owner: 'Procurement',
      effectiveFrom: '2028-02-29',
      effectiveTo: '2030-01-01',
      attributes: { countryCodes: ['NO', 'GB'], hasPortal: true, quota: 0 },
    });
    expect(parseConcept(markdown)).toEqual({
      id,
      type: 'capability',
      title: standard.title,
      description: 'Fictional supplier onboarding',
      lifecycle: 'active',
      aliases: ['Vendor onboarding'],
      owner: 'Procurement',
      effectiveFrom: '2028-02-29',
      effectiveTo: '2030-01-01',
      attributes: { countryCodes: ['NO', 'GB'], hasPortal: true, quota: 0 },
      body: standard.body.replaceAll('\n', '\r\n') + 'Kit 🧭',
      relationship: null,
      view: null,
    });
  });

  it('uses a strict document profile with draft and unbounded end defaults', () => {
    expect(parseConcept(model())).toMatchObject({
      lifecycle: 'draft',
      aliases: [],
      owner: null,
      effectiveFrom: '1970-01-01',
      effectiveTo: null,
    });
    expect(() =>
      parseConcept(model().replace('capability', 'unknown-type')),
    ).toThrow('The type field is invalid.');
    expect(() =>
      serializeConcept({
        ...standard,
        type: 'application-instance',
        lifecycle: 'active',
      }),
    ).toThrow('requires an accountable owner');
    expect(() =>
      serializeConcept({ ...standard, effectiveFrom: '2026-02-29' }),
    ).toThrow('valid calendar dates');
    expect(() =>
      serializeConcept({
        ...standard,
        effectiveFrom: '2026-11-30',
        effectiveTo: '2026-11-30',
      }),
    ).toThrow('increasing interval');
    expect(() =>
      serializeConcept({ ...standard, effectiveFrom: '0000-01-01' }),
    ).toThrow('valid calendar dates');
  });

  it.each([
    '  id: 3031e42d-a2ab-4977-91fe-aaba9adbfe9f',
    '  test: &label safe\n  pointer: *label',
    '  scalar: !untrusted payload',
    '  scalar: !!str explicit',
    '  attributes: {__proto__: {forged: true}}',
    '  attributes: {constructor: unexpected}',
    '  attributes: {1: unexpected}',
    '  attributes: {<<: {forged: true}}',
    '  attributes: {safe: .inf}',
    '  attributes: {safe: .nan}',
    '  attributes: {safe: 9007199254740993}',
    '  attributes: {safe: "\\0"}',
    '  attributes: {safe: ' + '['.repeat(40) + 'null' + ']'.repeat(40) + '}',
  ])('rejects untrusted or ambiguous YAML (%s)', (frontmatter) => {
    expect(() => parseConcept(model(frontmatter + '\n'))).toThrow(
      new ConceptError(
        'Frontmatter must be a safe YAML 1.2 mapping with unique keys.',
      ),
    );
  });

  it('never allows arbitrary metadata to set projected owner or lifecycle', () => {
    const markdown = model().replace(
      'x-archimesh-model:',
      'owner: Pretend approver\nstatus: stable\nverified: {by: "human:admin"}\nx-archimesh-model:',
    );
    expect(parseConcept(markdown)).toMatchObject({
      owner: null,
      lifecycle: 'draft',
    });
  });

  it('rejects unsafe boundary markers, malformed text, and oversize source', () => {
    expect(() => parseConcept(model().replace('---\n', '--- \n'))).toThrow(
      ConceptError,
    );
    expect(() => parseConcept(model('', 'nul\u0000'))).toThrow(
      'invalid characters',
    );
    expect(() => parseConcept(model('', '\ud800'))).toThrow(
      'invalid characters',
    );
    expect(() =>
      parseConcept(model('  too_big: ' + 'a'.repeat(25000) + '\n')),
    ).toThrow('frontmatter exceeds');
    expect(() => parseConcept(model('', 'a'.repeat(65536)))).toThrow(
      'Markdown exceeds',
    );
  });
});

describe('relationship and diagram semantics', () => {
  it('validates allowed endpoint types including a relationship target', () => {
    expect(() =>
      validateRelationship('impacts', 'project', 'relationship'),
    ).not.toThrow();
    expect(() =>
      validateRelationship(
        'instance-of',
        'application-instance',
        'application',
      ),
    ).not.toThrow();
    expect(() =>
      validateRelationship(
        'instance-of',
        'application',
        'application-instance',
      ),
    ).toThrow(ConceptError);
    expect(() => validateRelationship('unknown', 'project', 'project')).toThrow(
      ConceptError,
    );
  });

  it('requires typed endpoints and rejects a relationship pointing to itself', () => {
    expect(() =>
      serializeConcept({ ...standard, type: 'relationship' }),
    ).toThrow('typed endpoints');
    expect(() =>
      serializeConcept({
        ...standard,
        id: edge,
        type: 'relationship',
        relationship: { type: 'impacts', sourceId: id, targetId: edge },
      }),
    ).toThrow('cannot use itself');
    const markdown = serializeConcept({
      ...standard,
      id: edge,
      type: 'relationship',
      relationship: { type: 'impacts', sourceId: id, targetId: other },
    });
    expect(
      parseConcept(remapConceptIds(markdown, new Map([[other, viewId]])))
        .relationship,
    ).toEqual({
      type: 'impacts',
      sourceId: id,
      targetId: viewId,
    });
  });

  const view = () =>
    serializeConcept({
      ...standard,
      id: viewId,
      type: 'view',
      view: {
        viewpoint: 'solution-context',
        objectIds: [id, other],
        relationshipIds: [edge],
      },
    });

  it('writes or clears positions without touching retained metadata or body', () => {
    const markdown = view()
      .replace('type: view', 'type: view # human note')
      .replace(
        'x-archimesh-model:',
        'x-unknown:\n  example: "007"\nx-archimesh-model:',
      )
      .replaceAll('\n', '\r\n');
    const positions = { [id]: { x: 12.5, y: -26 }, [other]: { x: 0, y: 25 } };
    const updated = withViewPositions(markdown, positions);
    expect(updated).toContain('type: view # human note');
    expect(updated).toContain('x-unknown:\r\n  example: "007"');
    expect(parseConcept(updated).body).toBe(parseConcept(markdown).body);
    expect(parseConcept(updated).view).toMatchObject({ positions });
    expect(parseConcept(withViewPositions(updated, {})).view).toMatchObject({
      positions: {},
    });
    expect(() =>
      withViewPositions(updated, { [edge]: { x: 0, y: 0 } }),
    ).toThrow('objects included in the view');
    expect(() =>
      withViewPositions(updated, { [id]: { x: 10001, y: 0 } }),
    ).toThrow(ConceptError);
  });

  it('remaps typed references together without altering unknown attributes or text', () => {
    const initial = withViewPositions(view(), { [id]: { x: 2, y: -1 } });
    const markdown = initial.replace(
      'positions:',
      'future_id: ' + id + '\n    positions:',
    );
    const next = remapConceptIds(
      markdown,
      new Map([
        [id, other],
        [other, id],
        [edge, viewId],
      ]),
    );
    expect(next).toContain('future_id: ' + id);
    expect(parseConcept(next).body).toBe(standard.body);
    expect(parseConcept(next).view).toEqual({
      viewpoint: 'solution-context',
      objectIds: [other, id],
      relationshipIds: [viewId],
      positions: { [other]: { x: 2, y: -1 } },
    });
    expect(remapConceptIds(markdown, new Map())).toBe(markdown);
    expect(() => remapConceptIds(markdown, new Map([[id, other]]))).toThrow(
      ConceptError,
    );
  });
});
