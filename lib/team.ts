export type Team = {
  id: number;
  company_id: string;
  name: string;
  kind: string;
  active: boolean;
  version: number;
};
export const COMPANIES = ["RALT", "JVP", "DSX", "ENGELMIG"];
export const TEAM_KINDS = [
  "PESADA",
  "LINHA VIVA",
  "LIMPEZA DE FAIXA",
  "RECOLHIMENTO DE PODA",
  "OUTRO",
];
