import { test, expect } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
test("duas sessões mobile: marcar, Realtime simulado, recarregar, desfazer e histórico", async ({
  browser,
}) => {
  const db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create publication supabase_realtime;",
  );
  await db.exec(
    readFileSync("supabase/migrations/202609170001_schema.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/202609170002_seed.sql", "utf8"),
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
  const subscribers: ((table: string) => void)[] = [];
  for (const context of contexts) {
    await context.routeWebSocket("**/realtime/v1/websocket*", (ws) => {
      ws.onMessage((message) => {
        const raw = JSON.parse(String(message));
        const packet = Array.isArray(raw)
          ? {
              join_ref: raw[0],
              ref: raw[1],
              topic: raw[2],
              event: raw[3],
              payload: raw[4],
            }
          : raw;
        const send = (
          event: string,
          payload: object,
          ref: string | null = null,
        ) =>
          ws.send(
            JSON.stringify(
              Array.isArray(raw)
                ? [packet.join_ref, ref, packet.topic, event, payload]
                : { topic: packet.topic, event, payload, ref },
            ),
          );
        if (packet.event === "phx_join") {
          const changes = packet.payload.config?.postgres_changes ?? [];
          send(
            "phx_reply",
            {
              status: "ok",
              response: {
                postgres_changes: changes.map((c: object, i: number) => ({
                  ...c,
                  id: i + 1,
                })),
              },
            },
            packet.ref,
          );
          send("system", {
            extension: "postgres_changes",
            status: "ok",
            message: "Subscribed to PostgreSQL",
          });
          subscribers.push((table) => {
            const index = changes.findIndex(
              (c: { table: string }) => c.table === table,
            );
            if (index >= 0)
              send("postgres_changes", {
                ids: [index + 1],
                data: {
                  schema: "public",
                  table,
                  type: table === "inspection_events" ? "INSERT" : "UPDATE",
                  commit_timestamp: new Date().toISOString(),
                  record: {},
                  old_record: {},
                  errors: null,
                },
              });
          });
        }
        if (packet.event === "heartbeat" || packet.event === "phx_leave")
          send("phx_reply", { status: "ok", response: {} }, packet.ref);
      });
    });
    await context.route("http://localhost:54321/rest/v1/**", async (route) => {
      const url = new URL(route.request().url()),
        body = route.request().postDataJSON();
      try {
        let data: unknown;
        if (url.pathname.endsWith("/rpc/current_inspection_cycle"))
          data = (
            await db.query<{ c: string }>("select current_inspection_cycle() c")
          ).rows[0].c;
        else if (url.pathname.endsWith("/rpc/set_inspection")) {
          data = (
            await db.query("select * from set_inspection($1,$2,$3,$4,$5)", [
              body.p_team_id,
              body.p_cycle_id,
              body.p_action,
              body.p_expected_version,
              body.p_request_id,
            ])
          ).rows[0];
          setTimeout(
            () =>
              subscribers.forEach((send) => {
                send("inspections");
                send("inspection_events");
              }),
            20,
          );
        } else if (url.pathname.endsWith("/inspections"))
          data = (
            await db.query("select * from inspections where cycle_id=$1", [
              url.searchParams.get("cycle_id")?.slice(3),
            ])
          ).rows;
        else
          data = (
            await db.query("select * from inspection_events order by id desc")
          ).rows;
        await route.fulfill({ json: data });
      } catch (error) {
        await route.fulfill({ status: 400, json: { message: String(error) } });
      }
    });
  }
  const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
  await Promise.all([
    a.goto("http://localhost:3001"),
    b.goto("http://localhost:3001"),
  ]);
  await expect(a.getByText("Ao vivo", { exact: false })).toBeVisible();
  for (const page of [a, b])
    await page.getByRole("button", { name: /Logo RALT/ }).click();
  await a.getByRole("button", { name: /RAL-B2 01/ }).click();
  await a.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(a.getByRole("button", { name: /RAL-B2 01/ })).toBeVisible();
  await a.getByRole("button", { name: /RAL-B2 01/ }).click();
  await a
    .getByRole("button", { name: "Confirmar fiscalização", exact: true })
    .click();
  await expect(a.getByRole("button", { name: /RAL-B2 01/ })).toHaveCount(0);
  await expect(b.getByRole("button", { name: /RAL-B2 01/ })).toHaveCount(0, {
    timeout: 5000,
  });
  await b.reload();
  await b.getByRole("button", { name: /Logo RALT/ }).click();
  await b.getByRole("tab", { name: /Finalizadas/ }).click();
  const card = b.getByRole("button", { name: /RAL-B2 01/ });
  await expect(card).toHaveClass(/done/);
  await card.click();
  await b
    .getByRole("button", { name: "Retornar para A Fiscalizar", exact: true })
    .click();
  await expect(a.getByRole("button", { name: /RAL-B2 01/ })).toBeVisible({
    timeout: 5000,
  });
  await a.getByRole("button", { name: /Histórico/ }).click();
  await expect(a.locator(".event")).toHaveCount(2);
  await expect(
    a.getByText("Retornou para A Fiscalizar", { exact: true }),
  ).toBeVisible();
  for (const page of [a, b]) {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/${page === a ? "iphone" : "android"}.png`,
      fullPage: true,
    });
  }
  await b.getByRole("button", { name: /Empresas/ }).click();
  await b.screenshot({ path: "test-results/home.png", fullPage: true });
  const manifest = await (await b.request.get("/manifest.json")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toHaveLength(3);
  await b.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await Promise.all(contexts.map((c) => c.close()));
  await db.close();
});
