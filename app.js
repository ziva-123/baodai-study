'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

let questions = [], pool = [], index = 0, selected = [], submitted = false, view = 'all', limit = 50;
let saved = { records: {}, stars: [], positions: {}, bank: '财务' };

try {
  const d = JSON.parse(localStorage.getItem('baodai-v1'));
  if (d && d.records && Array.isArray(d.stars)) saved = { ...saved, ...d };
} catch {}

const baodaiBanks = ['财务', '法规'];
let bank = baodaiBanks.includes(saved.bank) ? saved.bank : '财务';

function chapterOf(q) {
  return q.sources.map(s => s.file.replace(/\.pdf$/, ''));
}

function switchBank(next) {
  if (!baodaiBanks.includes(next)) return;

  bank = next;
  $('#search').value = '';
  $('#type').value = '';

  filters();
  refresh(true);
}

function persist() {
  saved.bank = bank;

  try {
    localStorage.setItem('baodai-v1', JSON.stringify(saved));
  } catch {
    $('.local').textContent = '浏览器未能保存记录，请检查存储空间';
  }
}

function stats() {
  const qs = questions.filter(q => q.bank === bank);
  const done = qs.filter(q => saved.records[q.id]);
  const attempts = done.reduce((n, q) => n + saved.records[q.id].attempts, 0);
  const correct = done.reduce((n, q) => n + saved.records[q.id].correctCount, 0);
  const wrong = done.filter(q => !saved.records[q.id].correct).length;

  $('#stats').innerHTML = `
    <div class="stat">
      <small>${esc(bank)}题库</small>
      <strong>${qs.length}<em>道题</em></strong>
    </div>

    <div class="stat">
      <small>已练习 · 去重题数</small>
      <strong>${done.length}<em>/ ${qs.length}</em></strong>
      <progress value="${done.length}" max="${qs.length || 1}" aria-label="学习进度"></progress>
    </div>

    <div class="stat">
      <small>作答正确率 · ${attempts} 次提交</small>
      <strong>${attempts ? Math.round(correct / attempts * 100) + '%' : '—'}</strong>
    </div>

    <div class="stat">
      <small>待巩固错题</small>
      <strong>${wrong}<em>道题</em></strong>
    </div>
  `;
}

function filters() {
  const qs = questions.filter(q => q.bank === bank);

  $('#chapter').innerHTML =
    '<option value="">全部章节</option>' +
    [...new Set(qs.flatMap(chapterOf))]
      .map(c => `<option>${esc(c)}</option>`)
      .join('');

  $('#tag').innerHTML =
    '<option value="">全部标签</option>' +
    [...new Set(qs.flatMap(q => q.tags))]
      .map(c => `<option>${esc(c)}</option>`)
      .join('');

  $$('[data-bank]').forEach(b => {
    const keep = baodaiBanks.includes(b.dataset.bank);

    b.hidden = !keep;

    if (keep) {
      b.classList.toggle('active', b.dataset.bank === bank);
    }
  });

  $$('[data-group]').forEach(b => {
    const isSC = b.dataset.group === 'sc';

    b.hidden = isSC;

    if (!isSC) {
      b.classList.add('active');
      b.setAttribute('aria-pressed', 'true');
    }
  });
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }

  return a;
}

