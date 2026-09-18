import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
test("NC: permanência entre ciclos, auditoria, idempotência e RLS", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create publication supabase_realtime;",
    );
    for (const file of [
      "202609170001_schema.sql",
      "202609170002_seed.sql",
      "202609180001_non_conformities.sql",
    ])
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    await db.exec("set role anon");
    const cycle = (
      await db.query<{ c: string }>("select current_inspection_cycle() c")
    ).rows[0].c;
    const id = randomUUID();
    const open = (description = "EPI danificado", key = id, team = 1) =>
      db.query("select * from open_non_conformity($1,$2,$3)", [
        key,
        team,
        description,
      ]);
    await assert.rejects(() => open(), /INSPECTION_REQUIRED/);
    await db.query("select set_inspection(1,$1,'inspect',0,$2)", [
      cycle,
      randomUUID(),
    ]);
    await assert.rejects(() => open("  "), /INVALID_DESCRIPTION/);
    await assert.rejects(() => open("a".repeat(2001)), /INVALID_DESCRIPTION/);
    await open();
    await open();
    await open("Sinalização ausente", randomUUID());
    await assert.rejects(() => open("Diferente"), /INVALID_REQUEST_ID/);
    await assert.rejects(
      () => open("EPI danificado", id, 2),
      /INVALID_REQUEST_ID/,
    );
    assert.equal(
      (await db.query("select * from non_conformities")).rows.length,
      2,
    );
    await assert.rejects(
      () => db.exec("delete from non_conformities"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.exec("update non_conformities set status='resolved'"),
      /permission denied/,
    );
    await db.query("select set_inspection(1,$1,'undo',1,$2)", [
      cycle,
      randomUUID(),
    ]);
    await assert.rejects(
      () => open("Nova", randomUUID()),
      /INSPECTION_REQUIRED/,
    );
    await db.exec(
      "reset role; create or replace function public.current_inspection_cycle() returns text language sql stable set search_path='' as $$select '2099-01-C1'::text$$; set role anon;",
    );
    const before = (
      await db.query<{ opened_at: Date }>(
        "select * from non_conformities where id=$1",
        [id],
      )
    ).rows[0];
    assert.equal(
      (await db.query("select * from non_conformities where status='open'"))
        .rows.length,
      2,
    );
    await Promise.all([
      db.query("select resolve_non_conformity($1)", [id]),
      db.query("select resolve_non_conformity($1)", [id]),
    ]);
    const after = (
      await db.query<{ opened_at: Date; resolved_at: Date; status: string }>(
        "select * from non_conformities where id=$1",
        [id],
      )
    ).rows[0];
    assert.deepEqual(after.opened_at, before.opened_at);
    assert.equal(after.status, "resolved");
    assert.ok(after.resolved_at);
    await db.query("select resolve_non_conformity($1)", [id]);
    assert.deepEqual(
      (
        await db.query<{ resolved_at: Date }>(
          "select resolved_at from non_conformities where id=$1",
          [id],
        )
      ).rows[0].resolved_at,
      after.resolved_at,
    );
    assert.equal((await db.query("select * from teams")).rows.length, 43);
    assert.equal(
      (await db.query("select * from inspection_events")).rows.length,
      2,
    );
    assert.equal(
      (await db.query("select * from non_conformities")).rows.length,
      2,
    );
  } finally {
    await db.close();
  }
});
