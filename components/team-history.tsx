"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Team } from "@/lib/team";
import type { NonConformity } from "./non-conformities";
import { formatTime } from "@/lib/cycle";
export function TeamSearch({
  teams,
  ready,
  select,
}: {
  teams: Team[];
  ready: boolean;
  select: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLocaleLowerCase("pt-BR");
  const matches = term
    ? teams
        .filter((t) => t.name.toLocaleLowerCase("pt-BR").includes(term))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    : [];
  return (
    <section className="team-search" aria-label="Buscar equipe">
      <label htmlFor="team-search">Buscar equipe</label>
      <input
        id="team-search"
        type="search"
        placeholder="Buscar equipe"
        value={query}
        disabled={!ready}
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
      />
      {term && (
        <div className="team-suggestions">
          <ul>
            {matches.map((team) => (
              <li key={team.id}>
                <button onClick={() => select(team.id)}>
                  <strong>{team.name}</strong>
                  <small>
                    {team.company_id} · {team.active ? "Ativa" : "Inativa"}
                  </small>
                </button>
              </li>
            ))}
          </ul>
          {!matches.length && <p role="status">Nenhuma equipe encontrada.</p>}
        </div>
      )}
    </section>
  );
}
type InspectionEvent = {
  id: number;
  team_id: number;
  cycle_id: string;
  action: "inspect" | "undo";
  occurred_at: string;
};
export function TeamHistory({
  team,
  db,
  items,
  ncReady,
  ncError,
  back,
}: {
  team: Team;
  db: SupabaseClient | null;
  items: NonConformity[];
  ncReady: boolean;
  ncError: string;
  back: () => void;
}) {
  const [events, setEvents] = useState<InspectionEvent[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!db) return;
    const seq = ++sequence.current;
    try {
      const all: InspectionEvent[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await db
          .from("inspection_events")
          .select("id,team_id,cycle_id,action,occurred_at")
          .eq("team_id", team.id)
          .order("occurred_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + 999);
        if (seq !== sequence.current) return;
        if (result.error) throw result.error;
        all.push(...result.data);
        if (result.data.length < 1000) break;
      }
      setEvents(all.filter((e) => e.team_id === team.id));
      setError("");
    } catch {
      if (seq === sequence.current)
        setError("Não foi possível atualizar o histórico desta equipe.");
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }, [db, team.id]);
  useEffect(() => {
    if (!db) return;
    const start = setTimeout(() => void refresh(), 0);
    const channel = db
      .channel(`team-history-${team.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "inspection_events",
          filter: `team_id=eq.${team.id}`,
        },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refresh();
      });
    const timer = setInterval(() => void refresh(), 15000);
    const resume = () => void refresh();
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
      void db.removeChannel(channel);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [db, team.id, refresh]);
  const findings = items
    .filter((n) => n.team_id === team.id)
    .toSorted((a, b) => b.opened_at.localeCompare(a.opened_at));
  return (
    <section className="team-history">
      <button className="back" onClick={back}>
        ← Empresas
      </button>
      <div className="eyebrow">Histórico da equipe</div>
      <h1>{team.name}</h1>
      <p className="subtitle">
        {team.company_id} · {team.active ? "Ativa" : "Inativa"}
      </p>
      <h2>Fiscalizações</h2>
      <p className="hint">Todos os ciclos · mais recentes primeiro</p>
      {error && (
        <div role="alert" className="alert">
          {error}
          <button onClick={() => void refresh()}>Tentar novamente</button>
        </div>
      )}
      {loading ? (
        <p role="status">Carregando fiscalizações…</p>
      ) : !error && !events.length ? (
        <p>Nenhuma fiscalização registrada.</p>
      ) : null}
      <div className="events">
        {events.map((event) => (
          <article className="event" key={event.id}>
            <div>
              <strong>
                {event.action === "inspect"
                  ? "Fiscalizada"
                  : "Retornou para A Fiscalizar"}
              </strong>
              <p>{formatTime(event.occurred_at)}</p>
              <small>{event.cycle_id}</small>
            </div>
          </article>
        ))}
      </div>
      <h2>Não conformidades</h2>
      <p className="hint">Registros permanentes · independentes do ciclo</p>
      {ncError ? (
        <p className="alert" role="alert">
          {ncError}
        </p>
      ) : !ncReady ? (
        <p role="status">Carregando não conformidades…</p>
      ) : !findings.length ? (
        <p>Nenhuma não conformidade registrada.</p>
      ) : null}
      {ncReady &&
        findings.map((n) => (
          <article className="nc-item" key={n.id}>
            <strong
              className={
                n.status === "open" ? "nc-warning" : "team-history-resolved"
              }
            >
              {n.status === "open" ? "Em aberto" : "Regularizada"}
            </strong>
            <p>{n.description}</p>
            <small>Aberta em {formatTime(n.opened_at)}</small>
            {n.resolved_at && (
              <small>Regularizada em {formatTime(n.resolved_at)}</small>
            )}
          </article>
        ))}
    </section>
  );
}