function refresh(restore = false) {
  const term = $('#search').value.trim().toLowerCase();
  const chapter = $('#chapter').value;
  const type = $('#type').value;
  const tag = $('#tag').value;

  pool = questions.filter(q =>
    q.bank === bank &&
    (!chapter || chapterOf(q).includes(chapter)) &&
    (!type || q.type === type) &&
    (!tag || q.tags.includes(tag)) &&
    (
      !term ||
      [
        q.id,
        q.stem,
        ...q.options.map(o => o.text),
        q.explanation
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    ) &&
    (
      view === 'all' ||
      view === 'wrong' && saved.records[q.id] && !saved.records[q.id].correct ||
      view === 'star' && saved.stars.includes(q.id) ||
      view === 'unseen' && !saved.records[q.id]
    )
  );

  if ($('#mode').value === 'random') shuffle(pool);

  index = restore
    ? Math.max(0, pool.findIndex(q => q.id === saved.positions[bank]))
    : 0;

  limit = 50;

  loadQuestion();
  stats();
}

function loadQuestion() {
  selected = [];
  submitted = false;

  const q = pool[index];

  if (q) {
    saved.positions[bank] = q.id;
    persist();
  }

  render();
}

function render() {
  const q = pool[index];

  $('#scope').textContent =
    `${bank} / ${{
      all: '全部题目',
      wrong: '错题本',
      star: '我的收藏',
      unseen: '未做题目'
    }[view]} · ${pool.length} 题`;

  $$('[data-view]').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view)
  );

  if (!q) {
    $('#question').innerHTML = `
      <div class="empty">
        <h2>这里暂时没有题目</h2>
        <p>试试调整筛选条件，或切换到全部题目。</p>
      </div>
    `;

    $('#pager').innerHTML = '';
    renderList();
    return;
  }

  const star = saved.stars.includes(q.id);

  const correct =
    selected.slice().sort().join('') ===
    q.answer.slice().sort().join('');

  $('#question').innerHTML = `
    <div class="qtop">
      <span class="pill">${esc(q.type)}</span>

      ${q.tags
        .map(t => `<span class="pill">${esc(t)}</span>`)
        .join('')}

      <span class="qid">ID ${esc(q.id)}</span>

      <button
        class="star ${star ? 'selected' : ''}"
        id="star"
        aria-pressed="${star}"
      >
        ${star ? '★ 已收藏' : '☆ 收藏'}
      </button>
    </div>

    <p class="source-meta">${esc(q.chapter)}</p>

    ${
      q.issues.length
        ? `<p class="warning">
            原资料提示：${esc(q.issues.join('、'))}。请结合原文查看。
           </p>`
        : ''
    }

    <div class="stem">
      ${
        q.stemImages?.length
          ? q.stemImages
              .map(src => `
                <a href="${esc(src)}" target="_blank" rel="noopener">
                  <img
                    class="source-image"
                    src="${esc(src)}"
                    alt="题干及表格原图，点击放大"
                  >
                </a>
              `)
              .join('')
          : esc(q.stem)
      }
    </div>

    <div class="options" role="group" aria-label="答案选项">
      ${q.options
        .map(o => `
          <button
            class="
              option
              ${selected.includes(o.key) ? 'chosen' : ''}
              ${submitted && q.answer.includes(o.key) ? 'correct' : ''}
              ${
                submitted &&
                selected.includes(o.key) &&
                !q.answer.includes(o.key)
                  ? 'incorrect'
                  : ''
              }
            "
            data-option="${o.key}"
            aria-pressed="${selected.includes(o.key)}"
            ${submitted ? 'disabled' : ''}
          >
            <span class="letter">${o.key}</span>
            <span>${esc(o.text)}</span>
          </button>
        `)
        .join('')}
    </div>

    <div class="actions">
      <button
        id="submit"
        class="primary"
        ${submitted || !selected.length ? 'disabled' : ''}
      >
        ${submitted ? '已提交' : '提交答案'}
      </button>

      <span class="hint">
        ${
          ['多选题', '不定项选择题'].includes(q.type)
            ? '多选题，选全且无误才算答对'
            : '请选择一个答案'
        }
      </span>

      ${submitted ? '<button id="retry">再做一次</button>' : ''}
    </div>

    ${
      submitted
        ? `
          <section class="result" aria-live="polite">
            <h3 class="${correct ? 'good' : 'bad'}">
              ${correct ? '回答正确' : '再巩固一下'}
            </h3>

            <div>
              正确答案
              <b>${esc(q.answer.join('、'))}</b>
             　你的答案 ${esc(selected.join('、'))}
            </div>

            <p>
              ${esc(
                q.explanation ||
                '原资料未提供可提取的解析，请查看 PDF 原文。'
              )}
            </p>

            ${(q.explanationImages || [])
              .map(src => `
                <a href="${esc(src)}" target="_blank" rel="noopener">
                  <img
                    class="source-image"
                    src="${esc(src)}"
                    alt="解析表格原图，点击放大"
                  >
                </a>
              `)
              .join('')}

            ${q.sources
              .map(s => `
                <div>
                  <a
                    href="sources/${encodeURIComponent(s.file)}${s.page ? '#page=' + s.page : ''}"
                    target="_blank"
                    rel="noopener"
                  >
                    查看原文 ·
                    ${esc(s.file)}
                    ${s.page ? ' · 第 ' + s.page + ' 页' : ''}
                  </a>
                </div>
              `)
              .join('')}
          </section>
        `
        : ''
    }
  `;

  $('#star').onclick = () => {
    saved.stars = star
      ? saved.stars.filter(id => id !== q.id)
      : [...saved.stars, q.id];

    persist();
    render();
  };

  $$('[data-option]').forEach(b => {
    b.onclick = () => {
      const k = b.dataset.option;

      selected = ['多选题', '不定项选择题'].includes(q.type)
        ? (
            selected.includes(k)
              ? selected.filter(x => x !== k)
              : [...selected, k]
          )
        : [k];

      render();
    };
  });

  $('#submit').onclick = submit;

  const retry = $('#retry');

  if (retry) {
    retry.onclick = () => {
      selected = [];
      submitted = false;
      render();
    };
  }

  $('#pager').innerHTML = `
    <button id="prev" ${index === 0 ? 'disabled' : ''}>
      上一题
    </button>

    <span>${index + 1} / ${pool.length}</span>

    <button
      id="next"
      ${index === pool.length - 1 ? 'disabled' : ''}
    >
      下一题
    </button>
  `;

  $('#prev').onclick = () => navigate(index - 1);
  $('#next').onclick = () => navigate(index + 1);

  renderList();
}

