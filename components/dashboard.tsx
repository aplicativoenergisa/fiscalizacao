"use client";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import teams from "@/lib/teams.json";
import { cycleAt, formatTime } from "@/lib/cycle";
import { getSupabase } from "@/lib/supabase";

type Team = (typeof teams)[number];
type Inspection = {
  team_id: number;
  cycle_id: string;
  inspected_at: string | null;
  version: number;
};
type Event = {
  id: number;
  team_id: number;
  cycle_id: string;
  action: "inspect" | "undo";
  occurred_at: string;
  version: number;
};
const companies = ["RALT", "JVP", "DSX", "ENGELMIG"];
export default function Dashboard() {
  const [db] = useState(getSupabase);
  const [cycle, setCycle] = useState<ReturnType<typeof cycleAt> | null>(null);
  const [rows, setRows] = useState<Inspection[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [company, setCompany] = useState<string | null>(null);
  const [page, setPage] = useState<"companies" | "history">("companies");
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [connection, setConnection] = useState("Conectando…");
  const [online, setOnline] = useState(true);
  const [selected, setSelected] = useState<{
    team: Team;
    row?: Inspection;
    cycle: string;
  } | null>(null);
  const [month, setMonth] = useState(""),
    [half, setHalf] = useState(""),
    [filterCompany, setFilterCompany] = useState(""),
    [filterTeam, setFilterTeam] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    sequence = useRef(0),
    historySequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!db) return;
    const seq = ++sequence.current;
    const current = await db.rpc("current_inspection_cycle");
    if (current.error) {
      if (seq === sequence.current) {
        setError(
          "Não foi possível consultar o ciclo. Verifique a conexão e as migrations.",
        );
        setLoading(false);
      }
      return;
    }
    const result = await db
      .from("inspections")
      .select("*")
      .eq("cycle_id", current.data);
    if (seq !== sequence.current) return;
    if (result.error)
      setError(
        "Não foi possível atualizar os dados. Tente novamente antes de registrar.",
      );
    else {
      const [year, month, half] = String(current.data).split("-");
      setCycle(
        cycleAt(
          new Date(`${year}-${month}-${half === "C1" ? "01" : "16"}T12:00:00Z`),
        ),
      );
      setRows(result.data);
      setError("");
    }
    setLoading(false);
  }, [db]);
  const loadHistory = useCallback(async () => {
    if (!db || !month) return;
    const seq = ++historySequence.current;
    setHistoryLoading(true);
    const all: Event[] = [];
    for (let offset = 0; ; offset += 1000) {
      let query = db
        .from("inspection_events")
        .select("*")
        .like("cycle_id", `${month}-C${half || "%"}`)
        .order("id", { ascending: false })
        .range(offset, offset + 999);
      if (filterTeam) query = query.eq("team_id", Number(filterTeam));
      else if (filterCompany)
        query = query.in(
          "team_id",
          teams.filter((t) => t.company_id === filterCompany).map((t) => t.id),
        );
      const result = await query;
      if (seq !== historySequence.current) return;
      if (result.error) {
        setError("Não foi possível carregar o histórico.");
        setHistoryLoading(false);
        return;
      }
      all.push(...result.data);
      if (result.data.length < 1000) break;
    }
    setEvents(all);
    setHistoryLoading(false);
  }, [db, month, half, filterCompany, filterTeam]);
  useEffect(() => {
    const initialTimer = setTimeout(() => {
      const initial = cycleAt();
      setCycle(initial);
      setMonth(initial.month);
      if (!db) {
        setLoading(false);
        setConnection("Configuração pendente");
      } else void refresh();
    }, 0);
    if (!db) return () => clearTimeout(initialTimer);
    const channel = db
      .channel("fiscalizacao")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inspections" },
        () => void refresh(),
      )
      .on("system", {}, (payload) => {
        if (
          payload.extension === "postgres_changes" &&
          payload.status === "ok"
        ) {
          setConnection("Ao vivo");
          void refresh();
        }
      })
      .subscribe((status) => {
        setConnection(
          status === "SUBSCRIBED" ? "Sincronizando…" : "Reconectando…",
        );
        if (status === "SUBSCRIBED") void refresh();
      });
    const timer = setInterval(() => void refresh(), 15000);
    const resume = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void refresh();
    };
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
      void db.removeChannel(channel);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [db, refresh]);
  useEffect(() => {
    if (page !== "history" || !db) return;
    const initialTimer = setTimeout(() => void loadHistory(), 0);
    const channel = db
      .channel("history")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inspection_events" },
        () => void loadHistory(),
      )
      .subscribe();
    const timer = setInterval(() => void loadHistory(), 15000);
    return () => {
      clearTimeout(initialTimer);
      void db.removeChannel(channel);
      clearInterval(timer);
    };
  }, [page, db, loadHistory]);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() =>
          setNotice(
            "Instalação indisponível neste navegador. O app continua acessível por esta página.",
          ),
        );
  }, []);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  const indexed = useMemo(
    () => new Map(rows.map((row) => [row.team_id, row])),
    [rows],
  );
  const done = rows.filter((row) => row.inspected_at).length;
  async function confirm() {
    if (!db || !selected || busy) return;
    setBusy(true);
    setError("");
    const result = await db.rpc("set_inspection", {
      p_team_id: selected.team.id,
      p_cycle_id: selected.cycle,
      p_action: selected.row?.inspected_at ? "undo" : "inspect",
      p_expected_version: selected.row?.version ?? 0,
      p_request_id: crypto.randomUUID(),
    });
    if (result.error) {
      setNotice("");
      setError(
        result.error.message.includes("STALE_STATE")
          ? "Esta equipe foi alterada em outro celular. Os dados foram atualizados; confira antes de tentar novamente."
          : result.error.message.includes("CYCLE_CHANGED")
            ? "O ciclo mudou. Confira o ciclo atual antes de confirmar."
            : result.error.message.includes("RATE_LIMIT")
              ? "Muitas alterações nesta equipe. Aguarde um minuto."
              : "Não foi possível confirmar a operação. Atualize os dados para conferir se ela foi registrada antes de tentar novamente.",
      );
    } else {
      const row = (
        Array.isArray(result.data) ? result.data[0] : result.data
      ) as Inspection;
      sequence.current++;
      setRows((old) => [...old.filter((r) => r.team_id !== row.team_id), row]);
      setNotice(
        selected.row?.inspected_at
          ? "Equipe retornou para A Fiscalizar. Histórico preservado."
          : "Fiscalização registrada com sucesso.",
      );
    }
    setSelected(null);
    setBusy(false);
    if (result.error) void refresh();
  }
  const shown = teams.filter(
    (t) =>
      t.company_id === company &&
      (tab === "done"
        ? !!indexed.get(t.id)?.inspected_at
        : !indexed.get(t.id)?.inspected_at),
  );
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">✓</span>
          <span>
            Fiscalização<small>EQUIPES DE CAMPO</small>
          </span>
        </div>
        <span className={`connection ${online ? "" : "offline"}`}>
          ● {online ? connection : "Sem conexão"}
        </span>
      </header>
      <main>
        {!db && (
          <div className="alert" role="alert">
            <strong>Conecte o Supabase para começar</strong>
            <p>
              Configure NEXT_PUBLIC_SUPABASE_URL e
              NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY e aplique as migrations do
              projeto. Os cartões abaixo mostram o cadastro; registros estão
              desativados.
            </p>
          </div>
        )}
        {!online && (
          <div className="alert" role="alert">
            Sem conexão. As informações podem estar desatualizadas. Reconecte-se
            para registrar.
          </div>
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
            <button
              onClick={() => {
                void refresh();
                if (page === "history") void loadHistory();
              }}
            >
              Atualizar dados
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
        {page === "companies" && !company && (
          <>
            <div className="eyebrow">CONTROLE QUINZENAL</div>
            <h1>Um ciclo. Todas as equipes.</h1>
            <p className="subtitle">
              Escolha uma empresa para registrar a fiscalização.
            </p>
            <section className="summary" aria-label="Progresso geral">
              <div className="summary-top">
                <span>
                  Ciclo {cycle?.half ?? "—"} <b>•</b>{" "}
                  {cycle?.month.split("-").reverse().join("/")}
                </span>
                <span>{cycle?.id}</span>
              </div>
              <p className="period">{cycle?.period} · horário de MS</p>
              <div className="numbers">
                <strong>
                  {db && !loading ? done : "—"}
                  <span> / 43</span>
                </strong>
                <span>
                  {db && !loading ? Math.round((done / 43) * 100) : "—"}%
                  <small>concluído</small>
                </span>
              </div>
              <progress
                max={43}
                value={db ? done : 0}
                aria-label="Equipes fiscalizadas"
              />
              <p>
                {db && !loading
                  ? `Faltam ${43 - done} equipes neste ciclo`
                  : "Aguardando dados do Supabase"}
              </p>
            </section>
            <div className="section-title">
              <h2>Empresas</h2>
              <span>4 empresas · 43 equipes</span>
            </div>
            <div className="companies">
              {companies.map((name) => {
                const list = teams.filter((t) => t.company_id === name),
                  count = list.filter(
                    (t) => indexed.get(t.id)?.inspected_at,
                  ).length;
                return (
                  <button
                    className="company-card"
                    key={name}
                    onClick={() => {
                      setCompany(name);
                      setTab("pending");
                      setNotice("");
                    }}
                  >
                    <span className={`logo logo-${name.toLowerCase()}`}>
                      <Image
                        width={224}
                        height={192}
                        sizes="(max-width: 380px) 86px, 112px"
                        src={`/logos/${name.toLowerCase()}.png`}
                        alt={`Logo ${name}`}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </span>
                    <span className="company-info">
                      <strong>{name}</strong>
                      <small>
                        {db && !loading
                          ? `${list.length - count} equipes restantes`
                          : `${list.length} equipes cadastradas`}
                      </small>
                    </span>
                    <span className="company-count">
                      {db && !loading ? count : "—"}
                      <small> / {list.length}</small>
                      <span aria-hidden> ↗</span>
                    </span>
                    <progress
                      max={list.length}
                      value={count}
                      aria-label={`Progresso ${name}`}
                    />
                  </button>
                );
              })}
            </div>
            <p className="hint">
              Cada equipe deve ser fiscalizada uma vez por ciclo.
              <br />O histórico é mantido a cada nova quinzena.
            </p>
          </>
        )}
        {page === "companies" && company && (
          <>
            <button className="back" onClick={() => setCompany(null)}>
              ← Todas as empresas
            </button>
            <div className="eyebrow">{cycle?.id}</div>
            <h1>{company}</h1>
            <p className="subtitle">
              {teams.filter((t) => t.company_id === company).length} equipes ·{" "}
              {cycle?.period}
            </p>
            <div
              className="tabs"
              role="tablist"
              aria-label="Status das equipes"
            >
              <button
                role="tab"
                aria-selected={tab === "pending"}
                onClick={() => setTab("pending")}
              >
                A Fiscalizar (
                {
                  teams.filter(
                    (t) =>
                      t.company_id === company &&
                      !indexed.get(t.id)?.inspected_at,
                  ).length
                }
                )
              </button>
              <button
                role="tab"
                aria-selected={tab === "done"}
                onClick={() => setTab("done")}
              >
                Finalizadas (
                {
                  teams.filter(
                    (t) =>
                      t.company_id === company &&
                      indexed.get(t.id)?.inspected_at,
                  ).length
                }
                )
              </button>
            </div>
            {loading ? (
              <p role="status">Carregando equipes…</p>
            ) : (
              <div className="teams">
                {shown.map((team) => {
                  const row = indexed.get(team.id);
                  return (
                    <button
                      disabled={!db || !online || busy || !!error}
                      key={team.id}
                      className={`team ${row?.inspected_at ? "done" : "pending"}`}
                      onClick={() =>
                        setSelected({ team, row, cycle: cycle!.id })
                      }
                    >
                      <span className="status-icon" aria-hidden>
                        {row?.inspected_at ? "✓" : "!"}
                      </span>
                      <span>
                        <strong>{team.name}</strong>
                        <small>{team.kind}</small>
                        <span className="team-status">
                          {row?.inspected_at
                            ? `Fiscalizada · ${formatTime(row.inspected_at)}`
                            : "A Fiscalizar"}
                        </span>
                      </span>
                      <span aria-hidden>›</span>
                    </button>
                  );
                })}
                {shown.length === 0 && (
                  <div className="empty">
                    <span>✓</span>
                    <h2>
                      {tab === "pending"
                        ? "Tudo certo por aqui!"
                        : "Nenhuma equipe finalizada"}
                    </h2>
                    <p>
                      {tab === "pending"
                        ? "Todas as equipes desta empresa foram fiscalizadas neste ciclo."
                        : "As fiscalizações confirmadas aparecerão aqui."}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {page === "history" && (
          <>
            <div className="eyebrow">REGISTROS PRESERVADOS</div>
            <h1>Histórico</h1>
            <p className="subtitle">
              Fiscalizações e retornos, ciclo após ciclo.
            </p>
            <div className="filters">
              <label>
                Mês
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              </label>
              <label>
                Ciclo
                <select value={half} onChange={(e) => setHalf(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="1">Ciclo 1 · 01 a 15</option>
                  <option value="2">Ciclo 2 · 16 ao fim</option>
                </select>
              </label>
              <label>
                Empresa
                <select
                  value={filterCompany}
                  onChange={(e) => {
                    setFilterCompany(e.target.value);
                    setFilterTeam("");
                  }}
                >
                  <option value="">Todas</option>
                  {companies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Equipe
                <select
                  value={filterTeam}
                  onChange={(e) => setFilterTeam(e.target.value)}
                >
                  <option value="">Todas</option>
                  {teams
                    .filter(
                      (t) => !filterCompany || t.company_id === filterCompany,
                    )
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <p className="history-count">
              {historyLoading
                ? "Atualizando registros…"
                : `${events.length} eventos encontrados`}
            </p>
            <div className="events">
              {events.map((event) => {
                const team = teams.find((t) => t.id === event.team_id);
                return (
                  <article className="event" key={event.id}>
                    <span
                      className={
                        event.action === "inspect"
                          ? "event-check"
                          : "event-undo"
                      }
                      aria-hidden
                    >
                      {event.action === "inspect" ? "✓" : "↶"}
                    </span>
                    <div>
                      <strong>{team?.name ?? event.team_id}</strong>
                      <small>
                        {team?.company_id} · {team?.kind}
                      </small>
                      <p>
                        {event.action === "inspect"
                          ? "Fiscalizada"
                          : "Retornou para A Fiscalizar"}
                      </p>
                      <small>
                        {formatTime(event.occurred_at)} · {event.cycle_id}
                      </small>
                    </div>
                  </article>
                );
              })}
              {!historyLoading && events.length === 0 && (
                <div className="empty">
                  <h2>Nenhum registro neste filtro</h2>
                  <p>
                    Selecione outro mês ou ciclo para consultar o histórico.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </main>
      <nav className="bottom-nav" aria-label="Navegação principal">
        <button
          aria-current={page === "companies" ? "page" : undefined}
          onClick={() => {
            setPage("companies");
            setCompany(null);
          }}
        >
          ▦ <span>Empresas</span>
        </button>
        <button
          aria-current={page === "history" ? "page" : undefined}
          onClick={() => {
            setPage("history");
            setSelected(null);
          }}
        >
          ◷ <span>Histórico</span>
        </button>
      </nav>
      <dialog
        ref={dialog}
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setSelected(null);
        }}
        aria-labelledby="confirm-title"
      >
        <div className="dialog-content">
          <div className="eyebrow">
            {selected?.row?.inspected_at
              ? "RETORNAR EQUIPE"
              : "CONFIRMAR FISCALIZAÇÃO"}
          </div>
          <h2 id="confirm-title">
            {selected?.row?.inspected_at
              ? "Retornar esta equipe para A Fiscalizar?"
              : "Marcar esta equipe como fiscalizada?"}
          </h2>
          <p className="selected-team">{selected?.team.name}</p>
          <p>
            {selected?.row?.inspected_at
              ? "O registro anterior continuará no histórico."
              : "A data e a hora serão registradas automaticamente."}
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy
              ? "Registrando…"
              : selected?.row?.inspected_at
                ? "Retornar para A Fiscalizar"
                : "Confirmar fiscalização"}
          </button>
          <button
            className="cancel"
            disabled={busy}
            onClick={() => setSelected(null)}
          >
            Cancelar
          </button>
        </div>
      </dialog>
    </>
  );
}
