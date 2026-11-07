import { useId, useState } from "react";

export const number = (n) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
export const percent = (n) =>
  n > 0 && n < 0.001
    ? "<0.1%"
    : new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(n);
const compact = (n) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
export const monthLabel = (value) =>
  new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(
    new Date(`${value}-01T00:00:00Z`),
  );
const colors = ["#7b2923", "#b29162", "#586f7c", "#6b7151", "#b28d91", "#8b8176"];

export function Figure({ id, number: figureNumber, title, description, children, columns, rows }) {
  return (
    <figure className="analysis-figure" id={id}>
      <figcaption>
        <span>Figure {figureNumber}.</span> {title}
      </figcaption>
      <p className="figure-scope">{description}</p>
      {children}
      <details className="figure-data">
        <summary>View data</summary>
        <div className="analysis-table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((value, j) =>
                    j === 0 ? (
                      <th scope="row" key={j}>
                        {value}
                      </th>
                    ) : (
                      <td key={j}>{value}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

// Marks expose exact values on hover and keyboard focus; tables retain every value.
function Plot({ label, height = 300, width = 720, responsive = false, children }) {
  const title = useId();
  const [tip, setTip] = useState("");
  return (
    <div className={`analysis-chart${responsive ? " analysis-chart-responsive" : ""}`}>
      <div className="analysis-plot-scroll">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          aria-labelledby={title}
          role="group"
          onMouseLeave={() => setTip("")}
        >
          <title id={title}>{label}</title>
          {children((text) => ({
            tabIndex: 0,
            role: "img",
            "aria-label": text,
            onMouseEnter: () => setTip(text),
            onFocus: () => setTip(text),
            onBlur: () => setTip(""),
          }))}
        </svg>
      </div>
      <p className="chart-readout" aria-live="polite">
        {tip || "Hover or focus a mark for exact values."}
      </p>
    </div>
  );
}

function Axes({ max, yLabel, xLabel, percentScale = false }) {
  return (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
        <g key={fraction}>
          <line
            className="chart-grid"
            x1={74}
            x2={688}
            y1={238 - fraction * 192}
            y2={238 - fraction * 192}
          />
          <text x={64} y={243 - fraction * 192} textAnchor="end">
            {percentScale ? percent(fraction) : compact(max * fraction)}
          </text>
        </g>
      ))}
      <path className="chart-axis" d="M74 46V238H688" />
      {yLabel && (
        <text x={74} y={24}>
          {yLabel}
        </text>
      )}
      {xLabel && (
        <text x={381} y={296} textAnchor="middle">
          {xLabel}
        </text>
      )}
    </>
  );
}

export function TopicBars({ data, total }) {
  const max = Math.max(1, ...data.map((row) => row.count));
  return (
    <div className="topic-bars" aria-label="Top primary research topics">
      {data.map((row) => (
        <div className="topic-bar-row" key={row.id}>
          <a href={`/papers?topic=${encodeURIComponent(row.name)}`}>{row.name}</a>
          <div className="topic-bar-track">
            <span style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
          <span>
            {number(row.count)} <small>({percent(row.count / total)})</small>
          </span>
        </div>
      ))}
      {!data.length && <p>No primary topics are recorded.</p>}
    </div>
  );
}

export function CitationBars({ data }) {
  const max = Math.max(1, ...data.map((row) => row.count));
  const width = 614 / data.length;
  return (
    <Plot label="Distribution of papers by citation-count band">
      {(mark) => (
        <>
          <Axes max={max} yLabel="Papers" xLabel="Citations per paper · ordered bands" />
          {data.map((row, i) => (
            <g key={row.label}>
              <rect
                {...mark(`${row.label} citations: ${number(row.count)} papers`)}
                fill={colors[0]}
                x={75 + width * i}
                y={238 - (row.count / max) * 192}
                width={width - 2}
                height={(row.count / max) * 192}
              />
              <text x={74 + width * (i + 0.5)} y={264} textAnchor="middle">
                {row.label}
              </text>
            </g>
          ))}
        </>
      )}
    </Plot>
  );
}

export function MonthlyLine({ data }) {
  const max = Math.max(1, ...data.map((row) => row.count));
  const x = (i) => 74 + (i / Math.max(1, data.length - 1)) * 614;
  const y = (count) => 238 - (count / max) * 192;
  return (
    <Plot label="Monthly publication counts for the indexed period">
      {(mark) => (
        <>
          <Axes max={max} yLabel="Papers" />
          <polyline
            fill="none"
            stroke={colors[0]}
            strokeWidth={2}
            points={data.map((row, i) => `${x(i)},${y(row.count)}`).join(" ")}
          />
          {data.map((row, i) => (
            <g key={row.month}>
              <circle
                {...mark(`${row.month}: ${number(row.count)} papers`)}
                cx={x(i)}
                cy={y(row.count)}
                r={5}
                fill={colors[0]}
              />
              <text x={x(i)} y={266} textAnchor="middle">
                {monthLabel(row.month)}
              </text>
            </g>
          ))}
        </>
      )}
    </Plot>
  );
}

