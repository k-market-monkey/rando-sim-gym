const $ = (id) => document.getElementById(id);
const number = (value) =>
  Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
const percent = (value) => (Number.isFinite(value) ? `${number(value * 100)}%` : '—');
const quartiles = (value) =>
  value ? `${number(value.median)} [${number(value.p25)}–${number(value.p75)}]` : '—';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function definition(list, name, value) {
  list.append(element('dt', name), element('dd', value));
}

function renderMatrix(target, labels, rows, arena, caption) {
  target.replaceChildren();
  target.append(element('caption', caption));
  const head = element('thead'),
    header = element('tr');
  const corner = element('th', 'Row ↓ / Column →');
  corner.scope = 'col';
  header.append(corner);
  for (const label of labels) {
    const heading = element('th', label);
    heading.scope = 'col';
    header.append(heading);
  }
  head.append(header);
  target.append(head);
  const body = element('tbody');
  rows.forEach((cells, row) => {
    const tr = element('tr'),
      heading = element('th', labels[row]);
    heading.scope = 'row';
    tr.append(heading);
    cells.forEach((cell, column) => {
      const td = element('td');
      if (!cell) {
        td.textContent = '—';
        td.title = 'Self-match not run';
      } else {
        const details = `${labels[row]} versus ${labels[column]}: ${percent(cell.score)} score; ${cell.wins} wins, ${cell.losses} losses, ${cell.draws} draws in ${cell.games} games; 95% confidence interval ${percent(cell.ci[0])}–${percent(cell.ci[1])}. Draw counts as half a win.`;
        const value = element(cell.pairId == null ? 'span' : 'a', percent(cell.score));
        value.title = details;
        value.setAttribute('aria-label', details);
        if (cell.pairId != null) {
          const url = new URL(arena.viewerUrl, location.href);
          url.searchParams.set('pair', cell.pairId);
          value.href = url.href;
        }
        td.style.backgroundColor = `hsl(${Math.round(cell.score * 220)} 42% 23%)`;
        td.append(value);
      }
      tr.append(td);
    });
    body.append(tr);
  });
  target.append(body);
}

function renderDiagnostics(arena, timeLabels) {
  const container = $('diagnostics');
  container.replaceChildren();
  for (const move of arena.moveStats) {
    const card = element('article'),
      title = element('h3', move.name),
      list = element('dl');
    card.append(title, element('p', move.group, 'muted'));
    const metrics = [
      ['Games / casts', `${number(move.games)} / ${number(move.casts)}`],
      [
        'Special / built-in damage totals',
        `${number(move.specialDamage)} / ${number(move.builtinDamage)}`,
      ],
      ['Self damage total', number(move.selfDamage)],
      ['Hit distance', quartiles(move.hitDistance)],
      ['Cast distance', quartiles(move.castDistance)],
      ['First special hit (seconds, among games with a hit)', quartiles(move.firstHitSeconds)],
      ['Games with a special hit', `${number(move.gamesWithSpecialHit)} / ${number(move.games)}`],
      [
        'Retaliation',
        `${percent(move.retaliationRate)} (${number(move.retaliationSamples)} samples)`,
      ],
      [
        'No sight / idle / stalled',
        [move.noSightPercent, move.idlePercent, move.stalledPercent]
          .map((value) => `${number(value)}%`)
          .join(' / '),
      ],
      [
        'Health damage totals by time',
        move.damageByTime
          .map((value, index) => `${timeLabels?.[index] ?? `Bin ${index + 1}`}: ${number(value)}`)
          .join(' · '),
      ],
    ];
    if (move.reflectedDamage > 0)
      metrics.push(['Reflected damage total', number(move.reflectedDamage)]);
    for (const [name, value] of metrics) definition(list, name, value);
    card.append(list);
    container.append(card);
  }
}

async function load() {
  try {
    const response = await fetch('./archetype-report.json');
    if (!response.ok) throw Error(`Report request failed (${response.status})`);
    const report = await response.json();
    if (report.format !== 1 || !report.arenas?.length) throw Error('Unsupported or empty report');
    $('scoring').textContent =
      `${report.gamesPerPair} games per move pair. Score = (wins + ½ draws) / games; a draw counts as half a win.`;
    for (const [name, value] of Object.entries({
      Seed: report.seed,
      'Source commit': report.sourceSha,
      'Engine fingerprint': report.engineFingerprint,
    }))
      definition($('provenance'), name, String(value));
    for (const [name, value] of Object.entries(report.definitions ?? {}))
      definition($('definitions'), name, typeof value === 'string' ? value : JSON.stringify(value));
    for (const arena of report.arenas) {
      const option = element('option', arena.name);
      option.value = arena.id;
      $('arena').append(option);
    }
    function render() {
      const arena = report.arenas.find((item) => item.id === $('arena').value);
      $('arena-meta').textContent =
        `${arena.width} × ${arena.height} · map revision ${arena.mapRevision}`;
      renderMatrix(
        $('matrix'),
        report.moveOrder.map((move) => move.name),
        arena.matrix,
        arena,
        `${arena.name}: row move score against column move`,
      );
      renderMatrix(
        $('groups'),
        arena.groupOrder,
        arena.groups,
        arena,
        `${arena.name}: archetype scores`,
      );
      renderDiagnostics(arena, report.definitions?.damageByTimeLabels);
      $('status').textContent =
        `${arena.name} · ${report.gamesPerPair} games per pair · all-trial scores`;
    }
    $('arena').addEventListener('change', render);
    render();
    $('report').hidden = false;
  } catch (error) {
    $('status').textContent = `Could not load experiment: ${error.message}. Reload to try again.`;
  }
}
load();
