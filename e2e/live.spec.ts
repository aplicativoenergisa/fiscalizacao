import { test, expect } from "@playwright/test";
test("Supabase real: duas sessões recebem marcação e retorno, histórico e recarga", async ({
  browser,
}) => {
  test.skip(
    process.env.RUN_LIVE_SUPABASE !== "yes",
    "Teste opt-in: cria dois eventos reais permanentes.",
  );
  const contexts = await Promise.all([
    browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    browser.newContext({
      viewport: { width: 412, height: 915 },
      isMobile: true,
      hasTouch: true,
    }),
  ]);
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const [a, b] = pages;
  await Promise.all(pages.map((page) => page.goto("http://localhost:3002")));
  for (const page of pages) {
    await expect(page.getByText("Ao vivo", { exact: false })).toBeVisible({
      timeout: 20000,
    });
    await page.getByRole("button", { name: /Logo RALT/ }).click();
  }
  const team = "RAL-B2 01";
  await expect(a.getByRole("button", { name: new RegExp(team) })).toBeVisible();
  await a.getByRole("button", { name: new RegExp(team) }).click();
  await a
    .getByRole("button", { name: "Confirmar fiscalização", exact: true })
    .click();
  await expect(a.getByRole("button", { name: new RegExp(team) })).toHaveCount(
    0,
  );
  await expect(b.getByRole("button", { name: new RegExp(team) })).toHaveCount(
    0,
    { timeout: 5000 },
  );
  await b.getByRole("tab", { name: /Finalizadas/ }).click();
  await expect(b.getByRole("button", { name: new RegExp(team) })).toHaveClass(
    /done/,
  );
  await b.screenshot({
    path: "test-results/live-finalizadas.png",
    fullPage: true,
  });
  await b.reload();
  await b.getByRole("button", { name: /Logo RALT/ }).click();
  await b.getByRole("tab", { name: /Finalizadas/ }).click();
  await b.getByRole("button", { name: new RegExp(team) }).click();
  await b
    .getByRole("button", { name: "Retornar para A Fiscalizar", exact: true })
    .click();
  await expect(a.getByRole("button", { name: new RegExp(team) })).toBeVisible({
    timeout: 5000,
  });
  await a.getByRole("button", { name: /Histórico/ }).click();
  await a
    .getByRole("combobox", { name: "Equipe", exact: true })
    .selectOption("7");
  await expect(
    a.locator(".event").filter({ hasText: "Retornou para A Fiscalizar" }),
  ).not.toHaveCount(0);
  await expect(
    a.locator(".event").filter({ hasText: "Fiscalizada" }),
  ).not.toHaveCount(0);
  await a.screenshot({
    path: "test-results/live-historico.png",
    fullPage: true,
  });
  await Promise.all(contexts.map((context) => context.close()));
});