export function TypeDonut({ data, total }) {
  let cumulative = 0;
  return (
    <div className="analysis-composition">
      <Plot label="Publication type composition" height={260} width={310} responsive>
        {(mark) => (
          <>
            {data.map((row, i) => {
              const fraction = row.count / total;
              const offset = cumulative;
              cumulative += fraction;
              return (
                <circle
                  key={row.name}
                  {...mark(`${row.name}: ${number(row.count)} papers, ${percent(fraction)}`)}
                  cx={155}
                  cy={126}
                  r={84}
                  pathLength={100}
                  fill="none"
                  stroke={colors[i % colors.length]}
                  strokeWidth={34}
                  strokeDasharray={`${fraction * 100} ${100 - fraction * 100}`}
                  strokeDashoffset={-offset * 100}
                  transform="rotate(-90 155 126)"
                />
              );
            })}
            <text className="chart-total" x={155} y={123} textAnchor="middle">
              {compact(total)}
            </text>
            <text x={155} y={148} textAnchor="middle">
              papers
            </text>
          </>
        )}
      </Plot>
      <CompositionLegend data={data} total={total} />
    </div>
  );
}

function CompositionLegend({ data, total, counts = false }) {
  return (
    <ul className="composition-legend">
      {data.map((row, i) => (
        <li key={row.name}>
          <span
            className="composition-key"
            style={{ background: colors[i % colors.length] }}
            aria-hidden="true"
          />
          <span>{row.name}</span>
          <span>
            {counts && `${number(row.count)} · `}
            {percent(row.count / total)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AffiliationStack({ data, total }) {
  let cumulative = 0;
  return (
    <>
      <Plot label="Mutually exclusive country affiliation groups" height={110} responsive>
        {(mark) => (
          <>
            {data.map((row, i) => {
              const offset = cumulative;
              cumulative += row.count / total;
              return (
                <rect
                  key={row.name}
                  {...mark(
                    `${row.name}: ${number(row.count)} papers, ${percent(row.count / total)}`,
                  )}
                  x={30 + offset * 660}
                  y={30}
                  width={(row.count / total) * 660}
                  height={55}
                  fill={colors[i]}
                  stroke="var(--paper)"
                />
              );
            })}
          </>
        )}
      </Plot>
      <CompositionLegend data={data} total={total} counts />
    </>
  );
}

export function CountryCitationBars({ data }) {
  const max = Math.max(1, ...data.map((row) => row.meanCitations ?? 0));
  const height = data.length * 58 + 76;
  return (
    <Plot label="Mean citations per paper by country affiliation" height={height}>
      {(mark) => (
        <>
          <text x={250} y={24}>
            Mean citations per paper
          </text>
          <line className="chart-axis" x1={250} x2={250} y1={40} y2={height - 38} />
          {data.map((row, i) => (
            <g key={row.id}>
              <text x={235} y={66 + i * 58} textAnchor="end">
                {row.name}
              </text>
              {row.meanCitations === null ? (
                <text x={260} y={66 + i * 58}>
                  Unavailable
                </text>
              ) : (
                <>
                  <rect
                    {...mark(
                      `${row.name}: ${number(row.meanCitations)} mean citations; ${number(row.citations)} citations across ${number(row.citationKnown)} papers with citation data`,
                    )}
                    x={250}
                    y={49 + i * 58}
                    width={(row.meanCitations / max) * 330}
                    height={24}
                    fill={colors[i]}
                  />
                  <text x={262 + (row.meanCitations / max) * 330} y={67 + i * 58}>
                    {number(row.meanCitations)}
                  </text>
                </>
              )}
            </g>
          ))}
          <text x={250} y={height - 12}>
            0
          </text>
          <text x={580} y={height - 12} textAnchor="middle">
            {number(max)}
          </text>
        </>
      )}
    </Plot>
  );
}

export function CountryMonthlyStack({ data, months }) {
  const max = Math.max(
    1,
    ...months.map((_, index) => data.reduce((sum, row) => sum + row.months[index].count, 0)),
  );
  const width = 614 / Math.max(1, months.length);
  return (
    <>
      <Plot label="Monthly publications by mutually exclusive country affiliation groups">
        {(mark) => (
          <>
            <Axes max={max} yLabel="Papers" />
            {months.map((month, i) => {
              let count = 0;
              return (
                <g key={month.month}>
                  {data.map((row, j) => {
                    const value = row.months[i].count;
                    const offset = count;
                    count += value;
                    return (
                      <rect
                        key={row.id}
                        {...mark(`${row.name}, ${month.month}: ${number(value)} papers`)}
                        x={74 + width * i + width * 0.06}
                        y={238 - ((offset + value) / max) * 192}
                        width={width * 0.88}
                        height={(value / max) * 192}
                        fill={colors[j]}
                      />
                    );
                  })}
                  <text x={74 + width * (i + 0.5)} y={266} textAnchor="middle">
                    {monthLabel(month.month)}
                  </text>
                </g>
              );
            })}
          </>
        )}
      </Plot>
      <ul className="country-chart-legend">
        {data.map((row, i) => (
          <li key={row.id}>
            <span
              className="composition-key"
              style={{ background: colors[i] }}
              aria-hidden="true"
            />
            {row.name}
          </li>
        ))}
      </ul>
    </>
  );
}

function shortLabel(text, length = 32) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

export function TopicHeatmap({ data, months }) {
  const max = Math.max(1, ...data.flatMap((row) => row.months.map((cell) => cell.count)));
  const width = 425 / Math.max(1, months.length);
  return (
    <Plot label="Monthly counts for the six leading primary topics" height={335}>
      {(mark) => (
        <>
          {months.map((row, i) => (
            <text key={row.month} x={276 + (i + 0.5) * width} y={28} textAnchor="middle">
              {monthLabel(row.month)}
            </text>
          ))}
          {data.map((row, i) => (
            <g key={row.id}>
              <text x={263} y={67 + i * 37} textAnchor="end">
                <title>{row.name}</title>
                {shortLabel(row.name)}
              </text>
              {row.months.map((cell, j) => (
                <rect
                  key={cell.month}
                  {...mark(`${row.name}, ${cell.month}: ${number(cell.count)} papers`)}
                  x={276 + j * width}
                  y={44 + i * 37}
                  width={width - 1}
                  height={36}
                  fill={`rgb(${Math.round(248 - (cell.count / max) * 125)}, ${Math.round(245 - (cell.count / max) * 204)}, ${Math.round(240 - (cell.count / max) * 205)})`}
                />
              ))}
            </g>
          ))}
          <text x={276} y={296}>
            Papers per topic / month
          </text>
          {[0, 0.25, 0.5, 0.75, 1].map((fraction, i) => (
            <g key={fraction}>
              <rect
                x={489 + i * 30}
                y={279}
                width={29}
                height={20}
                fill={`rgb(${Math.round(248 - fraction * 125)}, ${Math.round(245 - fraction * 204)}, ${Math.round(240 - fraction * 205)})`}
              />
              {(i === 0 || i === 4) && (
                <text x={489 + i * 30} y={321}>
                  {i ? number(max) : "0"}
                </text>
              )}
            </g>
          ))}
        </>
      )}
    </Plot>
  );
}

export function UniversityScatter({ data }) {
  const valid = data.filter((row) => row.meanCitations !== null);
  const xmax = Math.max(1, ...valid.map((row) => row.count)) * 1.07;
  const ymax = Math.max(1, ...valid.map((row) => row.meanCitations)) * 1.08;
  return (
    <Plot
      label="Publication count and mean citations for the thirty largest indexed universities"
      height={325}
    >
      {(mark) => (
        <>
          <Axes
            max={ymax}
            yLabel="Mean citations per paper"
            xLabel="Indexed papers per university"
          />
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <text key={fraction} x={74 + fraction * 614} y={265} textAnchor="middle">
              {compact(xmax * fraction)}
            </text>
          ))}
          {valid.map((row, i) => (
            <g key={row.id}>
              <circle
                {...mark(
                  `${row.name}: ${number(row.count)} papers; ${number(row.meanCitations)} mean citations; ${number(row.citationKnown)} papers with citation data`,
                )}
                cx={74 + (row.count / xmax) * 614}
                cy={238 - (row.meanCitations / ymax) * 192}
                r={6}
                fill={colors[0]}
                fillOpacity={0.7}
                stroke="var(--paper)"
              />
              {i < 3 && (
                <text
                  x={74 + (row.count / xmax) * 614 - 9}
                  y={238 - (row.meanCitations / ymax) * 192 - 11}
                  textAnchor="end"
                >
                  {i + 1}
                </text>
              )}
            </g>
          ))}
        </>
      )}
    </Plot>
  );
}

export function LorenzCurve({ data }) {
  return (
    <Plot
      label="Cumulative share of citations held by papers ranked from lowest to highest citation count"
      height={325}
    >
      {(mark) => (
        <>
          <Axes
            max={1}
            percentScale
            yLabel="Cumulative share of citations"
            xLabel="Cumulative share of papers · least cited first"
          />
          <line x1={74} y1={238} x2={688} y2={46} stroke="var(--muted-ink)" strokeDasharray="5 5" />
          <polyline
            fill="none"
            stroke={colors[0]}
            strokeWidth={2}
            points={data
              .map((row) => `${74 + row.papers * 614},${238 - row.citations * 192}`)
              .join(" ")}
          />
          {data
            .filter((_, i) => i % 10 === 0 || i === 99)
            .map((row) => (
              <circle
                key={row.papers}
                {...mark(
                  `${percent(row.papers)} of papers account for ${percent(row.citations)} of citations`,
                )}
                cx={74 + row.papers * 614}
                cy={238 - row.citations * 192}
                r={4}
                fill={colors[0]}
              />
            ))}
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <text key={fraction} x={74 + fraction * 614} y={265} textAnchor="middle">
              {percent(fraction)}
            </text>
          ))}
        </>
      )}
    </Plot>
  );
}
