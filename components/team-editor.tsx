"use client";
import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { COMPANIES, TEAM_KINDS, type Team } from "@/lib/team";
export function TeamEditor({
  team,
  company,
  db,
  online,
  onSaved,
  close,
}: {
  team: Team | null;
  company: string | null;
  db: SupabaseClient;
  online: boolean;
  onSaved: (team: Team) => void;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    request = useRef<{ id: string; payload: string } | null>(null);
  const [name, setName] = useState(team?.name || ""),
    [selectedCompany, setCompany] = useState(team?.company_id || company || ""),
    [kind, setKind] = useState(team?.kind || ""),
    [active, setActive] = useState(team?.active ?? true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function save() {
    if (busy || !online) return;
    setBusy(true);
    setError("");
    const values = {
      p_id: team?.id ?? null,
      p_company_id: selectedCompany,
      p_name: name.trim(),
      p_kind: kind,
      p_active: active,
      p_expected_version: team?.version ?? 0,
    };
    const payload = JSON.stringify(values);
    if (request.current?.payload !== payload)
      request.current = { id: crypto.randomUUID(), payload };
    try {
      const result = await db.rpc("save_team", {
        ...values,
        p_request_id: request.current!.id,
      });
      if (result.error) throw result.error;
      onSaved(Array.isArray(result.data) ? result.data[0] : result.data);
      close();
    } catch (e) {
      const message =
        e && typeof e === "object" && "message" in e ? String(e.message) : "";
      setError(
        message.includes("DUPLICATE_TEAM")
          ? "Já existe uma equipe com este nome/código nesta empresa, inclusive entre as inativas."
          : message.includes("STALE_TEAM")
            ? "Outro técnico alterou este cadastro. Feche e abra novamente para editar a versão atualizada."
            : "Não foi possível salvar. Confira a conexão e tente novamente; a repetição não duplica o cadastro.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="team-editor-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <div className="dialog-content team-editor">
        <h2 id="team-editor-title">
          {team ? "Editar equipe" : "Adicionar Equipe"}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            Empresa
            <select
              required
              value={selectedCompany}
              disabled={busy}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option value="">Escolha a empresa</option>
              {COMPANIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Nome/código da equipe
            <input
              required
              maxLength={100}
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Tipo da equipe
            <select
              required
              value={kind}
              disabled={busy}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="">Escolha o tipo</option>
              {[
                ...TEAM_KINDS,
                ...(team?.kind === "TIPO NÃO INFORMADO" ? [team.kind] : []),
              ].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          {team && (
            <label>
              Status
              <select
                value={active ? "active" : "inactive"}
                disabled={busy}
                onChange={(e) => setActive(e.target.value === "active")}
              >
                <option value="active">Ativa</option>
                <option value="inactive">Inativa</option>
              </select>
            </label>
          )}
          <p>
            {team
              ? "Inativas saem da lista de fiscalização e dos totais atuais. Todo o histórico e as não conformidades permanecem disponíveis."
              : "A nova equipe entra como A Fiscalizar no ciclo atual e participa dos próximos ciclos."}
          </p>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary"
            disabled={busy || !online || !name.trim()}
          >
            {busy ? "Salvando…" : "Salvar equipe"}
          </button>
          <button
            type="button"
            className="cancel"
            disabled={busy}
            onClick={close}
          >
            Cancelar
          </button>
        </form>
      </div>
    </dialog>
  );
}
