import { useState, useEffect, useCallback } from 'react';
import {
  ensureConceptsSeeded,
  getConcepts,
  getProblemCounts,
  setConceptState,
  getProblems,
  deleteProblem,
} from '../lib/problems-api.js';
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

  const handleState = async (slug, state) => {
    try {
      const updated = await setConceptState(slug, state);
      setConcepts(concepts.map((c) => (c.slug === slug ? updated : c)));
    } catch (err) {
      showToast('Error: ' + err.message);
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
        <div style={{ width: 36 }} />
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
            </div>
          )}
          {preview.missing.length > 0 && (
            <div className="session-card-warn">
              No fresh problems for: {preview.missing.map((s) => bySlug[s]?.name || s).join(', ')}
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

      <p className="session-note">
        First time: classify what you remember — tap a state on each concept (that's the diagnostic).
        Retained → 30d, Shaky → 7d, Forgotten → due now with a refresher.
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
            return (
              <div key={slug} className={`concept-row ${isOpen ? 'open' : ''}`}>
                <div className="concept-row-main" onClick={() => toggleExpand(slug)}>
                  <div className="concept-row-left">
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
                    <button className="btn btn-sm btn-primary" style={{ marginTop: 10 }} onClick={() => navigate('problemForm', { conceptSlug: slug })}>
                      + Add problem
                    </button>
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
    </div>
  );
}
