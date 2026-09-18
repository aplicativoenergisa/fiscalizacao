import { test } from "node:test";
import assert from "node:assert/strict";
import teams from "../lib/teams.json" with { type: "json" };
import { cycleAt } from "../lib/cycle.ts";
test("43 equipes, nomes únicos e totais corretos", () => {
  assert.equal(teams.length, 43);
  assert.equal(new Set(teams.map((t) => t.name)).size, 43);
  assert.deepEqual(
    Object.fromEntries(
      ["DSX", "RALT", "ENGELMIG", "JVP"].map((c) => [
        c,
        teams.filter((t) => t.company_id === c).length,
      ]),
    ),
    { DSX: 6, RALT: 5, ENGELMIG: 17, JVP: 15 },
  );
});
test("virada dos ciclos usa meia-noite de Mato Grosso do Sul", () => {
  assert.equal(cycleAt(new Date("2026-09-16T03:59:59Z")).id, "2026-09-C1");
  assert.equal(cycleAt(new Date("2026-09-16T04:00:00Z")).id, "2026-09-C2");
  assert.equal(cycleAt(new Date("2026-10-01T03:59:59Z")).id, "2026-09-C2");
  assert.equal(cycleAt(new Date("2026-10-01T04:00:00Z")).id, "2026-10-C1");
});
test("fevereiro e virada do ano", () => {
  assert.match(
    cycleAt(new Date("2028-02-20T12:00:00Z")).period,
    /29\/02\/2028/,
  );
  assert.match(
    cycleAt(new Date("2027-02-20T12:00:00Z")).period,
    /28\/02\/2027/,
  );
  assert.equal(cycleAt(new Date("2027-01-01T04:00:00Z")).id, "2027-01-C1");
});
