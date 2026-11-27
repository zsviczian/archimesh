import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('finds a reusable supplier provider and inspects its data responsibility', async ({
  page,
}) => {
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: 'Search repository' });
  await search.fill('Supplier Intake');
  await page.getByRole('link', { name: /^Supplier Onboarding\b/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Supplier Onboarding', exact: true }),
  ).toBeVisible();

  const inspector = page.getByRole('complementary', {
    name: 'Object inspector',
  });
  await inspector.getByRole('button', { name: 'Relationships' }).click();
  await inspector
    .getByRole('link', {
      name: /Supplier Harbor North provides Supplier Onboarding/,
    })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Supplier Harbor North provides Supplier Onboarding',
    }),
  ).toBeVisible();

  await search.fill('');
  await page
    .getByRole('navigation', { name: 'Repository navigation' })
    .getByRole('button', { name: 'Saved views' })
    .click();
  await page
    .getByRole('link', { name: /^Supplier and Order Data Responsibility\b/ })
    .click();
  await page.getByRole('link', { name: 'Model diagram' }).click();
  await page.getByRole('button', { name: 'Matrix' }).click();
  const supplierRow = page.getByRole('row', {
    name: /^Supplier Harbor North\b/,
  });
  await expect(
    supplierRow.getByRole('link', { name: 'Creates', exact: true }),
  ).toBeVisible();
  await supplierRow.getByRole('link', { name: 'Masters', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Supplier Harbor North masters North supplier identity',
    }),
  ).toBeVisible();
});

test('hides a previously viewed private project after changing contractors', async ({
  page,
}) => {
  await page.goto('/');
  const identity = page.getByLabel('Local demo identity');
  await identity.selectOption('contractor-procurement');
  const search = page.getByRole('searchbox', { name: 'Search repository' });
  await search.fill('Procurement Modernization');
  await page
    .getByRole('link', {
      name: /^Procurement Modernization Replace North Works/,
    })
    .click();
  const privateHeading = page.getByRole('heading', {
    name: 'Procurement Modernization',
    exact: true,
  });
  await expect(privateHeading).toBeVisible();
  const privateUrl = page.url();

  await identity.selectOption('contractor-integration');
  await expect(
    page.getByRole('heading', { name: 'Object unavailable' }),
  ).toBeVisible();
  await expect(privateHeading).toHaveCount(0);
  await expect(page).toHaveURL(privateUrl);

  await search.fill('Freight Event Integration');
  await page
    .getByRole('link', {
      name: /^Freight Event Integration Deliver replayable/,
    })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Freight Event Integration',
      exact: true,
    }),
  ).toBeVisible();
});

test('creates and edits a procurement object and opens its earlier Markdown revision', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByLabel('Local demo identity')
    .selectOption('contractor-procurement');
  await page.getByRole('button', { name: 'New object', exact: true }).click();
  const editor = page.getByRole('dialog');
  const title = `Procurement handoff ${randomUUID().slice(0, 8)}`;
  const before = 'Collect supplier onboarding evidence.';
  const after = 'Collect and validate supplier onboarding evidence.';

  await editor.getByLabel('Object type').selectOption('capability');
  await editor.getByLabel('Title', { exact: true }).fill(title);
  await editor.getByLabel('Markdown body').fill(before);
  await editor.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(editor.getByText('Validation passed.')).toBeVisible();
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(before, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Edit Markdown' }).click();
  const source = editor.getByLabel('YAML and Markdown');
  const current = await source.inputValue();
  expect(current).toContain(before);
  await source.fill(current.replace(before, after));
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(after, { exact: true })).toBeVisible();

  const inspector = page.getByRole('complementary', {
    name: 'Object inspector',
  });
  await inspector.getByRole('button', { name: 'History' }).click();
  const revisions = inspector.getByRole('link', {
    name: /contractor-procurement/,
  });
  await expect(revisions).toHaveCount(2);
  await revisions.last().click();
  await expect(page.getByText(before, { exact: true })).toBeVisible();
  await expect(page.getByText(after, { exact: true })).toHaveCount(0);
});

test('shows a pinned future proposal and withholds it after a scope switch', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Repository navigation' })
    .getByRole('button', { name: 'Scenarios' })
    .click();
  await page
    .getByRole('link', { name: 'Activate the proposed supplier integration' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Recorded baseline' }),
  ).toBeVisible();
  await expect(page.getByText(/Effective .*2030/)).toBeVisible();
  const proposalUrl = page.url();

  await page
    .getByLabel('Local demo identity')
    .selectOption('contractor-integration');
  await expect(
    page.getByRole('heading', { name: 'Scenario unavailable' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Recorded baseline' }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(proposalUrl);
});

test('authors and validates a first-class integration edge in a writable scope', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByLabel('Local demo identity')
    .selectOption('contractor-procurement');
  await page
    .getByRole('navigation', { name: 'Repository navigation' })
    .getByRole('button', { name: 'Relationship', exact: true })
    .click();
  await page.getByRole('button', { name: 'New relationship' }).click();

  const editor = page.getByRole('dialog');
  const title = `Procurement integration edge ${randomUUID().slice(0, 8)}`;
  await editor.getByLabel('Title', { exact: true }).fill(title);
  await editor.getByLabel('Relationship type').selectOption('integrates-with');
  await editor.getByLabel('Search source object').fill('Supplier Harbor North');
  await editor.getByRole('button', { name: /^Supplier Harbor North/ }).click();
  await editor.getByLabel('Search target object').fill('Ledgerline North');
  await editor.getByRole('button', { name: /^Ledgerline North/ }).click();
  await editor
    .getByLabel('Markdown body')
    .fill('Connection proposed during procurement modeling.');
  await editor.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(editor.getByText('Validation passed.')).toBeVisible();
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Connection proposed during procurement modeling.'),
  ).toBeVisible();
});
