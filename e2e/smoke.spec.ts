import { expect, test } from '@playwright/test';

// Smoke journey: register -> dashboard -> create brand -> create product -> product is listed.
test('a new user can register, create a brand and a product', async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-${unique}@example.com`;
  const business = `E2E Business ${unique}`;
  const brandName = `E2E Brand ${unique}`;
  const productName = `E2E Product ${unique}`;

  // Register (the API signs the user in; email verification does not block).
  await page.goto('/auth/register');
  await page.getByLabel('Your name').fill('E2E Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('E2e-Passw0rd-123');
  await page.getByLabel('Business name').fill(business);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1, name: business })).toBeVisible();

  // Create a brand.
  await page.getByRole('link', { name: 'Brands', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Brands' })).toBeVisible();
  await page.getByRole('button', { name: 'New brand' }).click();
  await page.getByLabel('Name', { exact: true }).fill(brandName);
  await page.getByRole('button', { name: 'Save brand' }).click();
  await expect(page.getByRole('heading', { level: 2, name: brandName })).toBeVisible();

  // Create a product under that brand.
  await page.getByRole('link', { name: 'Products', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible();
  await page.getByRole('button', { name: 'New product' }).click();
  await page.getByLabel('Name', { exact: true }).fill(productName);
  // The <select> sits inside its <label>, so the accessible name is "Brand <selected option>": match the prefix.
  await page.getByRole('combobox', { name: /^Brand/ }).selectOption({ label: brandName });
  await page.getByRole('button', { name: 'Create product' }).click();

  // Creating redirects to the product detail page; go back to the list via navigation.
  await expect(page).toHaveURL(/\/products\/[^/]+$/);
  await page.getByRole('link', { name: 'Products', exact: true }).click();
  await expect(page).toHaveURL(/\/products$/);

  const row = page.getByRole('row', { name: new RegExp(productName) });
  await expect(row).toBeVisible();
  await expect(row).toContainText(brandName);
});
