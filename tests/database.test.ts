import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
test("migrations: RLS, marcar/desfazer, duplicidade, auditoria e novo ciclo", async () => {
  const db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create publication supabase_realtime;",
  );
  await db.exec(
    readFileSync("supabase/migrations/202609170001_schema.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/202609170002_seed.sql", "utf8"),
  );
  assert.equal(
    (await db.query<{ n: number }>("select count(*)::int n from teams")).rows[0]
      .n,
    43,
  );
  await db.exec("set role anon");
  const cycle = (
    await db.query<{ c: string }>("select current_inspection_cycle() c")
  ).rows[0].c;
  const run = (action: string, version: number, id = randomUUID(), c = cycle) =>
    db.query("select * from set_inspection($1,$2,$3,$4,$5)", [
      1,
      c,
      action,
      version,
      id,
    ]);
  await assert.rejects(
    () =>
      db.exec(
        "insert into inspections(team_id,cycle_id) values(1,'2026-09-C1')",
      ),
    /permission denied/,
  );
  const id = randomUUID();
  await run("inspect", 0, id);
  await run("inspect", 0, id); // retry is idempotent
  await assert.rejects(() => run("inspect", 0), /STALE_STATE/);
  await assert.rejects(() => run("undo", 0), /STALE_STATE/);
  await run("undo", 1);
  assert.equal(
    (
      await db.query<{ inspected_at: null }>(
        "select inspected_at from inspections",
      )
    ).rows[0].inspected_at,
    null,
  );
  assert.equal(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from inspection_events",
      )
    ).rows[0].n,
    2,
  );
  await run("inspect", 2);
  await assert.rejects(
    () => db.exec("delete from inspection_events"),
    /permission denied/,
  );
  await assert.rejects(
    () => db.exec("update teams set name='alterada'"),
    /permission denied/,
  );
  await assert.rejects(
    () => run("inspect", 0, randomUUID(), "1900-01-C1"),
    /CYCLE_CHANGED/,
  );
  await assert.rejects(() => run("invalid", 3), /INVALID_OPERATION/);
  await db.exec(
    "reset role; create or replace function public.current_inspection_cycle() returns text language sql stable set search_path='' as $$select '2099-01-C1'::text$$; set role anon;",
  );
  await run("inspect", 0, randomUUID(), "2099-01-C1");
  assert.equal(
    (await db.query<{ n: number }>("select count(*)::int n from inspections"))
      .rows[0].n,
    2,
  );
  assert.equal(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from inspection_events",
      )
    ).rows[0].n,
    4,
  );
  await db.exec(
    "reset role; create or replace function public.current_inspection_cycle() returns text language sql stable set search_path='' as $$select '2099-01-C2'::text$$; set role anon;",
  );
  const simultaneous = await Promise.allSettled([
    run("inspect", 0, randomUUID(), "2099-01-C2"),
    run("inspect", 0, randomUUID(), "2099-01-C2"),
  ]);
  assert.equal(simultaneous.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from inspection_events",
      )
    ).rows[0].n,
    5,
  );
  for (let version = 1; version <= 7; version++)
    await run(
      version % 2 ? "undo" : "inspect",
      version,
      randomUUID(),
      "2099-01-C2",
    );
  await assert.rejects(
    () => run("inspect", 8, randomUUID(), "2099-01-C2"),
    /RATE_LIMIT/,
  );
  await db.close();
});
