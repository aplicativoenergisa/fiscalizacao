import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
test("equipes: cadastro, duplicidade por empresa, edição, inativação e auditoria", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create publication supabase_realtime;",
    );
    for (const name of [
      "202609170001_schema.sql",
      "202609170002_seed.sql",
      "202609180001_non_conformities.sql",
      "202609180002_team_management.sql",
    ])
      await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
    await db.exec("set role anon");
    const save = (
      name: string,
      company = "RALT",
      id: number | null = null,
      active = true,
      version = 0,
      request = randomUUID(),
    ) =>
      db.query<{ id: number; active: boolean; version: number }>(
        "select * from save_team($1,$2,$3,$4,$5,$6,$7)",
        [request, id, company, name, "PESADA", active, version],
      );
    const request = randomUUID();
    const created = (await save("NOVA  01", "RALT", null, true, 0, request))
      .rows[0];
    assert.equal(created.id, 44);
    assert.equal(created.active, true);
    assert.equal(
      (await save("NOVA  01", "RALT", null, true, 0, request)).rows[0].id,
      44,
    );
    await assert.rejects(() => save(" nova 01 "), /DUPLICATE_TEAM/);
    await save("nova 01", "DSX");
    await assert.rejects(() => save("X", "QUINTA"), /INVALID_TEAM/);
    await assert.rejects(() => save("   "), /INVALID_TEAM/);
    await assert.rejects(
      () => db.exec("insert into companies values('QUINTA','QUINTA')"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.exec("delete from teams where id=44"),
      /permission denied/,
    );
    const cycle = (
      await db.query<{ c: string }>("select current_inspection_cycle() c")
    ).rows[0].c;
    assert.equal(
      (await db.query("select * from inspections where team_id=44")).rows
        .length,
      0,
    );
    await db.query("select set_inspection(44,$1,'inspect',0,$2)", [
      cycle,
      randomUUID(),
    ]);
    const nc = randomUUID();
    await db.query("select open_non_conformity($1,44,'Registro permanente')", [
      nc,
    ]);
    await save("CORRIGIDA 01", "RALT", 44, false, 0);
    await assert.rejects(
      () => save("PERDIDA", "RALT", 44, true, 0),
      /STALE_TEAM/,
    );
    await assert.rejects(() => save("corrigida 01"), /DUPLICATE_TEAM/);
    assert.equal(
      (await db.query("select * from inspection_events where team_id=44")).rows
        .length,
      1,
    );
    await assert.rejects(
      () => db.exec("delete from teams where id=44"),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.query("select open_non_conformity($1,44,'Inativa')", [randomUUID()]),
      /TEAM_INACTIVE/,
    );
    await db.query("select resolve_non_conformity($1)", [nc]);
    await db.exec(
      "reset role; create or replace function public.current_inspection_cycle() returns text language sql stable set search_path='' as $$select '2099-01-C1'::text$$; set role anon;",
    );
    await assert.rejects(
      () =>
        db.query("select set_inspection(44,'2099-01-C1','inspect',0,$1)", [
          randomUUID(),
        ]),
      /TEAM_INACTIVE/,
    );
    await save("CORRIGIDA 01", "RALT", 44, true, 1);
    await db.query("select set_inspection(44,'2099-01-C1','inspect',0,$1)", [
      randomUUID(),
    ]);
    assert.equal(
      (await db.query("select * from inspection_events where team_id=44")).rows
        .length,
      2,
    );
    assert.equal(
      (await db.query("select * from non_conformities where team_id=44")).rows
        .length,
      1,
    );
    assert.equal(
      (await db.query("select * from team_events where team_id=44")).rows
        .length,
      3,
    );
    await assert.rejects(
      () => db.exec("delete from team_events"),
      /permission denied/,
    );
    const race = await Promise.allSettled([
      save("Concorrente"),
      save(" concorrente "),
    ]);
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  } finally {
    await db.close();
  }
});