function navigate(i) {
  if (i < 0 || i >= pool.length) return;

  index = i;
  loadQuestion();
}

function submit() {
  if (submitted || !selected.length) return;

  const q = pool[index];

  const correct =
    selected.slice().sort().join('') ===
    q.answer.slice().sort().join('');

  const old = saved.records[q.id] || {
    attempts: 0,
    correctCount: 0
  };

  saved.records[q.id] = {
    attempts: old.attempts + 1,
    correctCount: old.correctCount + Number(correct),
    correct,
    lastAnswer: [...selected],
    updatedAt: new Date().toISOString()
  };

  submitted = true;

  persist();
  stats();
  render();
}

function renderList() {
  $('#list').innerHTML = pool
    .slice(0, limit)
    .map((q, i) => `
      <button
        class="list-item ${i === index ? 'current' : ''}"
        data-jump="${i}"
      >
        <b>${i + 1}</b>
        <span>${esc(q.stem)}</span>

        <b>
          ${
            saved.records[q.id]
              ? saved.records[q.id].correct
                ? '✓'
                : '×'
              : ''
          }
        </b>
      </button>
    `)
    .join('');

  $$('[data-jump]').forEach(b =>
    b.onclick = () => navigate(Number(b.dataset.jump))
  );

  $('#more').hidden = limit >= pool.length;
}

$$('[data-bank]').forEach(
  b => b.onclick = () => switchBank(b.dataset.bank)
);

$$('[data-group="sc"]').forEach(
  b => b.hidden = true
);

$$('[data-view]').forEach(
  b => b.onclick = () => {
    view = b.dataset.view;
    refresh();
  }
);

['chapter', 'type', 'tag', 'mode'].forEach(
  id => $('#'+id).onchange = () => refresh()
);

let timer;

$('#search').oninput = () => {
  clearTimeout(timer);
  timer = setTimeout(() => refresh(), 180);
};

$('#more').onclick = () => {
  limit += 50;
  renderList();
};

fetch('questions.json')
  .then(r => {
    if (!r.ok) throw Error();
    return r.json();
  })
  .then(data => {
    questions = data;

    filters();
    refresh(true);

    $('#quality').textContent =
      `${questions.length} 道题 · 保代题库`;
  })
  .catch(() => {
    $('#question').innerHTML = `
      <div class="empty">
        <h2>题库加载失败</h2>
        <p>请检查网络后刷新页面重试。</p>
      </div>
    `;
  });

function registerStudyTools() {
  if (!document.modelContext?.registerTool) return;

  const context = document.modelContext;

  const register = tool => {
    try {
      Promise.resolve(
        context.registerTool(tool)
      ).catch(() => {});
    } catch {}
  };

  register({
    name: 'read_current_question',

    description:
      '读取当前可见的题目和作答状态。仅在提交后返回答案与解析。',

    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },

    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true
    },

    execute() {
      const q = pool[index];

      return q
        ? {
            id: q.id,
            bank: q.bank,
            stem: q.stem,
            options: q.options,
            selected,
            submitted,
            ...(submitted
              ? {
                  answer: q.answer,
                  explanation: q.explanation
                }
              : {})
          }
        : { empty: true };
    }
  });

  register({
    name: 'open_study_question',

    description:
      '按题目 ID 打开题目进行练习，不提交答案。',

    inputSchema: {
      type: 'object',

      properties: {
        id: {
          type: 'string'
        }
      },

      required: ['id'],
      additionalProperties: false
    },

    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true
    },

    execute(input) {
      if (!input || typeof input.id !== 'string') {
        throw Error('需要题目 ID');
      }

      const q = questions.find(
        q => q.id === input.id
      );

      if (!q) {
        throw Error('未找到题目');
      }

      bank = q.bank;
      view = 'all';

      filters();

      $('#search').value = '';
      $('#type').value = '';

      refresh();

      navigate(
        pool.findIndex(x => x.id === q.id)
      );

      return {
        id: q.id,
        bank: q.bank,
        submitted: false
      };
    }
  });
}

registerStudyTools();
