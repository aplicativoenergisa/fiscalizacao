"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cycleAt, formatTime } from "@/lib/cycle";
import type { Team } from "@/lib/team";
export type NonConformity = {
  id: string;
  team_id: number;
  inspection_id: number;
  description: string;
  status: "open" | "resolved";
  opened_at: string;
  resolved_at: string | null;
};
export function useNonConformities(db: SupabaseClient | null) {
  const [items, setItems] = useState<NonConformity[]>([]),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const seq = useRef(0);
  const refresh = useCallback(async () => {
    if (!db) return;
    const current = ++seq.current;
    try {
      const all: NonConformity[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await db
          .from("non_conformities")
          .select("*")
          .order("opened_at", { ascending: false })
          .order("id")
          .range(offset, offset + 999);
        if (current !== seq.current) return;
        if (result.error) throw result.error;
        all.push(...result.data);
        if (result.data.length < 1000) break;
      }
      setItems(all);
      setReady(true);
      setError("");
    } catch {
      if (current === seq.current)
        setError(
          "Não foi possível atualizar as não conformidades. Os dados podem estar desatualizados.",
        );
    }
  }, [db]);
  useEffect(() => {
    if (!db) return;
    const start = setTimeout(() => void refresh(), 0);
    const channel = db
      .channel("non-conformities")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "non_conformities" },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refresh();
      });
    const timer = setInterval(() => void refresh(), 15000);
    const resume = () => void refresh();
    window.addEventListener("online", resume);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
      // Invalidate outstanding requests on unmount or client replacement.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      seq.current++;
      void db.removeChannel(channel);
      window.removeEventListener("online", resume);
    };
  }, [db, refresh]);
  return { items, ready, error, refresh };
}
export function Metrics({
  values,
}: {
  values: { label: string; value: number | string; tone?: string }[];
}) {
  return (
    <section className="metrics" aria-label="Resumo">
      <>
        {values.map((v) => (
          <div className={`metric ${v.tone || ""}`} key={v.label}>
            <strong>{v.value}</strong>
            <span>{v.label}</span>
          </div>
        ))}
      </>
    </section>
  );
}
export function NonConformityDialog({
  team,
  items,
  db,
  canOpen,
  online,
  refresh,
  close,
}: {
  team: Team;
  items: NonConformity[];
  db: SupabaseClient | null;
  canOpen: boolean;
  online: boolean;
  refresh: () => Promise<void>;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    request = useRef<{ id: string; text: string } | null>(null);
  const [description, setDescription] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function save(id?: string) {
    if (!db || busy || !online) return;
    setBusy(true);
    setError("");
    setNotice("");
    if (!id && request.current?.text !== description.trim())
      request.current = { id: crypto.randomUUID(), text: description.trim() };
    try {
      const result = id
        ? await db.rpc("resolve_non_conformity", { p_id: id })
        : await db.rpc("open_non_conformity", {
            p_id: request.current!.id,
            p_team_id: team.id,
            p_description: request.current!.text,
          });
      if (result.error) throw result.error;
      if (!id) {
        setDescription("");
        request.current = null;
      }
      setNotice(
        id
          ? "Regularizada. Datas e histórico preservados."
          : "Não conformidade salva. Você pode registrar outra.",
      );
      await refresh();
    } catch (e) {
      setError(
        e &&
          typeof e === "object" &&
          "message" in e &&
          String(e.message).includes("INSPECTION_REQUIRED")
          ? "Confirme a fiscalização desta equipe no ciclo atual antes de abrir uma não conformidade."
          : "Não foi possível confirmar. Tente novamente: a repetição não duplica o registro.",
      );
    } finally {
      setBusy(false);
    }
  }
  const open = items.filter((n) => n.status === "open");
  return (
    <dialog
      ref={dialog}
      aria-labelledby="nc-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <div className="dialog-content nc-dialog">
        <div className="eyebrow">ACOMPANHAMENTO PERMANENTE</div>
        <h2 id="nc-title">Não conformidades · {team.name}</h2>
        <p className={open.length ? "nc-warning" : ""}>
          {open.length} em aberto · permanecem nos próximos ciclos.
        </p>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {canOpen ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label htmlFor="nc-description">
              Descrição da{" "}
              <span className="nc-label-red">não conformidade</span>
            </label>
            <textarea
              id="nc-description"
              required
              maxLength={2000}
              value={description}
              disabled={busy}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
            <button
              className="primary nc-save"
              disabled={busy || !online || !description.trim()}
            >
              Salvar não conformidade
            </button>
          </form>
        ) : (
          <p>
            Para abrir uma nova, confirme a fiscalização no ciclo atual. As
            anteriores podem ser regularizadas aqui.
          </p>
        )}
        <div className="nc-list">
          {items.map((n) => (
            <article
              className={`nc-item ${n.status === "resolved" ? "nc-item-resolved" : ""}`}
              key={n.id}
            >
              <div className="nc-item-text">
                <strong className={n.status === "open" ? "nc-warning" : ""}>
                  {n.status === "open" ? "Em aberto" : "Regularizada"}
                </strong>
                <p>{n.description}</p>
                <small>Aberta em {formatTime(n.opened_at)}</small>
                {n.resolved_at ? (
                  <small>Regularizada em {formatTime(n.resolved_at)}</small>
                ) : (
                  <button
                    className="cancel"
                    disabled={busy || !online}
                    onClick={() => void save(n.id)}
                  >
                    Marcar como regularizada
                  </button>
                )}
              </div>
              {n.status === "resolved" && (
                <span className="nc-resolved-check" aria-hidden="true">
                  ✓
                </span>
              )}
            </article>
          ))}
          {!items.length && <p>Nenhuma não conformidade registrada.</p>}
        </div>
        <button className="cancel nc-finish" disabled={busy} onClick={close}>
          Finalizar
        </button>
      </div>
    </dialog>
  );
}
export function HistoryInsights({
  teams,
  items,
  events,
  month,
  half,
  company,
  team,
  ready,
  loading,
}: {
  items: NonConformity[];
  teams: Team[];
  events: { action: string; cycle_id: string }[];
  month: string;
  half: string;
  company: string;
  team: string;
  ready: boolean;
  loading: boolean;
}) {
  const scoped = items.filter((n) =>
    team
      ? n.team_id === Number(team)
      : !company ||
        teams.find((t) => t.id === n.team_id)?.company_id === company,
  );
  const periods = [1, 2]
    .filter((h) => !half || String(h) === half)
    .map((h) => `${month}-C${h}`);
  const inPeriod = (date: string) =>
    periods.includes(cycleAt(new Date(date)).id);
  const opened = scoped.filter((n) => inPeriod(n.opened_at));
  const resolved = scoped.filter(
    (n) => n.resolved_at && inPeriod(n.resolved_at),
  );
  const bars = periods.map((c) => ({
    cycle: c,
    inspections: events.filter(
      (e) => e.action === "inspect" && e.cycle_id === c,
    ).length,
    opened: scoped.filter((n) => cycleAt(new Date(n.opened_at)).id === c)
      .length,
    resolved: scoped.filter(
      (n) => n.resolved_at && cycleAt(new Date(n.resolved_at)).id === c,
    ).length,
  }));
  const max = Math.max(
    1,
    ...bars.flatMap((b) => [b.inspections, b.opened, b.resolved]),
  );
  return (
    <section className="insights" aria-label="Indicadores do histórico">
      <h2>Resumo do período</h2>
      <p>
        Respeita os filtros acima. Fiscalizações contam confirmações, incluindo
        novas confirmações após retorno.
      </p>
      <Metrics
        values={[
          {
            label: "Fiscalizações no período",
            value: loading
              ? "—"
              : events.filter((e) => e.action === "inspect").length,
          },
          {
            label: "NC abertas no período",
            value: ready ? opened.length : "—",
            tone: "warning",
          },
          {
            label: "NC regularizadas no período",
            value: ready ? resolved.length : "—",
            tone: "success",
          },
        ]}
      />
      <p>
        Em aberto agora, em todos os ciclos deste filtro:{" "}
        <strong>
          {ready ? scoped.filter((n) => n.status === "open").length : "—"}
        </strong>
      </p>
      {!loading && ready && (
        <div className="cycle-chart" aria-label="Evolução por ciclo">
          {bars.map((b) => (
            <div key={b.cycle}>
              <h3>{b.cycle}</h3>
              {[
                { label: "Fiscalizações", value: b.inspections, tone: "" },
                { label: "NC abertas", value: b.opened, tone: "warning" },
                {
                  label: "NC regularizadas",
                  value: b.resolved,
                  tone: "success",
                },
              ].map((v) => (
                <div className={`chart-row ${v.tone}`} key={v.label}>
                  <span>
                    {v.label} <b>{v.value}</b>
                  </span>
                  <progress
                    value={v.value}
                    max={max}
                    aria-label={`${b.cycle}: ${v.label}`}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <details>
        <summary>Registro de não conformidades do período</summary>
        {scoped
          .filter(
            (n) =>
              inPeriod(n.opened_at) ||
              (n.resolved_at && inPeriod(n.resolved_at)),
          )
          .map((n) => (
            <article className="nc-item" key={n.id}>
              <strong>
                {teams.find((t) => t.id === n.team_id)?.name} ·{" "}
                {n.status === "open" ? "Em aberto" : "Regularizada"}
              </strong>
              <p>{n.description}</p>
              <small>Abertura: {formatTime(n.opened_at)}</small>
              <small>
                Regularização:{" "}
                {n.resolved_at ? formatTime(n.resolved_at) : "Pendente"}
              </small>
            </article>
          ))}
      </details>
    </section>
  );
}
