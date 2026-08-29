import { useState, useEffect, useCallback } from 'react';
import {
  ensureConceptsSeeded,
  getConcepts,
  getProblemCounts,
  setConceptState,
  getProblems,
  deleteProblem,
} from '../lib/problems-api.js';
import { generateProblemsForConcept } from '../lib/generate-api.js';
import { duePool, buildSession } from '../lib/problem-scheduler.js';
import { SECTIONS } from '../data/concept-graph.js';

const STATE_META = {
  unknown:   { label: 'Unknown',   cls: 'chip-unknown' },
  forgotten: { label: 'Forgotten', cls: 'chip-forgotten' },
  shaky:     { label: 'Shaky',     cls: 'chip-shaky' },
  retained:  { label: 'Retained',  cls: 'chip-retained' },
  stable:    { label: 'Stable',    cls: 'chip-stable' },
};

function dueLabel(concept) {
  if (concept.state === 'stable') return 'graduated';
  if (!concept.due) return 'not scheduled';
  const days = (new Date(concept.due).getTime() - Date.now()) / 86400000;
  if (days <= 0) return 'due now';
  if (days < 1) return 'due today';
  return `due in ${Math.ceil(days)}d`;
}

export default function ProblemDashboard({ navigate, showToast }) {
  const [concepts, setConcepts] = useState([]);
  const [counts, setCounts] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState({}); // slug -> true
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState([]);

  const load = useCallback(async () => {
    try {
      const seeded = await ensureConceptsSeeded();
      if (seeded > 0) showToast(`Seeded ${seeded} concepts from the graph`);
      const [c, ct] = await Promise.all([getConcepts(), getProblemCounts()]);
      setConcepts(c);
      setCounts(ct);
    } catch (err) {
      showToast('Error loading concepts: ' + err.message + ' — did you run schema-problems.sql?');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = async (slug) => {
    if (expanded === slug) { setExpanded(null); return; }
    setExpanded(slug);
    try {
      setProblems(await getProblems(slug));
    } catch { setProblems([]); }
  };

  const toggleSelected = (slug) => {
    setSelected((sel) => (sel.includes(slug) ? sel.filter((s) => s !== slug) : [...sel, slug]));
  };

  const handleState = async (slug, state) => {
    try {
      const updated = await setConceptState(slug, state);
      setConcepts(concepts.map((c) => (c.slug === slug ? updated : c)));
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  };

  const notifyGenerated = (inserted) => {
    const withDiagrams = inserted.filter((p) => p.diagram_asy && !p.diagram_svg).length;
    showToast(
      `Generated ${inserted.length} problem${inserted.length === 1 ? '' : 's'}` +
        (withDiagrams > 0 ? ` — ${withDiagrams} need${withDiagrams === 1 ? 's' : ''} diagram compile (npm script)` : '')
    );
  };

  const handleGenerate = async (concept) => {
    setGenerating((g) => ({ ...g, [concept.slug]: true }));
    try {
      const inserted = await generateProblemsForConcept(concept, { count: 2 });
      notifyGenerated(inserted);
      setCounts(await getProblemCounts());
      if (expanded === concept.slug) setProblems(await getProblems(concept.slug));
    } catch (err) {
      showToast('Error: ' + err.message);
    } finally {
      setGenerating((g) => ({ ...g, [concept.slug]: false }));
    }
  };

  const handleDeleteProblem = async (id) => {
    if (!confirm('Delete this problem?')) return;
    try {
      await deleteProblem(id);
      setProblems(problems.filter((p) => p.id !== id));
      setCounts(await getProblemCounts());
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="screen">
        <header className="header">
          <button className="btn-icon" onClick={() => navigate('home')}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <h1 className="header-title">Problems</h1>
          <div style={{ width: 36 }} />
        </header>
        <div className="center-message">Loading...</div>
      </div>
    );
  }

  const bySlug = Object.fromEntries(concepts.map((c) => [c.slug, c]));
  const due = duePool(concepts);
  // Dry-run session preview (assume fresh problems exist where counts say so)
  const freshStub = {};
  for (const c of due) if ((counts[c.slug]?.fresh || 0) > 0) freshStub[c.slug] = [{ difficulty: 1 }];
  const preview = buildSession(concepts, freshStub);

  return (
    <div className="screen">
      <header className="header">
        <button className="btn-icon" onClick={() => navigate('home')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1 className="header-title">Problems</h1>
        <button className="btn btn-sm btn-secondary" onClick={() => navigate('history')}>History</button>
      </header>

      <div className="session-card">
        <div className="session-card-info">
          <div className="session-card-title">
            {due.length === 0 ? 'Nothing due' : `${due.length} concept${due.length === 1 ? '' : 's'} due`}
          </div>
          {preview.entries.length > 0 && (
            <div className="session-card-sub">
              Session ready: {preview.entries.length} problem{preview.entries.length === 1 ? '' : 's'} covering{' '}
              {preview.entries.length + preview.entries.reduce((n, e) => n + e.covered.length, 0)} concepts
              {preview.toGenerate > 0 && ` · ${preview.toGenerate} AI-generated at start`}
            </div>
          )}
        </div>
        <button
          className="btn btn-primary"
          disabled={preview.entries.length === 0}
          onClick={() => navigate('problemSession')}
        >
          Start Session
        </button>
      </div>

      <div className="topic-toolbar">
        <button
          className={`btn btn-sm ${selectMode ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setSelectMode(!selectMode); if (selectMode) setSelected([]); }}
        >
          {selectMode ? 'Cancel selection' : 'Choose topics for a session'}
        </button>
        {selectMode && (
          <span className="session-note" style={{ margin: 0 }}>
            Tap topics to select them, then start below.
          </span>
        )}
      </div>

      <p className="session-note">
        Sessions pull from the problem bank instantly and only generate with AI when a topic's
        bank is empty. Tap a topic to expand it — practice it directly, adjust its state, or
        pre-generate problems.
      </p>

      {SECTIONS.map(({ bucket, section, slugs }) => (
        <div key={bucket + section} className="concept-section">
          <h2 className="concept-section-title">
            <span className="concept-bucket">{bucket}</span> {section}
          </h2>
          {slugs.map((slug) => {
            const c = bySlug[slug];
            if (!c) return null;
            const meta = STATE_META[c.state] || STATE_META.unknown;
            const fresh = counts[slug]?.fresh || 0;
            const isOpen = expanded === slug;
            const isSelected = selected.includes(slug);
            return (
              <div key={slug} className={`concept-row ${isOpen ? 'open' : ''} ${selectMode && isSelected ? 'concept-selected' : ''}`}>
                <div className="concept-row-main" onClick={() => (selectMode ? toggleSelected(slug) : toggleExpand(slug))}>
                  <div className="concept-row-left">
                    {selectMode && <span className={`select-dot ${isSelected ? 'select-dot-on' : ''}`}>{isSelected ? '✓' : ''}</span>}
                    <span className={`chip ${meta.cls}`}>{meta.label}</span>
                    <span className="concept-name">{c.name}</span>
                  </div>
                  <div className="concept-row-right">
                    <span className={`concept-due ${dueLabel(c) === 'due now' ? 'concept-due-now' : ''}`}>{dueLabel(c)}</span>
                    <span className={`concept-fresh ${fresh === 0 ? 'concept-fresh-zero' : ''}`}>{fresh} fresh</span>
                  </div>
                </div>
                {isOpen && (
                  <div className="concept-detail">
                    {c.scope && <p className="concept-scope">{c.scope}</p>}
                    <div className="concept-tags">
                      {(c.styles || []).map((s) => <span key={s} className="tag">{s}</span>)}
                    </div>
                    <div className="state-setter">
                      <span className="state-setter-label">Set state:</span>
                      {['retained', 'shaky', 'forgotten', 'unknown'].map((s) => (
                        <button
                          key={s}
                          className={`chip chip-btn ${STATE_META[s].cls} ${c.state === s ? 'chip-active' : ''}`}
                          onClick={() => handleState(slug, s)}
                        >
                          {STATE_META[s].label}
                        </button>
                      ))}
                    </div>
                    {c.interval_days && (
                      <div className="concept-sched-info">
                        interval {Math.round(c.interval_days)}d · strength {c.strength}
                      </div>
                    )}
                    <div className="concept-actions">
                      <button className="btn btn-sm btn-practice" onClick={() => navigate('practice', { concept: c })}>
                        &#9654; Practice this topic
                      </button>
                      <button
                        className="btn btn-sm btn-ai"
                        disabled={!!generating[slug]}
                        onClick={() => handleGenerate(c)}
                      >
                        {generating[slug] ? 'Generating…' : '✦ Generate 2 with AI'}
                      </button>
                      <button className="btn btn-sm btn-primary" onClick={() => navigate('problemForm', { conceptSlug: slug })}>
                        + Add manually
                      </button>
                    </div>
                    {problems.length > 0 && (
                      <div className="problem-list">
                        {problems.map((p) => (
                          <div key={p.id} className={`problem-list-row ${p.status === 'used' ? 'problem-used' : ''}`}>
                            <div className="problem-list-text" onClick={() => navigate('problemForm', { conceptSlug: slug, problem: p })}>
                              <span className="problem-list-status">{p.status === 'fresh' ? '●' : '○'}</span>
                              {p.statement.slice(0, 80)}
                            </div>
                            <button className="btn-icon btn-sm btn-danger" onClick={() => handleDeleteProblem(p.id)}>
                              <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M5 6h10M8 6V4h4v2M6 6v10a1 1 0 001 1h6a1 1 0 001-1V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {selectMode && selected.length > 0 && (
        <div className="select-bar">
          <span className="select-bar-count">{selected.length} topic{selected.length === 1 ? '' : 's'} selected</span>
          <button className="btn btn-sm btn-secondary" onClick={() => setSelected([])}>Clear</button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => navigate('problemSession', { slugs: selected })}
          >
            Start session
          </button>
        </div>
      )}
    </div>
  );
}
