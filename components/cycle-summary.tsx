type SummaryValue = {
  label: string;
  value: number | string;
  tone?: string;
  description?: string;
};
export function CycleSummary({ values }: { values: SummaryValue[] }) {
  const max = Math.max(
    1,
    ...values.map((item) => (typeof item.value === "number" ? item.value : 0)),
  );
  return (
    <section className="cycle-summary" aria-labelledby="cycle-summary-title">
      <h2 id="cycle-summary-title">Resumo do ciclo atual</h2>
      <div className="cycle-summary-bars">
        {values.map((item) => (
          <div
            key={item.label}
            className={`cycle-summary-row ${item.tone || "pending"}`}
            title={item.description}
          >
            <span className="cycle-summary-label">{item.label}</span>
            <span
              className="cycle-summary-track"
              role="img"
              aria-label={`${item.description || item.label}: ${item.value}`}
            >
              <span
                style={{
                  width: `${typeof item.value === "number" ? (item.value / max) * 100 : 0}%`,
                }}
              />
            </span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
