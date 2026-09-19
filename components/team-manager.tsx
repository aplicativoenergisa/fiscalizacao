"use client";
import { useEffect, useRef } from "react";
import type { Team } from "@/lib/team";
export function TeamManager({
  company,
  teams,
  select,
  close,
}: {
  company: string;
  teams: Team[];
  select: (team: Team) => void;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} aria-labelledby="team-manager-title" onCancel={close}>
      <div className="dialog-content team-manager">
        <h2 id="team-manager-title">Gerenciar Equipes · {company}</h2>
        <p>Selecione uma equipe para editar seu cadastro.</p>
        <div className="team-manager-list">
          {teams.map((team) => (
            <button key={team.id} onClick={() => select(team)}>
              <strong>{team.name}</strong>
              <small>
                {team.kind} · {team.active ? "Ativa" : "Inativa"}
              </small>
            </button>
          ))}
          {!teams.length && <p>Nenhuma equipe cadastrada nesta empresa.</p>}
        </div>
        <button className="cancel" onClick={close}>
          Fechar
        </button>
      </div>
    </dialog>
  );
}
